import { comparePlans, isPlanCode, type PlanCode } from '@durabull/billing'
import { type BillingSubscription, billingRepository } from '@durabull/dal'
import { recordBillingEvent } from './analytics'
import { getBillingConfig, type PriceMapping } from './config'
import { materializeEntitlementLocked } from './entitlements'
import { getBillingGateway, type SubscriptionSnapshot } from './gateway'

/** Statuses that represent a live base subscription, most authoritative first. */
const LIVE_STATUS_PRIORITY: Record<string, number> = {
  active: 0,
  trialing: 1,
  past_due: 2,
  unpaid: 3,
  incomplete: 4,
  paused: 5,
}

export function resolvePriceMapping(
  priceId: string | null,
  productId: string | null
): PriceMapping | null {
  const config = getBillingConfig()
  if (priceId) {
    const mapping = config.prices.get(priceId)
    if (mapping) return mapping
  }
  if (productId && config.enterpriseProductIds.has(productId)) {
    return {
      planCode: 'enterprise',
      interval: 'year',
      catalogVersion: 'contract',
      purchasable: false,
    }
  }
  return null
}

/**
 * Whether the latest invoice is payment evidence for the current price. A $0
 * invoice that only starts a trial is not evidence of a paid plan.
 */
export function invoiceCountsAsPayment(snapshot: SubscriptionSnapshot): boolean | null {
  const invoice = snapshot.latestInvoice
  if (!invoice) return null
  if (invoice.status !== 'paid') return false
  const trialStart =
    snapshot.trialEnd !== null &&
    invoice.billingReason === 'subscription_create' &&
    invoice.amountDue === 0
  return !trialStart
}

/** Choose the current base subscription: the most authoritative live one, newest first. */
export function chooseCurrentSubscription(
  snapshots: SubscriptionSnapshot[]
): SubscriptionSnapshot | null {
  const live = snapshots
    .filter((s) => s.status in LIVE_STATUS_PRIORITY)
    .sort((a, b) => {
      const priority = LIVE_STATUS_PRIORITY[a.status] - LIVE_STATUS_PRIORITY[b.status]
      return priority !== 0 ? priority : b.created.getTime() - a.created.getTime()
    })
  if (live.length > 0) return live[0] ?? null
  return [...snapshots].sort((a, b) => b.created.getTime() - a.created.getTime())[0] ?? null
}

function lastPaidPlan(
  snapshot: SubscriptionSnapshot,
  planCode: PlanCode | null,
  previous: BillingSubscription | null,
  paid: boolean | null
): string | null {
  if (paid && planCode) return planCode
  if (snapshot.collectionMethod === 'send_invoice' && planCode === 'enterprise') {
    // Invoiced contracts are governed by their agreement's due-date policy.
    return previous?.lastPaidPlanCode ?? null
  }
  const prior = previous?.lastPaidPlanCode ?? null
  // A downgrade lowers the paid ceiling even before its first invoice.
  if (prior && planCode && isPlanCode(prior) && comparePlans(planCode, prior) < 0) return planCode
  return prior
}

export interface ReconcileResult {
  organizationId: string
  currentSubscriptionId: string | null
  planCode: string
  duplicateLiveSubscriptions: number
  unmappedPrices: string[]
}

/**
 * Converge the local projection to Stripe's current state for one
 * organization. Event snapshots are never applied in delivery order; every
 * trigger re-reads the customer's subscriptions, so duplicate, delayed,
 * missing and out-of-order events all converge.
 */
