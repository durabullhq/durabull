import {
  type CapacityLimitKey,
  type CapacityUsage,
  FEATURE_KEYS,
  type FeatureKey,
  type LimitKey,
  type PlanCode,
  type PlanLimits,
  requiredPlanForFeature,
  requiredPlanForLimit,
  UNLIMITED_LIMITS,
} from './catalog'

/**
 * What an organization may use right now, as plain data. The API serializes
 * one from the materialized entitlement and the web app reads the same shape,
 * so both sides answer "can they do this?" with the functions below instead of
 * comparing plan names.
 */
export interface EntitlementSnapshot {
  /** False on desktop, self-hosted and any deployment without Cloud billing. */
  billingEnabled: boolean
  /** Denials and limits apply. False while billing is observed only (shadow, pilot). */
  enforced: boolean
  planCode: PlanCode | 'self_hosted'
  features: readonly FeatureKey[]
  limits: PlanLimits
  usage: CapacityUsage
}

/** The snapshot for deployments without Cloud billing: nothing is gated. */
export const UNRESTRICTED_ENTITLEMENT: EntitlementSnapshot = {
  billingEnabled: false,
  enforced: false,
  planCode: 'self_hosted',
  features: FEATURE_KEYS,
  limits: UNLIMITED_LIMITS,
  usage: {},
}

export interface FeatureAccess {
  allowed: boolean
  /** Lowest plan that includes the feature; null when it is already allowed. */
  requiredPlan: PlanCode | null
}

export interface CapacityAccess {
  /** Null when the resource is not capped. */
  limit: number | null
  used: number
  /** Null when not capped; never negative. */
  remaining: number | null
  /** No room for one more. */
  atLimit: boolean
  /** Existing usage is above the limit (after a downgrade). */
  overLimit: boolean
  /** Lowest plan with room for one more; null when there is room now. */
  requiredPlan: PlanCode | null
}

export interface EntitlementAccess {
  snapshot: EntitlementSnapshot
  /** Whether plan rules restrict this organization at all. */
  restricted: boolean
  can(feature: FeatureKey): boolean
  feature(feature: FeatureKey): FeatureAccess
  capacity(limit: CapacityLimitKey): CapacityAccess
  /** Whether `amount` more of a capped resource fits. */
  canAdd(limit: CapacityLimitKey, amount?: number): boolean
  /** A numeric limit, or null when the plan does not cap it. */
  limit(limit: LimitKey): number | null
}

/**
 * Answer feature and capacity questions from a snapshot. Unenforced
 * organizations are never restricted, matching what the server would do with
 * the same request.
 */
export function createEntitlementAccess(snapshot: EntitlementSnapshot): EntitlementAccess {
  const restricted = snapshot.billingEnabled && snapshot.enforced
  const can = (feature: FeatureKey) => !restricted || snapshot.features.includes(feature)
  const limitOf = (limit: LimitKey) => (restricted ? snapshot.limits[limit] : null)

  const capacity = (limit: CapacityLimitKey): CapacityAccess => {
    const allowed = limitOf(limit)
    const used = snapshot.usage[limit] ?? 0
    if (allowed === null) {
      return {
        limit: null,
        used,
        remaining: null,
        atLimit: false,
        overLimit: false,
        requiredPlan: null,
      }
    }
    const atLimit = used >= allowed
    return {
      limit: allowed,
      used,
      remaining: Math.max(0, allowed - used),
      atLimit,
      overLimit: used > allowed,
      requiredPlan: atLimit ? requiredPlanForLimit(limit, used + 1) : null,
    }
  }

  return {
    snapshot,
    restricted,
    can,
    feature: (feature) => {
      const allowed = can(feature)
      return { allowed, requiredPlan: allowed ? null : requiredPlanForFeature(feature) }
    },
    capacity,
    canAdd: (limit, amount = 1) => {
      const allowed = limitOf(limit)
      return allowed === null || (snapshot.usage[limit] ?? 0) + amount <= allowed
    },
    limit: limitOf,
  }
}
