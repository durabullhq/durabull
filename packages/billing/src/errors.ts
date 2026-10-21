import {
  type CapacityLimitKey,
  type FeatureKey,
  isFeatureKey,
  isLimitKey,
  isPlanCode,
  type PlanCode,
} from './catalog'

/** Body of a 403 returned when an authenticated organization lacks a capability. */
export interface FeatureNotEntitledBody {
  error: string
  message: string
  code: 'feature_not_entitled'
  feature: FeatureKey
  requiredPlan: PlanCode
  billingUrl: string
}

/** Body of a 409 returned at a plan capacity boundary. */
export interface PlanLimitReachedBody {
  error: string
  message: string
  code: 'plan_limit_reached'
  limit: CapacityLimitKey
  usage: number
  allowed: number
  requiredPlan: PlanCode
  billingUrl: string
}

/** Body of a 503 returned while billing state cannot be verified. */
export interface BillingStateUnverifiedBody {
  error: string
  message: string
  code: 'billing_state_unverified'
  billingUrl: string
}

export type BillingErrorBody =
  | FeatureNotEntitledBody
  | PlanLimitReachedBody
  | BillingStateUnverifiedBody

export function isBillingErrorBody(value: unknown): value is BillingErrorBody {
  if (!value || typeof value !== 'object') return false
  const body = value as Record<string, unknown>
  if (body.code === 'feature_not_entitled') {
    return isFeatureKey(body.feature) && isPlanCode(body.requiredPlan)
  }
  if (body.code === 'plan_limit_reached') {
    return (
      isLimitKey(body.limit) &&
      typeof body.usage === 'number' &&
      typeof body.allowed === 'number' &&
      isPlanCode(body.requiredPlan)
    )
  }
  return body.code === 'billing_state_unverified'
}