export async function reconcileOrganization(
  organizationId: string,
  options: { reason: string; now?: Date } = { reason: 'manual' }
): Promise<ReconcileResult> {
  return billingRepository.withOrganizationLock(organizationId, async () => {
    const now = options.now ?? new Date()
    const account = await billingRepository.findAccount(organizationId)
    if (!account) {
      const entitlement = await materializeEntitlementLocked(organizationId, {
        reason: options.reason,
        now,
      })
      return {
        organizationId,
        currentSubscriptionId: null,
        planCode: entitlement.planCode,
        duplicateLiveSubscriptions: 0,
        unmappedPrices: [],
      }
    }

    const gateway = getBillingGateway()
    const snapshots = await gateway.listCustomerSubscriptions(account.stripeCustomerId)
    const previousCurrent = await billingRepository.findCurrentSubscription(organizationId)
    const unmappedPrices: string[] = []

    for (const snapshot of snapshots) {
      const mapping = resolvePriceMapping(snapshot.priceId, snapshot.productId)
      if (!mapping && snapshot.priceId) unmappedPrices.push(snapshot.priceId)
      const previous = await billingRepository.findSubscriptionByStripeId(snapshot.id)
      const paid = invoiceCountsAsPayment(snapshot)
      const failing = snapshot.status === 'past_due' || snapshot.status === 'unpaid'
      await billingRepository.upsertSubscription({
        organizationId,
        stripeSubscriptionId: snapshot.id,
        stripeCustomerId: snapshot.customerId || account.stripeCustomerId,
        stripePriceId: snapshot.priceId,
        stripeSubscriptionItemId: snapshot.itemId,
        planCode: mapping?.planCode ?? null,
        billingInterval: snapshot.interval ?? mapping?.interval ?? null,
        status: snapshot.status,
        collectionMethod: snapshot.collectionMethod,
        currentPeriodStart: snapshot.currentPeriodStart,
        currentPeriodEnd: snapshot.currentPeriodEnd,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        cancelAt: snapshot.cancelAt,
        canceledAt: snapshot.canceledAt,
        endedAt: snapshot.endedAt,
        trialStart: snapshot.trialStart,
        trialEnd: snapshot.trialEnd,
        pauseCollection: snapshot.pauseCollection,
        latestInvoiceId: snapshot.latestInvoice?.id ?? null,
        latestInvoiceStatus: snapshot.latestInvoice?.status ?? null,
        latestInvoicePaid: paid,
        paidThrough: paid
          ? (snapshot.currentPeriodEnd ?? previous?.paidThrough ?? null)
          : (previous?.paidThrough ?? null),
        lastPaidPlanCode: lastPaidPlan(snapshot, mapping?.planCode ?? null, previous, paid),
        // Grace is measured from the first observation of this failure.
        pastDueSince: failing ? (previous?.pastDueSince ?? now) : null,
        stripeCreatedAt: snapshot.created,
        lastReconciledAt: now,
      })
      if (snapshot.trialStart) await billingRepository.markTrialConsumed(organizationId, now)
    }

    const current = chooseCurrentSubscription(snapshots)
    await billingRepository.setCurrentSubscription(organizationId, current?.id ?? null)

    const liveCount = snapshots.filter((s) =>
      ['active', 'trialing', 'past_due', 'unpaid'].includes(s.status)
    ).length
    if (liveCount > 1) {
      console.error(
        `[billing] ALERT organization ${organizationId} has ${liveCount} live base subscriptions; refund or cancel duplicates in Stripe.`
      )
    }
    if (unmappedPrices.length > 0) {
      console.error(
        `[billing] ALERT organization ${organizationId} has unmapped Stripe Prices: ${unmappedPrices.join(', ')}`
      )
    }

    // A purchase attempt is complete once Stripe reports its subscription.
    const openAttempt = await billingRepository.findOpenCheckoutAttempt(organizationId)
    if (
      openAttempt &&
      current &&
      current.created.getTime() >= openAttempt.createdAt.getTime() - 60_000
    ) {
      await billingRepository.setCheckoutAttemptStatus({ id: openAttempt.id }, 'completed')
    }

    const entitlement = await materializeEntitlementLocked(organizationId, {
      reason: options.reason,
      now,
    })

    emitLifecycleEvents(organizationId, previousCurrent, current)

    return {
      organizationId,
      currentSubscriptionId: current?.id ?? null,
      planCode: entitlement.planCode,
      duplicateLiveSubscriptions: Math.max(0, liveCount - 1),
      unmappedPrices,
    }
  })
}

function emitLifecycleEvents(
  organizationId: string,
  previous: BillingSubscription | null,
  current: SubscriptionSnapshot | null
): void {
  if (!current) return
  const mapping = resolvePriceMapping(current.priceId, current.productId)
  const plan = mapping?.planCode ?? 'unknown'
  const interval = current.interval ?? 'unknown'
  const changed = previous?.stripeSubscriptionId !== current.id
  const statusChanged = previous?.status !== current.status

  if (changed && current.status === 'trialing') {
    recordBillingEvent('trial_started', organizationId, { plan, billing_interval: interval })
  }
  if ((changed || statusChanged) && current.status === 'active') {
    recordBillingEvent('subscription_activated', organizationId, {
      plan,
      billing_interval: interval,
    })
  }
  if (statusChanged && (current.status === 'past_due' || current.status === 'unpaid')) {
    recordBillingEvent('payment_failed', organizationId, { plan })
  }
  if (statusChanged && current.status === 'canceled') {
    recordBillingEvent('subscription_canceled', organizationId, { plan })
  }
}

/** Reconcile every organization that has a Stripe Customer (scheduled sweep). */
export async function reconcileAllOrganizations(options: { reason: string }): Promise<{
  reconciled: number
  failed: number
}> {
  const accounts = await billingRepository.listAccounts()
  let reconciled = 0
  let failed = 0
  for (const account of accounts) {
    try {
      await reconcileOrganization(account.organizationId, { reason: options.reason })
      reconciled += 1
    } catch (error) {
      failed += 1
      console.error(
        `[billing] Scheduled reconciliation failed for organization ${account.organizationId}:`,
        error instanceof Error ? error.message : String(error)
      )
    }
  }
  return { reconciled, failed }
}
