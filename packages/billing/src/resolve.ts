import {
  comparePlans,
  FEATURE_KEYS,
  type FeatureKey,
  type LimitKey,
  mergeLimits,
  PLANS,
  type PlanCode,
  type PlanLimits,
  UNLIMITED_LIMITS,
} from './catalog'

/** Grace for a previously paid renewal that failed. */
export const PAYMENT_GRACE_MS = 7 * 24 * 60 * 60 * 1000
/** How long a verified entitlement survives a missed refresh before degrading. */
export const OUTAGE_TOLERANCE_MS = 24 * 60 * 60 * 1000

/**
 * Stripe subscription statuses that the projection can carry. Kept as strings
 * so the pure policy has no dependency on the Stripe SDK.
 */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'

export interface SubscriptionEvidence {
  status: SubscriptionStatus
  /** Plan mapped from the allowlisted Price; null means an unknown Price. */
  planCode: PlanCode | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  /**
   * Scheduled cancellation instant. Stripe's flexible billing mode records a
   * Portal cancellation here (with cancelAtPeriodEnd false).
   */
  cancelAt?: Date | null
  trialEnd: Date | null
  /** Latest invoice for the current price is paid (or zero-amount and validated). */
  latestInvoicePaid: boolean | null
  /** First time the projection observed `past_due`/`unpaid` for this failure. */
  pastDueSince: Date | null
  collectionMethod: 'charge_automatically' | 'send_invoice'
  /** Payment collection paused by an operator; distinct from a paused subscription. */
  pauseCollection: boolean
}

export interface EntitlementOverride {
  planCode: PlanCode
  limits?: Partial<PlanLimits> | null
  expiresAt: Date
}

export interface EntitlementInputs {
  now: Date
  /** False for desktop, self-hosted and any deployment without Cloud billing. */
  billingEnabled: boolean
  subscription: SubscriptionEvidence | null
  /** Highest plan the organization has verifiably paid for on the current subscription. */
  lastPaidPlan: PlanCode | null
  /** Beta transition grant: existing usage stays unrestricted until this instant. */
  migrationGrantExpiresAt: Date | null
  override: EntitlementOverride | null
  /** Contracted limits for Enterprise agreements. */
  contractLimits: Partial<PlanLimits> | null
  /** Last time the projection was reconciled against Stripe. */
  verifiedAt: Date | null
  /** When an unmapped Price was first observed; bounds how long the last paid plan is kept. */
  unknownPriceSince?: Date | null
}

export type EntitlementSource =
  | 'self_hosted'
  | 'free'
  | 'subscription'
  | 'trial'
  | 'payment_grace'
  | 'pending_upgrade'
  | 'migration_grant'
  | 'override'
  | 'degraded'

export type EntitlementNotice =
  | 'payment_failed'
  | 'payment_pending'
  | 'trial_ending'
  | 'cancellation_scheduled'
  | 'unknown_price'
  | 'unverified_state'
  | 'payment_collection_paused'

export interface ResolvedEntitlement {
  /** Plan whose privileges apply; `self_hosted` grants everything locally. */
  planCode: PlanCode | 'self_hosted'
  /** The plan the subscription is for, when it differs from what applies. */
  subscribedPlanCode: PlanCode | null
  source: EntitlementSource
  features: FeatureKey[]
  limits: PlanLimits
  /** True when the server could not verify billing state recently enough. */
  degraded: boolean
  graceExpiresAt: Date | null
  /** Earliest instant at which this resolution can change without new evidence. */
  reevaluateAt: Date | null
  notices: EntitlementNotice[]
}

function planEntitlement(
  planCode: PlanCode,
  source: EntitlementSource,
  contractLimits: Partial<PlanLimits> | null
): Pick<ResolvedEntitlement, 'planCode' | 'source' | 'features' | 'limits'> {
  const plan = PLANS[planCode]
  return {
    planCode,
    source,
    features: [...plan.features],
    limits:
      planCode === 'enterprise' ? mergeLimits(plan.limits, contractLimits) : { ...plan.limits },
  }
}

function earliest(...dates: Array<Date | null | undefined>): Date | null {
  let result: Date | null = null
  for (const date of dates) {
    if (!date) continue
    if (!result || date.getTime() < result.getTime()) result = date
  }
  return result
}

function future(date: Date | null, now: Date): Date | null {
  return date && date.getTime() > now.getTime() ? date : null
}

/**
 * Resolve what an organization may use right now from verified evidence.
 *
 * The function is pure: the caller supplies every input including `now`, so
 * the lifecycle table in the pricing plan maps one-to-one onto tests.
 */
