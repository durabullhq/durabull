import {
  type CapacityLimitKey,
  createEntitlementAccess,
  type EntitlementAccess,
  type FeatureKey,
  UNRESTRICTED_ENTITLEMENT,
} from '@durabull/api-client/billing'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { ApiError, api, handleRes, type InferResponseType } from '@/lib/api'
import { useAppConfig } from './use-app-config'
import { billingKeys } from './use-billing'
import { useActiveOrganization } from './use-organization'

export type EntitlementResponse = InferResponseType<(typeof api.billing.entitlement)['$get'], 200>
export type EnabledEntitlement = Extract<EntitlementResponse, { enabled: true }>
export type PausedResourceKind = EnabledEntitlement['suspended'][number]['kind']

export interface Entitlement extends EntitlementAccess {
  /** The first answer has not arrived yet; nothing is restricted meanwhile. */
  isLoading: boolean
  /** Cloud plan state, or null on self-hosted deployments and while loading. */
  plan: EnabledEntitlement | null
  /** Only the organization owner can change the plan. */
  canManageBilling: boolean
  /** Whether the plan currently pauses this resource. */
  isPaused: (kind: PausedResourceKind, id: string) => boolean
  /** The signed-in member's own seat is paused by the plan's member limit. */
  seatPaused: boolean
}

/**
 * What the active organization's plan allows, for any component that needs to
 * decide before the user acts:
 *
 *   const entitlement = useEntitlement()
 *   entitlement.can('alerts.webhook')            // feature included?
 *   entitlement.capacity('connections.enabled')   // { used, limit, atLimit, … }
 *   entitlement.isPaused('connection', id)        // paused by the plan?
 *
 * Self-hosted deployments, organizations that are only observed, and the
 * moment before the first response all answer "allowed": the server is the
 * boundary, this only saves the user a wasted attempt.
 */
export function useEntitlement(): Entitlement {
  const { config } = useAppConfig()
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id
  const query = useQuery({
    queryKey: billingKeys.entitlement(organizationId),
    queryFn: async () => handleRes<EntitlementResponse>(await api.billing.entitlement.$get()),
    enabled: config.billing.enabled && Boolean(organizationId),
    staleTime: 30_000,
  })

  return useMemo(() => {
    const plan = query.data?.enabled ? query.data : null
    const access = createEntitlementAccess(
      plan
        ? {
            billingEnabled: true,
            enforced: plan.enforced,
            planCode: plan.planCode,
            features: plan.features,
            limits: plan.limits,
            usage: plan.usage,
          }
        : UNRESTRICTED_ENTITLEMENT
    )
    const paused = new Set((plan?.suspended ?? []).map((item) => `${item.kind}:${item.id}`))
    return {
      ...access,
      isLoading: query.isLoading,
      plan,
      canManageBilling: plan?.canManageBilling ?? false,
      isPaused: (kind, id) => paused.has(`${kind}:${id}`),
      seatPaused: query.error instanceof ApiError && query.error.code === 'member_suspended',
    }
  }, [query.data, query.error, query.isLoading])
}

/** Shorthand for a single feature check. */
export function useFeature(feature: FeatureKey) {
  const entitlement = useEntitlement()
  return { ...entitlement.feature(feature), canManageBilling: entitlement.canManageBilling }
}

/** Shorthand for a single capacity check. */
export function useCapacity(limit: CapacityLimitKey) {
  const entitlement = useEntitlement()
  return { ...entitlement.capacity(limit), canManageBilling: entitlement.canManageBilling }
}
