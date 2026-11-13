import {
  type CapacityLimitKey,
  FEATURE_LABELS,
  type FeatureKey,
  formatLimitQuantity,
  LIMIT_LABELS,
  PLANS,
  type PlanLimitReachedBody,
  requiredPlanForFeature,
  requiredPlanForLimit,
} from '@durabull/api-client/billing'
import { ApiError, announceBillingDenial } from './api'

/** Where Enterprise and above-Business enquiries go. */
export const SALES_EMAIL = 'hello@durabull.io'

/**
 * Open the upgrade prompt for a feature the plan does not include, without a
 * round trip to the server: the control that needs it can explain itself the
 * moment it is clicked. Shows exactly what a server denial would.
 */
export function requestUpgrade(feature: FeatureKey): void {
  const requiredPlan = requiredPlanForFeature(feature)
  announceBillingDenial({
    error: 'Upgrade required',
    message: `${FEATURE_LABELS[feature].name} requires the ${PLANS[requiredPlan].name} plan or higher.`,
    code: 'feature_not_entitled',
    feature,
    requiredPlan,
    billingUrl: '',
  })
}

/**
 * Stop before a change that cannot fit the plan, with the same prompt the
 * server's 409 would produce. Returns the error to throw, so a multi-step
 * action can abort before its first step instead of failing halfway.
 */
export function limitDenial(
  limit: CapacityLimitKey,
  capacity: { used: number; limit: number | null },
  amount = 1
): ApiError {
  const allowed = capacity.limit ?? 0
  const body: PlanLimitReachedBody = {
    error: 'Plan limit reached',
    message:
      allowed === 0
        ? `Your plan does not include ${LIMIT_LABELS[limit].unit}.`
        : amount > 1
          ? `This adds ${formatLimitQuantity(limit, amount)}, but your plan includes ${formatLimitQuantity(limit, allowed)} and ${capacity.used} ${capacity.used === 1 ? 'is' : 'are'} in use.`
          : `Your plan includes ${formatLimitQuantity(limit, allowed)} and all are in use.`,
    code: 'plan_limit_reached',
    limit,
    usage: capacity.used,
    allowed,
    requiredPlan: requiredPlanForLimit(limit, capacity.used + amount),
    billingUrl: '',
  }
  announceBillingDenial(body)
  return new ApiError(body.message, 409, body)
}
