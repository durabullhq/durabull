import {
  type CapacityCandidate,
  type CapacityLimitKey,
  type PlanLimits,
  selectResourcesWithinLimit,
} from '@durabull/billing'
import { type BillingResourceKind, billingRepository, isOwnerRole } from '@durabull/dal'

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
      /** Shown when an owner's choice cannot be honored. */
      name?: string
    }
  >
}

/** The earliest owner's member id: the one seat a plan never pauses. */
export function findFoundingOwnerId(
  members: ReadonlyArray<{ id: string; role: string; createdAt: Date }>
): string | undefined {
  return members
    .filter((m) => isOwnerRole(m.role))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))[0]
    ?.id
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
  const foundingOwnerId = findFoundingOwnerId(candidates.members)
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
        name: r.name,
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
  // Suspensions of resources that no longer count against a limit (deleted,
  // disabled, or an invitation that expired) are stale and must not linger.
  const live = new Set(plans.flatMap((plan) => plan.candidates.map((candidate) => candidate.id)))
  const orphans = suspensions
    .filter((s) => !live.has(key(s.resourceKind, s.resourceId)))
    .map((s) => ({ kind: s.resourceKind, resourceId: s.resourceId }))
  return { plans, suspended, orphans }
}

/**
 * The owner chose to keep rules that watch a connection this allocation
 * leaves paused. They could not run, so nothing is applied.
 */
export class AllocationPreferenceError extends Error {
  constructor(readonly ruleNames: string[]) {
    super(
      `${ruleNames.join(', ')} ${ruleNames.length === 1 ? 'watches a connection' : 'watch connections'} the plan has paused, so ${ruleNames.length === 1 ? 'it' : 'they'} cannot run. Keep the connection enabled first, or choose other rules.`
    )
    this.name = 'AllocationPreferenceError'
  }
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
 *
 * Alert rules follow their connection: a rule watching a connection the plan
 * has paused cannot run, so it is paused with it and does not use the rule
 * allowance. Rules on a connection the customer disabled are not affected.
 * Call with the organization lock held.
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
  const { plans, suspended, orphans } = await buildPlans(organizationId, options.preferences ?? {})
  const toSuspend: Array<{ kind: BillingResourceKind; resourceId: string }> = []
  const toRestore: Array<{ kind: BillingResourceKind; resourceId: string }> = []

  // Connections are decided first, so the rule allowance goes to rules on
  // connections that end up active.
  const connectionsAllocated = !options.only || options.only.includes('connections.enabled')
  let pausedConnections: Set<string> | null = null
  // Connections that fit the limit, whether or not this run pauses the rest.
  let fittingConnections: Set<string> | null = null
  for (const plan of plans) {
    const allocates = !options.only || options.only.includes(plan.limit)
    let candidates = plan.candidates

    if (plan.limit === 'alerts.enabled' && pausedConnections) {
      const paused = pausedConnections
      const stranded = (c: (typeof candidates)[number]) =>
        Boolean(c.connectionId && paused.has(c.connectionId))
      const keptRules = options.preferences?.[plan.limit]
      if (keptRules) {
        // Checked against this run's connection decision, so a connection the
        // same allocation restores counts as enabled. Throws before any write.
        const impossible = candidates.filter((c) => stranded(c) && keptRules.includes(c.resourceId))
        if (impossible.length > 0) {
          throw new AllocationPreferenceError(impossible.map((c) => c.name ?? c.resourceId))
        }
      }
      // Rules follow their connection whenever this run decides connections,
      // even when the rule limit itself is not being allocated.
      if (!options.restoreOnly && (allocates || connectionsAllocated)) {
        for (const candidate of candidates.filter(stranded)) {
          if (!suspended.has(candidate.id)) {
            toSuspend.push({ kind: candidate.kind, resourceId: candidate.resourceId })
          }
        }
        candidates = candidates.filter((c) => !stranded(c))
      } else {
        // A restore, or a run that decides neither connections nor rules,
        // never pauses anything. Rules still running on a paused connection
        // keep counting until a run that does pauses them; paused ones are
        // never brought back.
        candidates = candidates.filter((c) => !stranded(c) || !suspended.has(c.id))
      }
      if (fittingConnections && !options.preferences?.[plan.limit]) {
        // While excess connections are still in their adjustment window,
        // prefer rules on the connections that will remain.
        const fitting = fittingConnections
        candidates = candidates.map((c) => ({
          ...c,
          preferred: Boolean(c.preferred) && (!c.connectionId || fitting.has(c.connectionId)),
        }))
      }
    }

    const selection = selectResourcesWithinLimit(candidates, limits[plan.limit])
    const keep = new Set(selection.keep)
    const planSuspend = new Set<string>()
    const planRestore = new Set<string>()
    if (allocates) {
      for (const candidate of candidates) {
        if (keep.has(candidate.id)) {
          if (suspended.has(candidate.id)) planRestore.add(candidate.id)
        } else if (!options.restoreOnly && !suspended.has(candidate.id)) {
          planSuspend.add(candidate.id)
        }
      }
    }
    for (const candidate of candidates) {
      const target = { kind: candidate.kind, resourceId: candidate.resourceId }
      if (planRestore.has(candidate.id)) toRestore.push(target)
      if (planSuspend.has(candidate.id)) toSuspend.push(target)
    }

    if (plan.limit === 'connections.enabled') {
      fittingConnections = new Set(
        candidates.filter((c) => keep.has(c.id)).map((c) => c.resourceId)
      )
      // Paused by the plan once this run is applied; a disabled connection is
      // not a candidate and so is never in this set.
      pausedConnections = new Set(
        candidates
          .filter((c) => (suspended.has(c.id) ? !planRestore.has(c.id) : planSuspend.has(c.id)))
          .map((c) => c.resourceId)
      )
    }
  }

  if (orphans.length > 0) await billingRepository.unsuspend(organizationId, orphans)
  if (toRestore.length > 0) await billingRepository.unsuspend(organizationId, toRestore)
  if (toSuspend.length > 0)
    await billingRepository.suspend(organizationId, toSuspend, options.reason)
  return { suspended: toSuspend, restored: toRestore }
}

/** Lift every suspension (billing disabled, enforcement off, or unlimited grant). */
export async function liftAllSuspensions(organizationId: string): Promise<number> {
  return billingRepository.unsuspend(organizationId)
}
