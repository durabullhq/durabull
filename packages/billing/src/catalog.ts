/**
 * Durabull Cloud commercial catalog.
 *
 * This file is the single source of truth for plan names, list prices,
 * feature gates and numeric limits. The API derives every entitlement decision
 * from it, the web app renders usage against it, and the marketing pricing page
 * reads its prices so published copy cannot drift from enforcement.
 *
 * Changing a plan's privileges is a commercial change: bump
 * `BILLING_CATALOG_VERSION`, create new Stripe Price versions for any price
 * change, and keep existing Price IDs mapped for current subscribers.
 */

export const BILLING_CATALOG_VERSION = '2026-10-20'

export const PLAN_CODES = ['free', 'team', 'business', 'enterprise'] as const
export type PlanCode = (typeof PLAN_CODES)[number]

/** Self-serve plans that can be purchased through hosted Checkout. */
export const PURCHASABLE_PLAN_CODES = ['team', 'business'] as const
export type PurchasablePlanCode = (typeof PURCHASABLE_PLAN_CODES)[number]

export const BILLING_INTERVALS = ['month', 'year'] as const
export type BillingInterval = (typeof BILLING_INTERVALS)[number]

/**
 * Boolean capabilities. Keys describe what the customer can do, never which
 * plan they are on, so route handlers never compare plan names.
 */
export const FEATURE_KEYS = [
  'jobs.bulk_recovery',
  'mcp.write',
  'automation.service_accounts',
  'alerts.webhook',
  'alerts.linear',
] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

/** Numeric limits. `null` means the deployment does not cap the resource. */
export const LIMIT_KEYS = [
  'connections.enabled',
  'members.reserved',
  'alerts.enabled',
  'alerts.destinations',
  'service_accounts.enabled',
  'history.redis_health_days',
] as const
export type LimitKey = (typeof LIMIT_KEYS)[number]

/** Limits that count stored resources and therefore take part in capacity reservation. */
export const CAPACITY_LIMIT_KEYS = [
  'connections.enabled',
  'members.reserved',
  'alerts.enabled',
  'alerts.destinations',
  'service_accounts.enabled',
] as const satisfies readonly LimitKey[]
export type CapacityLimitKey = (typeof CAPACITY_LIMIT_KEYS)[number]

export type PlanLimits = Record<LimitKey, number | null>

export interface PlanDefinition {
  code: PlanCode
  name: string
  description: string
  /** Ordering used for upgrade/downgrade comparisons. */
  rank: number
  /** List price in whole US dollars, before tax. `null` for contract pricing. */
  monthlyPriceUsd: number | null
  annualPriceUsd: number | null
  selfServe: boolean
  features: readonly FeatureKey[]
  limits: PlanLimits
  support: string
}

const ALL_FEATURES = FEATURE_KEYS

export const PLANS: Record<PlanCode, PlanDefinition> = {
  free: {
    code: 'free',
    name: 'Free',
    description: 'One developer inspecting one production Redis database.',
    rank: 0,
    monthlyPriceUsd: 0,
    annualPriceUsd: 0,
    selfServe: true,
    features: [],
    limits: {
      'connections.enabled': 1,
      'members.reserved': 1,
      'alerts.enabled': 3,
      'alerts.destinations': 1,
      'service_accounts.enabled': 0,
      'history.redis_health_days': 1,
    },
    support: 'Community and documentation',
  },
  team: {
    code: 'team',
    name: 'Team',
    description: 'Shared operations across your environments for one team price.',
    rank: 1,
    monthlyPriceUsd: 9,
    annualPriceUsd: 90,
    selfServe: true,
    features: ALL_FEATURES,
    limits: {
      'connections.enabled': 5,
      'members.reserved': 10,
      'alerts.enabled': 15,
      'alerts.destinations': 5,
      'service_accounts.enabled': 1,
      'history.redis_health_days': 14,
    },
    support: 'Email, best effort',
  },
  business: {
    code: 'business',
    name: 'Business',
    description: 'More databases, people, automation and history.',
    rank: 2,
    monthlyPriceUsd: 29,
    annualPriceUsd: 290,
    selfServe: true,
    features: ALL_FEATURES,
    limits: {
      'connections.enabled': 15,
      'members.reserved': 50,
      'alerts.enabled': 100,
      'alerts.destinations': 20,
      'service_accounts.enabled': 5,
      'history.redis_health_days': 30,
    },
    support: 'Priority email, target 2 business days',
  },
  enterprise: {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Contracted capacity and procurement support on shared Cloud.',
    rank: 3,
    monthlyPriceUsd: null,
    annualPriceUsd: null,
    selfServe: false,
    features: ALL_FEATURES,
    // Starting scope; each agreement can raise these through contract limits.
    limits: {
      'connections.enabled': 30,
      'members.reserved': 100,
      'alerts.enabled': 250,
      'alerts.destinations': 50,
      'service_accounts.enabled': 25,
      'history.redis_health_days': 30,
    },
    support: 'Agreed business-hours support',
  },
}

