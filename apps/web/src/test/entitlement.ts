import {
  type CapacityUsage,
  createEntitlementAccess,
  PLANS,
  type PlanCode,
  UNRESTRICTED_ENTITLEMENT,
} from '@durabull/api-client/billing'
import type { EnabledEntitlement, Entitlement, PausedResourceKind } from '@/hooks/use-entitlement'

/**
 * Component tests run with an unrestricted entitlement (as on a self-hosted
 * deployment) unless they opt into a plan with `setTestEntitlement`. The
 * setup file replaces `useEntitlement` with this and resets it between tests.
 */
function unrestricted(): Entitlement {
  return {
    ...createEntitlementAccess(UNRESTRICTED_ENTITLEMENT),
    isLoading: false,
    plan: null,
    canManageBilling: false,
    isPaused: () => false,
    seatPaused: false,
  }
}

export const testEntitlement: { current: Entitlement } = { current: unrestricted() }

export function resetTestEntitlement(): void {
  testEntitlement.current = unrestricted()
}

/** Put the organization under test on a Cloud plan, enforced. */
export function setTestEntitlement(options: {
  plan: PlanCode
  usage?: CapacityUsage
  canManageBilling?: boolean
  paused?: Array<{ kind: PausedResourceKind; id: string }>
  seatPaused?: boolean
  /** Extra fields of the plan state (subscription, notices, …). */
  state?: Partial<EnabledEntitlement>
}): void {
  const definition = PLANS[options.plan]
  const usage = options.usage ?? {}
  const paused = options.paused ?? []
  const canManageBilling = options.canManageBilling ?? true
  const plan = {
    enabled: true,
    enforced: true,
    planCode: options.plan,
    planName: definition.name,
    subscribedPlanCode: null,
    source: options.plan === 'free' ? 'free' : 'subscription',
    degraded: false,
    notices: [],
    features: [...definition.features],
    limits: definition.limits,
    usage,
    suspended: paused.map((item) => ({ ...item, since: '2026-11-01T00:00:00.000Z' })),
    subscription: null,
    graceExpiresAt: null,
    capacityAdjustmentExpiresAt: null,
    canManageBilling,
    transition: null,
    ...options.state,
  } as EnabledEntitlement
  const pausedKeys = new Set(paused.map((item) => `${item.kind}:${item.id}`))
  testEntitlement.current = {
    ...createEntitlementAccess({
      billingEnabled: true,
      enforced: plan.enforced,
      planCode: plan.planCode,
      features: plan.features,
      limits: plan.limits,
      usage: plan.usage,
    }),
    isLoading: false,
    plan,
    canManageBilling,
    isPaused: (kind, id) => pausedKeys.has(`${kind}:${id}`),
    seatPaused: options.seatPaused ?? false,
  }
}