export function resolveEntitlement(input: EntitlementInputs): ResolvedEntitlement {
  const { now } = input

  if (!input.billingEnabled) {
    return {
      planCode: 'self_hosted',
      subscribedPlanCode: null,
      source: 'self_hosted',
      features: [...FEATURE_KEYS],
      limits: { ...UNLIMITED_LIMITS },
      degraded: false,
      graceExpiresAt: null,
      reevaluateAt: null,
      notices: [],
    }
  }

  const base = resolveFromSubscription(input)
  const overrideExpiry = future(input.override?.expiresAt ?? null, now)
  const grantExpiry = future(input.migrationGrantExpiresAt, now)

  if (input.override && overrideExpiry) {
    const plan = PLANS[input.override.planCode]
    return {
      ...base,
      planCode: input.override.planCode,
      source: 'override',
      features: [...plan.features],
      limits: mergeLimits(
        input.override.planCode === 'enterprise'
          ? mergeLimits(plan.limits, input.contractLimits)
          : plan.limits,
        input.override.limits
      ),
      degraded: false,
      reevaluateAt: earliest(overrideExpiry, base.reevaluateAt),
    }
  }

  if (grantExpiry) {
    // The beta grant keeps existing usage unrestricted during the notice
    // period, whatever the organization has purchased in the meantime.
    return {
      ...base,
      planCode: base.planCode === 'self_hosted' ? 'business' : base.planCode,
      source: 'migration_grant',
      features: [...FEATURE_KEYS],
      limits: { ...UNLIMITED_LIMITS, 'history.redis_health_days': 30 },
      degraded: false,
      reevaluateAt: earliest(grantExpiry, base.reevaluateAt),
    }
  }

  return base
}

function resolveFromSubscription(input: EntitlementInputs): ResolvedEntitlement {
  const { now, subscription: sub, contractLimits } = input
  const notices: EntitlementNotice[] = []
  const free = (extra: Partial<ResolvedEntitlement> = {}): ResolvedEntitlement => ({
    ...planEntitlement('free', 'free', null),
    subscribedPlanCode: sub?.planCode ?? null,
    degraded: false,
    graceExpiresAt: null,
    reevaluateAt: null,
    notices,
    ...extra,
  })

  if (!sub) return free()

  if (sub.planCode === null) {
    // Never grant premium access from a Price we cannot map. Keep the last
    // verified paid plan briefly so an operator can fix the mapping.
    notices.push('unknown_price')
    if (input.lastPaidPlan && input.lastPaidPlan !== 'free') {
      const toleranceEnd = new Date(
        (input.unknownPriceSince ?? now).getTime() + OUTAGE_TOLERANCE_MS
      )
      if (toleranceEnd.getTime() > now.getTime()) {
        return {
          ...planEntitlement(input.lastPaidPlan, 'degraded', contractLimits),
          subscribedPlanCode: null,
          degraded: true,
          graceExpiresAt: null,
          reevaluateAt: toleranceEnd,
          notices,
        }
      }
    }
    return free()
  }

  const planCode = sub.planCode
  const periodEnd = sub.currentPeriodEnd

  switch (sub.status) {
    case 'trialing': {
      const trialEnd = sub.trialEnd ?? periodEnd
      if (trialEnd && trialEnd.getTime() > now.getTime()) {
        if (trialEnd.getTime() - now.getTime() <= 3 * 24 * 60 * 60 * 1000) {
          notices.push('trial_ending')
        }
        return {
          ...planEntitlement(planCode, 'trial', contractLimits),
          subscribedPlanCode: planCode,
          degraded: false,
          graceExpiresAt: null,
          reevaluateAt: trialEnd,
          notices,
        }
      }
      // Trial ended and Stripe has not reported the outcome yet.
      return withOutageTolerance(input, planCode, trialEnd, notices, 'trial')
    }

    case 'active': {
      const cancellationAt = sub.cancelAt ?? (sub.cancelAtPeriodEnd ? periodEnd : null)
      if (sub.cancelAtPeriodEnd || sub.cancelAt) notices.push('cancellation_scheduled')
      if (sub.pauseCollection) notices.push('payment_collection_paused')

      if (cancellationAt && cancellationAt.getTime() <= now.getTime()) {
        // A cancellation already known to be effective is never extended.
        return free()
      }

      const lastPaid = input.lastPaidPlan
      const unpaidUpgrade =
        sub.collectionMethod === 'charge_automatically' &&
        sub.latestInvoicePaid === false &&
        lastPaid !== null &&
        comparePlans(planCode, lastPaid) > 0
      if (unpaidUpgrade) {
        notices.push('payment_pending')
        return {
          ...planEntitlement(
            lastPaid,
            lastPaid === 'free' ? 'free' : 'pending_upgrade',
            contractLimits
          ),
          subscribedPlanCode: planCode,
          degraded: false,
          graceExpiresAt: null,
          reevaluateAt: null,
          notices,
        }
      }

      if (
        sub.collectionMethod === 'charge_automatically' &&
        sub.latestInvoicePaid === false &&
        lastPaid === null
      ) {
        notices.push('payment_pending')
        // A trial that just converted is active before Stripe collects its
        // first invoice (about an hour later). Keep the trial plan for that
        // bounded window; a failed charge moves the subscription to past_due.
        const trialEnd = sub.trialEnd
        if (trialEnd && trialEnd.getTime() <= now.getTime()) {
          const conversionDeadline = new Date(trialEnd.getTime() + OUTAGE_TOLERANCE_MS)
          if (conversionDeadline.getTime() > now.getTime()) {
            return {
              ...planEntitlement(planCode, 'trial', contractLimits),
              subscribedPlanCode: planCode,
              degraded: false,
              graceExpiresAt: null,
              reevaluateAt: conversionDeadline,
              notices,
            }
          }
        }
        // Active but nothing has ever been paid: treat as a pending purchase.
        return free()
      }

      if (periodEnd && periodEnd.getTime() <= now.getTime()) {
        return withOutageTolerance(input, planCode, periodEnd, notices, 'subscription')
      }

      return {
        ...planEntitlement(planCode, 'subscription', contractLimits),
        subscribedPlanCode: planCode,
        degraded: false,
        graceExpiresAt: null,
        // Re-check at period end even without a webhook, so a Stripe outage
        // enters the bounded outage tolerance instead of extending access.
        reevaluateAt: earliest(cancellationAt, periodEnd),
        notices,
      }
    }

    case 'past_due':
    case 'unpaid': {
      notices.push('payment_failed')
      const lastPaid = input.lastPaidPlan
      if (sub.status === 'past_due' && lastPaid && lastPaid !== 'free') {
        const since = sub.pastDueSince ?? now
        const graceExpiresAt = new Date(since.getTime() + PAYMENT_GRACE_MS)
        if (graceExpiresAt.getTime() > now.getTime()) {
          return {
            ...planEntitlement(lastPaid, 'payment_grace', contractLimits),
            subscribedPlanCode: planCode,
            degraded: false,
            graceExpiresAt,
            reevaluateAt: graceExpiresAt,
            notices,
          }
        }
      }
      return free()
    }

    case 'incomplete':
      notices.push('payment_pending')
      return free()

    case 'incomplete_expired':
    case 'canceled':
    case 'paused':
      return free()

    default:
      return free()
  }
}