export const UNLIMITED_LIMITS: PlanLimits = {
  'connections.enabled': null,
  'members.reserved': null,
  'alerts.enabled': null,
  'alerts.destinations': null,
  'service_accounts.enabled': null,
  // Storage retention is still bounded by the deployment's own setting.
  'history.redis_health_days': null,
}

export const FEATURE_LABELS: Record<FeatureKey, { name: string; outcome: string }> = {
  'jobs.bulk_recovery': {
    name: 'Bulk recovery',
    outcome: 'Retry many failed jobs in one action instead of one at a time.',
  },
  'mcp.write': {
    name: 'MCP write operations',
    outcome: 'Let authorized agents retry, promote and pause work after you opt in.',
  },
  'automation.service_accounts': {
    name: 'Service accounts',
    outcome: 'Run unattended MCP automation without a personal login.',
  },
  'alerts.webhook': {
    name: 'Webhook alerts',
    outcome: 'Deliver signed alert payloads to your own endpoints.',
  },
  'alerts.linear': {
    name: 'Linear alerts',
    outcome: 'Open and resolve Linear issues from alert incidents.',
  },
}

export const LIMIT_LABELS: Record<LimitKey, { name: string; unit: string }> = {
  'connections.enabled': { name: 'Enabled Redis connections', unit: 'connections' },
  'members.reserved': { name: 'Members and pending invitations', unit: 'members' },
  'alerts.enabled': { name: 'Enabled alert rules', unit: 'rules' },
  'alerts.destinations': { name: 'Saved alert destinations', unit: 'destinations' },
  'service_accounts.enabled': { name: 'Service accounts', unit: 'service accounts' },
  'history.redis_health_days': { name: 'Redis health history', unit: 'days' },
}

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && (PLAN_CODES as readonly string[]).includes(value)
}

export function isPurchasablePlanCode(value: unknown): value is PurchasablePlanCode {
  return typeof value === 'string' && (PURCHASABLE_PLAN_CODES as readonly string[]).includes(value)
}

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === 'string' && (FEATURE_KEYS as readonly string[]).includes(value)
}

export function isLimitKey(value: unknown): value is LimitKey {
  return typeof value === 'string' && (LIMIT_KEYS as readonly string[]).includes(value)
}

export function getPlan(code: PlanCode): PlanDefinition {
  return PLANS[code]
}

export function comparePlans(a: PlanCode, b: PlanCode): number {
  return PLANS[a].rank - PLANS[b].rank
}

export function planIncludesFeature(code: PlanCode, feature: FeatureKey): boolean {
  return PLANS[code].features.includes(feature)
}

/** Lowest self-serve plan that includes a feature (Enterprise if none does). */
export function requiredPlanForFeature(feature: FeatureKey): PlanCode {
  const plan = PLAN_CODES.map((code) => PLANS[code])
    .filter((p) => p.selfServe)
    .find((p) => p.features.includes(feature))
  return plan?.code ?? 'enterprise'
}

/** Lowest plan whose limit admits `quantity` of a resource. */
export function requiredPlanForLimit(limit: LimitKey, quantity: number): PlanCode {
  for (const code of PLAN_CODES) {
    const value = PLANS[code].limits[limit]
    if (value === null || value >= quantity) return code
  }
  return 'enterprise'
}

export type CapacityUsage = Partial<Record<CapacityLimitKey, number>>

/** Smallest plan whose limits cover the given usage (used for beta transition proposals). */
export function smallestPlanForUsage(usage: CapacityUsage): PlanCode {
  for (const code of PLAN_CODES) {
    const fits = CAPACITY_LIMIT_KEYS.every((key) => {
      const limit = PLANS[code].limits[key]
      return limit === null || (usage[key] ?? 0) <= limit
    })
    if (fits) return code
  }
  return 'enterprise'
}

/** Usage entries above a plan's limits, e.g. for "what would Free restrict?" */
export function exceededLimits(
  limits: PlanLimits,
  usage: CapacityUsage
): Array<{ limit: CapacityLimitKey; usage: number; allowed: number }> {
  const exceeded: Array<{ limit: CapacityLimitKey; usage: number; allowed: number }> = []
  for (const key of CAPACITY_LIMIT_KEYS) {
    const allowed = limits[key]
    const used = usage[key] ?? 0
    if (allowed !== null && used > allowed) exceeded.push({ limit: key, usage: used, allowed })
  }
  return exceeded
}

/** Merge contract or override limits over a base plan without lowering unspecified keys. */
export function mergeLimits(base: PlanLimits, overrides?: Partial<PlanLimits> | null): PlanLimits {
  if (!overrides) return { ...base }
  const merged = { ...base }
  for (const key of LIMIT_KEYS) {
    if (key in overrides) {
      const value = overrides[key]
      if (value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
        merged[key] = value === null ? null : Math.floor(value)
      }
    }
  }
  return merged
}

/** Effective monthly amount for an annual price, rounded to cents. */
export function effectiveMonthlyUsd(annualUsd: number): number {
  return Math.round((annualUsd / 12) * 100) / 100
}
