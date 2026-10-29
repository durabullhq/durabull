import {
  type CapacityCandidate,
  type CapacityLimitKey,
  type PlanLimits,
  selectResourcesWithinLimit,
} from '@durabull/billing'
import { type BillingResourceKind, billingRepository } from '@durabull/dal'

/** Owner's explicit choice of resources to keep, keyed by capacity limit. */
export type CapacityPreferences = Partial<Record<CapacityLimitKey, string[]>>

interface KindPlan {
  limit: CapacityLimitKey
  candidates: Array<
    CapacityCandidate & {
      kind: BillingResourceKind
      resourceId: string
      /** Alert rules: the connection they watch. */
      connectionId?: string | null
    }
  >
}

function key(kind: BillingResourceKind, id: string): string {
  return `${kind}:${id}`
}

async function buildPlans(organizationId: string, preferences: CapacityPreferences) {
  const [candidates, suspensions] = await Promise.all([
    billingRepository.listCapacityCandidates(organizationId),
    billingRepository.listSuspensions(organizationId),
  ])
  const suspended = new Set(suspensions.map((s) => key(s.resourceKind, s.resourceId)))
  const foundingOwnerId = candidates.members
    .filter((m) => m.role === 'owner')
    .sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
    )[0]?.id
  const explicit = (limit: CapacityLimitKey) => preferences[limit]
  // Without an explicit choice, resources that are currently active are
  // preferred so repeated evaluations keep a stable set.
  const preferred = (limit: CapacityLimitKey, kind: BillingResourceKind, id: string) => {
    const chosen = explicit(limit)
    return chosen ? chosen.includes(id) : !suspended.has(key(kind, id))
  }

  const plans: KindPlan[] = [
    {
      limit: 'connections.enabled',
      candidates: candidates.connections.map((c) => ({
        id: key('connection', c.id),
        kind: 'connection' as const,
        resourceId: c.id,
        createdAt: c.createdAt,
        preferred: preferred('connections.enabled', 'connection', c.id),
      })),
    },
    {
      limit: 'members.reserved',
      candidates: [
        ...candidates.members.map((m) => ({
          id: key('member', m.id),
          kind: 'member' as const,
          resourceId: m.id,
          createdAt: m.createdAt,
          // The founding owner is never suspended. Other owners count like any
          // member, so promoting members to owner cannot bypass a seat limit.
          pinned: m.id === foundingOwnerId,
          preferred: preferred('members.reserved', 'member', m.id),
        })),
        ...candidates.invitations.map((i) => ({
          id: key('invitation', i.id),
          kind: 'invitation' as const,
          resourceId: i.id,
          createdAt: i.createdAt,
          preferred: preferred('members.reserved', 'invitation', i.id),
        })),
      ],
    },
    {
      limit: 'alerts.enabled',
      candidates: candidates.rules.map((r) => ({
        id: key('alert_rule', r.id),
        kind: 'alert_rule' as const,
        resourceId: r.id,
        connectionId: r.connectionId,
        createdAt: r.createdAt,
        preferred: preferred('alerts.enabled', 'alert_rule', r.id),
      })),
    },
    {
      limit: 'alerts.destinations',
      candidates: candidates.destinations.map((d) => ({
        id: key('alert_destination', d.id),
        kind: 'alert_destination' as const,
        resourceId: d.id,
        createdAt: d.createdAt,
        preferred: preferred('alerts.destinations', 'alert_destination', d.id),
      })),
    },
    {
      limit: 'service_accounts.enabled',
      candidates: candidates.serviceAccounts.map((a) => ({
        id: key('service_account', a.id),
        kind: 'service_account' as const,
        resourceId: a.id,
        createdAt: a.createdAt,
        preferred: preferred('service_accounts.enabled', 'service_account', a.id),
      })),
    },
  ]
  return { plans, suspended }
}

export interface AllocationResult {
  suspended: Array<{ kind: BillingResourceKind; resourceId: string }>
  restored: Array<{ kind: BillingResourceKind; resourceId: string }>
}

/**
 * Bring the organization's active resources within `limits`.
 *
 * Deterministic: pinned owner first, then the owner's preferences, then the
 * oldest resources. Suspension is reversible and never deletes membership or
 * configuration, and it never touches the customer's Redis data. Resources
 * suspended earlier are restored when the limits allow.
 */
export async function allocateCapacity(
  organizationId: string,
  limits: PlanLimits,
  options: {
    preferences?: CapacityPreferences
    reason: string
    restoreOnly?: boolean
    /** Limit allocation to these limits; others are left as they are. */
    only?: readonly CapacityLimitKey[]
  }
): Promise<AllocationResult> {
  const { plans, suspended } = await buildPlans(organizationId, options.preferences ?? {})
  const toSuspend: Array<{ kind: BillingResourceKind; resourceId: string }> = []
  const toRestore: Array<{ kind: BillingResourceKind; resourceId: string }> = []

  // Connections are allocated first, so rules on connections that stay active
  // win the rule allowance over rules watching paused connections.
  let activeConnections: Set<string> | null = null
  for (const plan of plans) {
    if (plan.limit === 'connections.enabled') {
      const selection = selectResourcesWithinLimit(plan.candidates, limits[plan.limit])
      activeConnections = new Set(
        plan.candidates.filter((c) => selection.keep.includes(c.id)).map((c) => c.resourceId)
      )
    }
    if (options.only && !options.only.includes(plan.limit)) continue
    if (
      plan.limit === 'alerts.enabled' &&
      activeConnections &&
      !options.preferences?.[plan.limit]
    ) {
      const live = activeConnections
      plan.candidates = plan.candidates.map((c) => ({
        ...c,
        preferred: Boolean(c.preferred) && (!c.connectionId || live.has(c.connectionId)),
      }))
    }
    const selection = selectResourcesWithinLimit(plan.candidates, limits[plan.limit])
    const byId = new Map(plan.candidates.map((c) => [c.id, c]))
    for (const id of selection.keep) {
      const candidate = byId.get(id)
      if (candidate && suspended.has(id)) {
        toRestore.push({ kind: candidate.kind, resourceId: candidate.resourceId })
      }
    }
    if (options.restoreOnly) continue
    for (const id of selection.suspend) {
      const candidate = byId.get(id)
      if (candidate && !suspended.has(id)) {
        toSuspend.push({ kind: candidate.kind, resourceId: candidate.resourceId })
      }
    }
  }

  if (toRestore.length > 0) await billingRepository.unsuspend(organizationId, toRestore)
  if (toSuspend.length > 0)
    await billingRepository.suspend(organizationId, toSuspend, options.reason)
  return { suspended: toSuspend, restored: toRestore }
}

/** Lift every suspension (billing disabled, enforcement off, or unlimited grant). */
export async function liftAllSuspensions(organizationId: string): Promise<number> {
  return billingRepository.unsuspend(organizationId)
}
