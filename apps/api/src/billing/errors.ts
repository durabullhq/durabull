import {
  type BillingStateUnverifiedBody,
  type CapacityLimitKey,
  FEATURE_LABELS,
  type FeatureKey,
  type FeatureNotEntitledBody,
  formatLimitQuantity,
  isLimitKey,
  LIMIT_LABELS,
  PLANS,
  type PlanCode,
  type PlanLimitReachedBody,
  type PlanLimitUnspecifiedBody,
  requiredPlanForFeature,
  requiredPlanForLimit,
} from '@durabull/billing'
import { parsePlanLimitDbError } from '@durabull/dal'
import { getBillingUrl } from './config'

export class FeatureNotEntitledError extends Error {
  readonly requiredPlan: PlanCode
  constructor(readonly feature: FeatureKey) {
    const requiredPlan = requiredPlanForFeature(feature)
    super(
      `${FEATURE_LABELS[feature].name} requires the ${PLANS[requiredPlan].name} plan or higher.`
    )
    this.name = 'FeatureNotEntitledError'
    this.requiredPlan = requiredPlan
  }

  toBody(): FeatureNotEntitledBody {
    return {
      error: 'Upgrade required',
      message: this.message,
      code: 'feature_not_entitled',
      feature: this.feature,
      requiredPlan: this.requiredPlan,
      billingUrl: getBillingUrl(),
    }
  }
}

export class PlanLimitReachedError extends Error {
  readonly requiredPlan: PlanCode
  constructor(
    readonly limit: CapacityLimitKey,
    readonly usage: number,
    readonly allowed: number
  ) {
    const requiredPlan = requiredPlanForLimit(limit, allowed + 1)
    const upgrade =
      requiredPlan === 'enterprise'
        ? `contact us about ${PLANS[requiredPlan].name}`
        : `upgrade to ${PLANS[requiredPlan].name}`
    super(
      allowed === 0
        ? `Your plan does not include ${LIMIT_LABELS[limit].unit}. To add one, ${upgrade}.`
        : `Your plan includes ${formatLimitQuantity(limit, allowed)} and all are in use. Free one up, or ${upgrade} for more.`
    )
    this.name = 'PlanLimitReachedError'
    this.requiredPlan = requiredPlan
  }

  toBody(): PlanLimitReachedBody {
    return {
      error: 'Plan limit reached',
      message: this.message,
      code: 'plan_limit_reached',
      limit: this.limit,
      usage: this.usage,
      allowed: this.allowed,
      requiredPlan: this.requiredPlan,
      billingUrl: getBillingUrl(),
    }
  }
}

/** Raised while the server cannot verify billing state (degraded recovery mode). */
export class BillingStateUnverifiedError extends Error {
  constructor() {
    super(
      'We could not verify this organization’s subscription. Paid changes are paused until billing state is confirmed; existing access continues.'
    )
    this.name = 'BillingStateUnverifiedError'
  }

  toBody(): BillingStateUnverifiedBody {
    return {
      error: 'Billing state unverified',
      message: this.message,
      code: 'billing_state_unverified',
      billingUrl: getBillingUrl(),
    }
  }
}

export type BillingHttpError =
  | { status: 403; body: FeatureNotEntitledBody }
  | { status: 409; body: PlanLimitReachedBody | PlanLimitUnspecifiedBody }
  | { status: 503; body: BillingStateUnverifiedBody }

/**
 * Map billing denials (including capacity-trigger rejections from the
 * database) to the documented HTTP shapes. Returns null for other errors.
 */
export function toBillingHttpError(error: unknown): BillingHttpError | null {
  if (error instanceof FeatureNotEntitledError) return { status: 403, body: error.toBody() }
  if (error instanceof PlanLimitReachedError) return { status: 409, body: error.toBody() }
  if (error instanceof BillingStateUnverifiedError) return { status: 503, body: error.toBody() }
  const violation = parsePlanLimitDbError(error)
  if (!violation) return null
  if (isLimitKey(violation.limit)) {
    // The history window is not a resource count; nothing to free up.
    if (violation.limit === 'history.redis_health_days') return null
    const limitError = new PlanLimitReachedError(
      violation.limit as CapacityLimitKey,
      violation.usage,
      violation.allowed
    )
    return { status: 409, body: limitError.toBody() }
  }
  // The trigger rejected the write but its detail could not be read. Still a
  // plan boundary, never an internal error.
  return {
    status: 409,
    body: {
      error: 'Plan limit reached',
      message: 'This organization is at a limit of its plan. Free a resource up or upgrade.',
      code: 'plan_limit_unspecified',
      billingUrl: getBillingUrl(),
    },
  }
}
