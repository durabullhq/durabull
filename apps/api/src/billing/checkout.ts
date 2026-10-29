import { randomUUID } from 'node:crypto'
import {
  type BillingInterval,
  LIVE_SUBSCRIPTION_STATUSES,
  type PurchasablePlanCode,
  type SubscriptionStatus,
} from '@durabull/billing'
import { billingRepository } from '@durabull/dal'
import { recordBillingEvent } from './analytics'
import { getBillingConfig, TRIAL_PERIOD_DAYS } from './config'
import { getBillingGateway } from './gateway'
import { reconcileOrganization } from './reconcile'

const CHECKOUT_TTL_MS = 30 * 60 * 1000
/** Abuse control: one person can start trials for at most this many organizations. */
export const MAX_TRIALS_PER_USER = 2

export type CheckoutRefusal =
  | 'purchases_paused'
  | 'price_unavailable'
  | 'subscription_exists'
  | 'trials_unavailable'
  | 'trial_not_eligible'
  | 'email_unverified'

export class CheckoutRefusedError extends Error {
  constructor(
    readonly reason: CheckoutRefusal,
    message: string
  ) {
    super(message)
    this.name = 'CheckoutRefusedError'
  }
}

export interface StartCheckoutInput {
  organizationId: string
  organizationName: string
  organizationSlug: string
  user: { id: string; email: string; emailVerified: boolean }
  planCode: PurchasablePlanCode
  interval: BillingInterval
  trial: boolean
}

function billingPageUrl(slug: string, query: string): string {
  return `${getBillingConfig().appBaseUrl}/${encodeURIComponent(slug)}/settings/billing?${query}`
}

/**
 * Create (or reuse) the organization's single hosted Checkout attempt. The
 * browser return never grants access; only reconciled Stripe state does.
 */
export async function startCheckout(
  input: StartCheckoutInput
): Promise<{ url: string; reused: boolean }> {
  const config = getBillingConfig()
  if (!config.purchasesEnabled) {
    throw new CheckoutRefusedError(
      'purchases_paused',
      'New purchases are temporarily paused. Please try again later.'
    )
  }
  const priceId = config.purchasePrices[input.planCode]?.[input.interval]
  if (!priceId) {
    throw new CheckoutRefusedError('price_unavailable', 'That plan is not available for purchase.')
  }

  // Converge with Stripe first when we already have a customer, so an
  // uncertain local record never leads to a second subscription.
  const existingAccount = await billingRepository.findAccount(input.organizationId)
  if (existingAccount) {
    await reconcileOrganization(input.organizationId, { reason: 'checkout_preflight' })
  }

  return billingRepository.withOrganizationLock(input.organizationId, async () => {
    const current = await billingRepository.findCurrentSubscription(input.organizationId)
    if (current && LIVE_SUBSCRIPTION_STATUSES.has(current.status as SubscriptionStatus)) {
      throw new CheckoutRefusedError(
        'subscription_exists',
        'This organization already has a subscription. Use Manage billing to change plans.'
      )
    }

    let account = existingAccount ?? (await billingRepository.findAccount(input.organizationId))

    let trialDays: number | null = null
    if (input.trial) {
      if (!config.trialsEnabled) {
        throw new CheckoutRefusedError('trials_unavailable', 'Trials are not available right now.')
      }
      if (input.planCode !== 'business') {
        throw new CheckoutRefusedError(
          'trial_not_eligible',
          'The free trial is for the Business plan.'
        )
      }
      if (!input.user.emailVerified) {
        throw new CheckoutRefusedError(
          'email_unverified',
          'Verify your email address before starting a trial.'
        )
      }
      const history = await billingRepository.listSubscriptions(input.organizationId)
      const userTrials = await billingRepository.countTrialsStartedByUser(input.user.id)
      if (account?.trialConsumedAt || history.length > 0 || userTrials >= MAX_TRIALS_PER_USER) {
        throw new CheckoutRefusedError(
          'trial_not_eligible',
          'This organization is not eligible for another trial. You can subscribe directly.'
        )
      }
      trialDays = TRIAL_PERIOD_DAYS
    }

    const open = await billingRepository.findOpenCheckoutAttempt(input.organizationId)
    if (open) {
      const reusable =
        open.expiresAt.getTime() > Date.now() + 60_000 &&
        open.stripePriceId === priceId &&
        open.trial === (trialDays !== null) &&
        open.url
      if (reusable && open.url) return { url: open.url, reused: true }
      if ((await closeOpenAttempt(open)) === 'completed') {
        // The previous session completed while this request was starting a
        // new one; its subscription arrives through reconciliation.
        throw new CheckoutRefusedError(
          'subscription_exists',
          'A purchase for this organization just completed. Refresh to see your plan.'
        )
      }
    }

    const gateway = getBillingGateway()
    if (!account) {
      const customer = await gateway.createCustomer({
        organizationId: input.organizationId,
        organizationName: input.organizationName,
        email: input.user.email,
        // Stable key: retries and concurrent owners reuse one Customer.
        idempotencyKey: `durabull-customer-${input.organizationId}`,
      })
      account = await billingRepository.bindAccount({
        organizationId: input.organizationId,
        stripeCustomerId: customer.id,
        livemode: customer.livemode,
        billingContactUserId: input.user.id,
      })
    }

    const expiresAt = new Date(Date.now() + CHECKOUT_TTL_MS)
    const idempotencyKey = randomUUID()
    const attempt = await billingRepository.createCheckoutAttempt({
      organizationId: input.organizationId,
      createdByUserId: input.user.id,
      planCode: input.planCode,
      billingInterval: input.interval,
      stripePriceId: priceId,
      trial: trialDays !== null,
      idempotencyKey,
      expiresAt,
    })
    if (!attempt) {
      throw new CheckoutRefusedError(
        'subscription_exists',
        'Another purchase for this organization is already in progress.'
      )
    }

    try {
      const session = await gateway.createCheckoutSession({
        customerId: account.stripeCustomerId,
        priceId,
        organizationId: input.organizationId,
        attemptId: attempt.id,
        trialDays,
        successUrl: billingPageUrl(
          input.organizationSlug,
          'checkout=success&session_id={CHECKOUT_SESSION_ID}'
        ),
        cancelUrl: billingPageUrl(input.organizationSlug, 'checkout=canceled'),
        expiresAt,
        idempotencyKey,
      })
      await billingRepository.attachCheckoutSession(attempt.id, session.id, session.url)
      if (!session.url) throw new Error('Stripe did not return a Checkout URL.')
      recordBillingEvent('checkout_started', input.organizationId, {
        plan: input.planCode,
        billing_interval: input.interval,
        trial: trialDays !== null,
      })
      return { url: session.url, reused: false }
    } catch (error) {
      await billingRepository.setCheckoutAttemptStatus({ id: attempt.id }, 'failed')
      throw error
    }
  })
}