function withOutageTolerance(
  input: EntitlementInputs,
  planCode: PlanCode,
  boundary: Date | null,
  notices: EntitlementNotice[],
  source: 'trial' | 'subscription'
): ResolvedEntitlement {
  const { now, contractLimits } = input
  const verifiedAfterBoundary =
    boundary && input.verifiedAt && input.verifiedAt.getTime() >= boundary.getTime()
  const toleranceEnd = boundary ? new Date(boundary.getTime() + OUTAGE_TOLERANCE_MS) : null

  if (!verifiedAfterBoundary && toleranceEnd && toleranceEnd.getTime() > now.getTime()) {
    // Renewal evidence may simply not have arrived yet; keep the verified
    // entitlement for a bounded window rather than locking the customer out.
    return {
      ...planEntitlement(planCode, source, contractLimits),
      subscribedPlanCode: planCode,
      degraded: false,
      graceExpiresAt: null,
      reevaluateAt: toleranceEnd,
      notices,
    }
  }

  if (source === 'trial') {
    // A trial cannot be extended by missing evidence; it falls back to Free.
    return {
      ...planEntitlement('free', 'free', null),
      subscribedPlanCode: planCode,
      degraded: false,
      graceExpiresAt: null,
      reevaluateAt: null,
      notices,
    }
  }

  notices.push('unverified_state')
  return {
    ...planEntitlement(planCode, 'degraded', contractLimits),
    subscribedPlanCode: planCode,
    degraded: true,
    graceExpiresAt: null,
    reevaluateAt: null,
    notices,
  }
}

export function entitlementAllowsFeature(
  entitlement: Pick<ResolvedEntitlement, 'features' | 'degraded'>,
  feature: FeatureKey
): boolean {
  return entitlement.features.includes(feature)
}

export function entitlementLimit(
  entitlement: Pick<ResolvedEntitlement, 'limits'>,
  limit: LimitKey
): number | null {
  return entitlement.limits[limit]
}
