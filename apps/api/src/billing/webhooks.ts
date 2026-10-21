import { billingRepository } from '@durabull/dal'
import { getBillingGateway } from './gateway'
import { reconcileOrganization } from './reconcile'

/**
 * Events the webhook endpoint must be subscribed to. Reconciliation, not any
 * single event name, determines access; these only tell us when to look.
 */
export const STRIPE_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.expired',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.trial_will_end',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.finalization_failed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
] as const

/** Events that need human review in addition to reconciliation. */
const OPERATIONAL_REVIEW_EVENTS = new Set([
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
  'invoice.finalization_failed',
])

export const WEBHOOK_MAX_ATTEMPTS = 10
const WEBHOOK_STALE_CLAIM_MS = 5 * 60 * 1000

export class WebhookSignatureError extends Error {
  constructor() {
    super('Invalid Stripe signature.')
    this.name = 'WebhookSignatureError'
  }
}

/**
 * Verify a Stripe-signed raw request and record it durably. Returns quickly so
 * Stripe gets a prompt acknowledgement; processing happens in the worker.
 */
export async function receiveStripeWebhook(
  rawBody: string,
  signature: string | null | undefined
): Promise<{ eventId: string; duplicate: boolean }> {
  if (!signature) throw new WebhookSignatureError()
  let event: Awaited<ReturnType<ReturnType<typeof getBillingGateway>['constructWebhookEvent']>>
  try {
    event = await getBillingGateway().constructWebhookEvent(rawBody, signature)
  } catch {
    throw new WebhookSignatureError()
  }
  const inserted = await billingRepository.recordWebhookEvent({
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    stripeObjectId: event.objectId,
    stripeCustomerId: event.customerId,
    stripeCreatedAt: event.created,
  })
  return { eventId: event.id, duplicate: !inserted }
}

function backoffMs(attempts: number): number {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempts - 1))
}

/** Process claimed inbox rows. Safe to run concurrently on several replicas. */
export async function processWebhookInbox(options: { limit?: number; now?: Date } = {}): Promise<{
  processed: number
  failed: number
}> {
  const now = options.now ?? new Date()
  const events = await billingRepository.claimWebhookEvents({
    now,
    limit: options.limit ?? 25,
    staleClaimMs: WEBHOOK_STALE_CLAIM_MS,
  })
  let processed = 0
  let failed = 0

  for (const event of events) {
    try {
      if (event.type === 'checkout.session.expired' && event.stripeObjectId) {
        await billingRepository.setCheckoutAttemptStatus(
          { stripeSessionId: event.stripeObjectId },
          'expired'
        )
      }

      if (!event.stripeCustomerId) {
        // Nothing to reconcile (for example an event about a deleted object).
        await billingRepository.markWebhookProcessed(event.id, null)
        processed += 1
        continue
      }

      // Organization is resolved only through the immutable customer binding;
      // metadata in the event is never trusted on its own.
      const account = await billingRepository.findAccountByCustomerId(event.stripeCustomerId)
      if (!account) {
        throw new Error(`No organization is bound to Stripe customer ${event.stripeCustomerId}.`)
      }

      if (OPERATIONAL_REVIEW_EVENTS.has(event.type)) {
        console.warn(
          `[billing] REVIEW ${event.type} for organization ${account.organizationId} (event ${event.id}). A refund does not by itself cancel the subscription.`
        )
      }

      await reconcileOrganization(account.organizationId, { reason: event.type })
      await billingRepository.markWebhookProcessed(event.id, account.organizationId)
      processed += 1
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : String(error)
      const exhausted = event.attempts >= WEBHOOK_MAX_ATTEMPTS
      await billingRepository.markWebhookFailed(event.id, {
        error: message,
        nextAttemptAt: exhausted ? null : new Date(now.getTime() + backoffMs(event.attempts)),
      })
      const level = exhausted ? 'ALERT dead-lettered' : 'will retry'
      console.error(`[billing] Webhook ${event.id} (${event.type}) failed, ${level}: ${message}`)
    }
  }

  return { processed, failed }
}