/**
 * Targeted refresh after the customer returns from Checkout. The session must
 * belong to this organization; access still comes only from reconciliation.
 */
export async function confirmCheckoutReturn(
  organizationId: string,
  sessionId: string
): Promise<{ status: 'complete' | 'open' | 'expired' | 'unknown' }> {
  const attempt = await billingRepository.findCheckoutAttemptBySession(sessionId)
  if (!attempt || attempt.organizationId !== organizationId) return { status: 'unknown' }
  const session = await getBillingGateway().retrieveCheckoutSession(sessionId)
  if (!session || session.organizationId !== organizationId) return { status: 'unknown' }
  if (session.status === 'expired') {
    await billingRepository.setCheckoutAttemptStatus({ id: attempt.id }, 'expired')
    return { status: 'expired' }
  }
  if (session.status === 'complete') {
    await reconcileOrganization(organizationId, { reason: 'checkout_return' })
    recordBillingEvent('checkout_completed', organizationId, {
      plan: attempt.planCode,
      billing_interval: attempt.billingInterval,
      trial: attempt.trial,
    })
  }
  return { status: session.status }
}

type OpenCheckoutAttempt = NonNullable<
  Awaited<ReturnType<typeof billingRepository.findOpenCheckoutAttempt>>
>

/**
 * Close an open attempt. Expiring first closes the race with a customer who is
 * completing the session right now: afterwards the session is either expired
 * (and can no longer complete) or already complete. Call with the
 * organization lock held.
 */
async function closeOpenAttempt(open: OpenCheckoutAttempt): Promise<'closed' | 'completed'> {
  if (open.stripeSessionId) {
    const gateway = getBillingGateway()
    await gateway.expireCheckoutSession(open.stripeSessionId)
    const session = await gateway.retrieveCheckoutSession(open.stripeSessionId)
    if (session?.status === 'complete') {
      await billingRepository.setCheckoutAttemptStatus({ id: open.id }, 'completed')
      return 'completed'
    }
  }
  await billingRepository.setCheckoutAttemptStatus({ id: open.id }, 'expired')
  return 'closed'
}

/**
 * The customer came back from Checkout without paying. Close the attempt so
 * the page stops waiting for a confirmation that will never arrive.
 */
export async function cancelCheckoutAttempt(
  organizationId: string
): Promise<{ status: 'canceled' | 'complete' | 'none' }> {
  const result = await billingRepository.withOrganizationLock(organizationId, async () => {
    const open = await billingRepository.findOpenCheckoutAttempt(organizationId)
    if (!open) return 'none' as const
    return (await closeOpenAttempt(open)) === 'completed'
      ? ('complete' as const)
      : ('canceled' as const)
  })
  if (result === 'complete') {
    await reconcileOrganization(organizationId, { reason: 'checkout_return' })
  }
  return { status: result }
}

/** Short-lived hosted Customer Portal session for this organization. */
export async function createPortalSession(
  organizationId: string,
  organizationSlug: string
): Promise<{ url: string }> {
  const account = await billingRepository.findAccount(organizationId)
  if (!account) {
    throw new CheckoutRefusedError(
      'price_unavailable',
      'This organization has no billing account yet.'
    )
  }
  return getBillingGateway().createPortalSession({
    customerId: account.stripeCustomerId,
    returnUrl: billingPageUrl(organizationSlug, 'portal=returned'),
  })
}

/** Expire abandoned attempts so a new purchase can start. */
export async function expireStaleCheckoutAttempts(now = new Date()): Promise<number> {
  const stale = await billingRepository.listExpiredCheckoutAttempts(now)
  for (const attempt of stale) {
    if (attempt.stripeSessionId) {
      const session = await getBillingGateway().retrieveCheckoutSession(attempt.stripeSessionId)
      if (session?.status === 'complete') {
        await reconcileOrganization(attempt.organizationId, { reason: 'checkout_sweep' })
        continue
      }
      if (session?.status === 'open') await getBillingGateway().expireCheckoutSession(session.id)
    }
    await billingRepository.setCheckoutAttemptStatus({ id: attempt.id }, 'expired')
  }
  return stale.length
}
