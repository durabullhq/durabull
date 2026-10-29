import {
  BILLING_CATALOG_VERSION,
  type CapacityLimitKey,
  type EntitlementNotice,
  type EntitlementSource,
  effectiveRetentionDays,
  evaluateCapacityTransition,
  FEATURE_KEYS,
  type FeatureKey,
  HISTORY_RECOVERY_WINDOW_MS,
  isFeatureKey,
  isPlanCode,
  LIMIT_KEYS,
  OUTAGE_TOLERANCE_MS,
  type PlanCode,
  type PlanLimits,
  resolveEntitlement,
  type SubscriptionEvidence,
  UNLIMITED_LIMITS,
} from '@durabull/billing'
import {
  type BillingLimitsJson,
  type BillingSubscription,
  billingRepository,
  type OrganizationEntitlement,
} from '@durabull/dal'
import { getRedisHealthRetentionDays } from '../lib/redis-health-history'
import { recordBillingEvent } from './analytics'
import { getBillingConfig, isBillingEnabled, isEnforcedFor } from './config'
import {
  BillingStateUnverifiedError,
  FeatureNotEntitledError,
  PlanLimitReachedError,
} from './errors'
import { allocateCapacity, liftAllSuspensions } from './suspension'

const CACHE_TTL_MS = 15_000

export interface EffectiveEntitlement {
  organizationId: string
  planCode: PlanCode | 'self_hosted'
  subscribedPlanCode: PlanCode | null
  source: EntitlementSource | 'self_hosted'
  features: FeatureKey[]
  limits: PlanLimits
  /** Denials and capacity limits are enforced (false in shadow/off modes). */
  enforced: boolean
  degraded: boolean
  revision: number
  notices: EntitlementNotice[]
  graceExpiresAt: Date | null
  capacityAdjustmentExpiresAt: Date | null
  migrationGrantExpiresAt: Date | null
  historyRetentionFloorDays: number | null
  historyRetentionFloorExpiresAt: Date | null
}

export function selfHostedEntitlement(organizationId: string): EffectiveEntitlement {
  return {
    organizationId,
    planCode: 'self_hosted',
    subscribedPlanCode: null,
    source: 'self_hosted',
    features: [...FEATURE_KEYS],
    limits: { ...UNLIMITED_LIMITS },
    enforced: false,
    degraded: false,
    revision: 0,
    notices: [],
    graceExpiresAt: null,
    capacityAdjustmentExpiresAt: null,
    migrationGrantExpiresAt: null,
    historyRetentionFloorDays: null,
    historyRetentionFloorExpiresAt: null,
  }
}

const cache = new Map<string, { value: EffectiveEntitlement; expiresAt: number }>()

export function invalidateEntitlementCache(organizationId?: string): void {
  if (organizationId) cache.delete(organizationId)
  else cache.clear()
}

function limitsFromJson(json: BillingLimitsJson | null | undefined): PlanLimits {
  const limits = { ...UNLIMITED_LIMITS }
  if (!json) return limits
  for (const key of LIMIT_KEYS) {
    const value = json[key]
    if (value === null || typeof value === 'number') limits[key] = value
  }
  return limits
}

function toEffective(row: OrganizationEntitlement, enforced: boolean): EffectiveEntitlement {
  return {
    organizationId: row.organizationId,
    planCode: isPlanCode(row.planCode) ? row.planCode : 'free',
    subscribedPlanCode: isPlanCode(row.subscribedPlanCode) ? row.subscribedPlanCode : null,
    source: row.source as EntitlementSource,
    features: (row.features ?? []).filter(isFeatureKey),
    limits: limitsFromJson(row.limits),
    enforced,
    degraded: row.degraded,
    revision: row.revision,
    notices: (row.notices ?? []) as EntitlementNotice[],
    graceExpiresAt: row.graceExpiresAt,
    capacityAdjustmentExpiresAt: row.capacityAdjustmentExpiresAt,
    migrationGrantExpiresAt: row.migrationGrantExpiresAt,
    historyRetentionFloorDays: row.historyRetentionFloorDays,
    historyRetentionFloorExpiresAt: row.historyRetentionFloorExpiresAt,
  }
}

function deadlinePassed(row: OrganizationEntitlement, now: Date): boolean {
  const deadlines = [
    row.reevaluateAt,
    row.graceExpiresAt,
    row.capacityAdjustmentExpiresAt,
    row.migrationGrantExpiresAt,
    row.historyRetentionFloorExpiresAt,
  ]
  return deadlines.some((date) => date !== null && date.getTime() <= now.getTime())
}

/**
 * Effective entitlement for an organization. Reads the durable snapshot (with
 * a short per-process cache) and re-materializes it when a recorded deadline
 * has passed, so time-based transitions never depend on a background sweep.
 * Stripe is never called on the request path.
 */
export async function getEntitlement(
  organizationId: string,
  options: { fresh?: boolean } = {}
): Promise<EffectiveEntitlement> {
  if (!isBillingEnabled()) return selfHostedEntitlement(organizationId)

  const now = Date.now()
  const cached = cache.get(organizationId)
  if (!options.fresh && cached && cached.expiresAt > now) return cached.value

  let row = await billingRepository.findEntitlement(organizationId)
  const enforced = isEnforcedFor(organizationId)
  if (
    !row ||
    row.catalogVersion !== BILLING_CATALOG_VERSION ||
    row.enforced !== enforced ||
    deadlinePassed(row, new Date(now))
  ) {
    row = await materializeEntitlement(organizationId, { reason: 'request' })
  }
  const value = toEffective(row, enforced)
  cache.set(organizationId, { value, expiresAt: now + CACHE_TTL_MS })
  return value
}

function subscriptionEvidence(sub: BillingSubscription | null): SubscriptionEvidence | null {
  if (!sub) return null
  return {
    status: sub.status as SubscriptionEvidence['status'],
    planCode: isPlanCode(sub.planCode) ? sub.planCode : null,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    cancelAt: sub.cancelAt,
    trialEnd: sub.trialEnd,
    latestInvoicePaid: sub.latestInvoicePaid,
    pastDueSince: sub.pastDueSince,
    collectionMethod:
      sub.collectionMethod === 'send_invoice' ? 'send_invoice' : 'charge_automatically',
    pauseCollection: sub.pauseCollection,
  }
}

function limitsToJson(limits: PlanLimits): BillingLimitsJson {
  return Object.fromEntries(LIMIT_KEYS.map((key) => [key, limits[key]]))
}

/**
 * Beta transition grant for an organization that has none recorded yet. A null
 * stored grant means "never decided", so the grant applies whenever launch
 * dates are configured, even if the organization's row was created earlier
 * (for example by the shadow-mode sweep). Clearing a grant stores a past
 * instant instead of null so it is not re-applied.
 */
async function initialMigrationGrant(organizationId: string): Promise<Date | null> {
  const { launchAt, migrationGrantUntil } = getBillingConfig()
  if (!launchAt || !migrationGrantUntil) return null
  const createdAt = await billingRepository.findOrganizationCreatedAt(organizationId)
  if (!createdAt) return null
  return createdAt.getTime() < launchAt.getTime() ? migrationGrantUntil : null
}

/** When the stored entitlement first saw an unmapped Price, so tolerance is not restarted. */
function unknownPriceSince(existing: OrganizationEntitlement | null): Date | null {
  if (!existing?.notices?.includes('unknown_price')) return null
  if (existing.source === 'degraded' && existing.reevaluateAt) {
    return new Date(existing.reevaluateAt.getTime() - OUTAGE_TOLERANCE_MS)
  }
  // The tolerance already lapsed.
  return new Date(0)
}

/**
 * Recompute and persist the organization's entitlement from verified local
 * evidence, apply the over-limit policy, and invalidate caches. Serialized per
 * organization so concurrent webhooks and requests converge.
 */
export async function materializeEntitlement(
  organizationId: string,
  options: { reason: string; now?: Date }
): Promise<OrganizationEntitlement> {
  return billingRepository.withOrganizationLock(organizationId, () =>
    materializeEntitlementLocked(organizationId, options)
  )
}

/** Same as materializeEntitlement for callers that already hold the organization lock. */
export async function materializeEntitlementLocked(
  organizationId: string,
  options: { reason: string; now?: Date }
): Promise<OrganizationEntitlement> {
  {
    const now = options.now ?? new Date()
    const enforced = isEnforcedFor(organizationId)
    const [existing, subscription, override] = await Promise.all([
      billingRepository.findEntitlement(organizationId),
      billingRepository.findCurrentSubscription(organizationId),
      billingRepository.findActiveOverride(organizationId, now),
    ])

    let migrationGrantExpiresAt = existing?.migrationGrantExpiresAt ?? null
    if (migrationGrantExpiresAt === null) {
      migrationGrantExpiresAt = await initialMigrationGrant(organizationId)
    }

    const resolved = resolveEntitlement({
      now,
      billingEnabled: true,
      subscription: subscriptionEvidence(subscription),
      lastPaidPlan: isPlanCode(subscription?.lastPaidPlanCode)
        ? subscription.lastPaidPlanCode
        : null,
      migrationGrantExpiresAt,
      override: override
        ? {
            planCode: isPlanCode(override.planCode) ? override.planCode : 'free',
            limits: override.limits ? limitsFromJson(override.limits) : null,
            expiresAt: override.expiresAt,
          }
        : null,
      contractLimits: existing?.contractLimits ? limitsFromJson(existing.contractLimits) : null,
      verifiedAt: subscription?.lastReconciledAt ?? null,
      unknownPriceSince: unknownPriceSince(existing),
    })

    const previousLimits = existing ? limitsFromJson(existing.limits) : null
    let capacityAdjustmentExpiresAt = existing?.capacityAdjustmentExpiresAt ?? null
    let lastCapacityAdjustmentEndedAt = existing?.lastCapacityAdjustmentEndedAt ?? null

    if (enforced) {
      const usage = await billingRepository.getUsage(organizationId)
      const transition = evaluateCapacityTransition({
        now,
        nextLimits: resolved.limits,
        usage,
        activeWindowExpiresAt: capacityAdjustmentExpiresAt,
        lastWindowEndedAt: lastCapacityAdjustmentEndedAt,
        // Grace and the beta notice period already gave the customer time.
        skipWindow: existing?.source === 'payment_grace' || existing?.source === 'migration_grant',
      })
      if (transition.suspendNow) {
        const result = await allocateCapacity(organizationId, resolved.limits, {
          reason: `Plan ${resolved.planCode} limits after ${options.reason}`,
        })
        if (capacityAdjustmentExpiresAt) lastCapacityAdjustmentEndedAt = now
        capacityAdjustmentExpiresAt = null
        if (result.suspended.length > 0) {
          console.warn(
            `[billing] Suspended ${result.suspended.length} resource(s) above plan limits for organization ${organizationId}`
          )
        }
      } else {
        if (transition.overLimit.length === 0 && capacityAdjustmentExpiresAt) {
          lastCapacityAdjustmentEndedAt = now
        }
        capacityAdjustmentExpiresAt = transition.windowExpiresAt
        // Only connections and memberships get the adjustment window.
        if (transition.suspendImmediately.length > 0) {
          await allocateCapacity(organizationId, resolved.limits, {
            reason: `Plan ${resolved.planCode} limits after ${options.reason}`,
            only: transition.suspendImmediately,
          })
        }
        // Restore previously suspended resources when the new limits allow.
        await allocateCapacity(organizationId, resolved.limits, {
          reason: 'restore',
          restoreOnly: true,
        })
      }
    } else if (existing?.enforced) {
      // Enforcement turned off for this organization: nothing stays suspended.
      await liftAllSuspensions(organizationId)
      capacityAdjustmentExpiresAt = null
    }

    // Keep previously collected history for the recovery window after a
    // history downgrade; the visible window is clamped immediately.
    let historyRetentionFloorDays = existing?.historyRetentionFloorDays ?? null
    let historyRetentionFloorExpiresAt = existing?.historyRetentionFloorExpiresAt ?? null
    // While a row was not enforced (shadow or newly enforced organizations),
    // storage kept the deployment's full retention; that is what is lost.
    const previousHistory =
      existing && !existing.enforced && enforced
        ? getRedisHealthRetentionDays()
        : (previousLimits?.['history.redis_health_days'] ?? null)
    const nextHistory = resolved.limits['history.redis_health_days']
    if (
      previousHistory !== null &&
      nextHistory !== null &&
      nextHistory < previousHistory &&
      !(historyRetentionFloorExpiresAt && historyRetentionFloorExpiresAt.getTime() > now.getTime())
    ) {
      historyRetentionFloorDays = previousHistory
      historyRetentionFloorExpiresAt = new Date(now.getTime() + HISTORY_RECOVERY_WINDOW_MS)
    } else if (
      historyRetentionFloorExpiresAt &&
      historyRetentionFloorExpiresAt.getTime() <= now.getTime()
    ) {
      historyRetentionFloorDays = null
      historyRetentionFloorExpiresAt = null
    }

    const reevaluateCandidates = [
      resolved.reevaluateAt,
      capacityAdjustmentExpiresAt,
      historyRetentionFloorExpiresAt,
      migrationGrantExpiresAt && migrationGrantExpiresAt.getTime() > now.getTime()
        ? migrationGrantExpiresAt
        : null,
    ].filter((date): date is Date => date !== null && date.getTime() > now.getTime())
    const reevaluateAt =
      reevaluateCandidates.length > 0
        ? new Date(Math.min(...reevaluateCandidates.map((date) => date.getTime())))
        : null

    const row = await billingRepository.saveEntitlement({
      organizationId,
      planCode: resolved.planCode === 'self_hosted' ? 'free' : resolved.planCode,
      subscribedPlanCode: resolved.subscribedPlanCode,
      source: resolved.source,
      catalogVersion: BILLING_CATALOG_VERSION,
      features: resolved.features,
      limits: limitsToJson(resolved.limits),
      enforced,
      degraded: resolved.degraded,
      notices: resolved.notices,
      lastPaidPlanCode: subscription?.lastPaidPlanCode ?? existing?.lastPaidPlanCode ?? null,
      graceExpiresAt: resolved.graceExpiresAt,
      migrationGrantExpiresAt,
      capacityAdjustmentExpiresAt,
      lastCapacityAdjustmentEndedAt,
      historyRetentionFloorDays,
      historyRetentionFloorExpiresAt,
      contractLimits: existing?.contractLimits ?? null,
      reevaluateAt,
      verifiedAt: subscription?.lastReconciledAt ?? existing?.verifiedAt ?? null,
    })

    invalidateEntitlementCache(organizationId)

    if (existing && (existing.planCode !== row.planCode || existing.source !== row.source)) {
      recordBillingEvent('plan_changed', organizationId, {
        plan: row.planCode,
        previous_plan: existing.planCode,
        entitlement_source: row.source,
      })
      if (existing.source === 'trial' && row.source !== 'trial') {
        recordBillingEvent('trial_ended', organizationId, {
          plan: row.planCode,
          entitlement_source: row.source,
        })
      }
    }
    if (resolved.degraded && !existing?.degraded) {
      console.error(
        `[billing] ALERT organization ${organizationId} entered degraded billing state (${resolved.notices.join(', ')})`
      )
    }
    return row
  }
}

/**
 * Require a capability for an authenticated organization. In shadow and pilot
 * modes the decision is recorded but only enforced organizations are denied.
 */
export async function requireFeature(organizationId: string, feature: FeatureKey): Promise<void> {
  const entitlement = await getEntitlement(organizationId)
  if (entitlement.features.includes(feature)) return
  recordBillingEvent('feature_denied', organizationId, {
    feature,
    plan: entitlement.planCode,
    shadow: !entitlement.enforced,
  })
  if (entitlement.enforced) throw new FeatureNotEntitledError(feature)
}

/** Non-throwing check for background work (deliveries, evaluation). */
export async function hasFeature(organizationId: string, feature: FeatureKey): Promise<boolean> {
  const entitlement = await getEntitlement(organizationId)
  return !entitlement.enforced || entitlement.features.includes(feature)
}

/**
 * Pre-check capacity before creating or enabling a resource. The database
 * trigger is the authoritative, race-free boundary; this check exists so the
 * common case returns a precise, friendly error.
 */
export async function assertCapacity(
  organizationId: string,
  limit: CapacityLimitKey,
  amount = 1
): Promise<void> {
  const entitlement = await getEntitlement(organizationId)
  const allowed = entitlement.limits[limit]
  if (allowed === null) return
  if (entitlement.enforced && entitlement.degraded) throw new BillingStateUnverifiedError()
  const usage = (await billingRepository.getUsage(organizationId))[limit]
  if (usage + amount <= allowed) return
  recordBillingEvent('feature_denied', organizationId, {
    limit_key: limit,
    plan: entitlement.planCode,
    shadow: !entitlement.enforced,
  })
  if (entitlement.enforced) throw new PlanLimitReachedError(limit, usage, allowed)
}

/** Visible Redis health history window in days, or null when not clamped. */
export async function getVisibleHistoryDays(organizationId: string): Promise<number | null> {
  const entitlement = await getEntitlement(organizationId)
  return entitlement.enforced ? entitlement.limits['history.redis_health_days'] : null
}

/** Stored retention for an organization's samples (visible window plus recovery floor). */
export function getStorageRetentionDays(
  entitlement: EffectiveEntitlement,
  deploymentMaxDays: number,
  now = new Date()
): number {
  if (!entitlement.enforced) return deploymentMaxDays
  return effectiveRetentionDays({
    now,
    visibleDays: entitlement.limits['history.redis_health_days'],
    floorDays: entitlement.historyRetentionFloorDays,
    floorExpiresAt: entitlement.historyRetentionFloorExpiresAt,
    deploymentMaxDays,
  })
}

/** Whether a member's access to an organization is suspended by the plan's seat limit. */
export async function isMemberSuspended(organizationId: string, userId: string): Promise<boolean> {
  if (!isBillingEnabled()) return false
  if (!isEnforcedFor(organizationId)) return false
  return billingRepository.isMemberSuspended(organizationId, userId)
}

export async function isResourceSuspended(
  organizationId: string,
  kind: 'connection' | 'alert_rule' | 'alert_destination' | 'service_account' | 'invitation',
  resourceId: string
): Promise<boolean> {
  if (!isBillingEnabled()) return false
  if (!isEnforcedFor(organizationId)) return false
  return billingRepository.isSuspended(kind, resourceId)
}

/** IDs of an organization's resources of one kind that its plan currently pauses. */
export async function suspendedResourceIds(
  organizationId: string,
  kind: 'connection' | 'alert_rule' | 'alert_destination' | 'service_account' | 'invitation'
): Promise<Set<string>> {
  if (!isBillingEnabled() || !isEnforcedFor(organizationId)) return new Set()
  return billingRepository.suspendedIds(organizationId, kind)
}

/**
 * Drop connections a caller cannot use under plan state: connections paused by
 * a plan limit, and every connection of an organization where the caller's own
 * seat is paused. Listings may span several organizations, so each one is
 * evaluated separately.
 */
export async function filterPlanAccessibleConnections<
  T extends { id: string; organizationId: string },
>(connections: T[], userId: string | null): Promise<T[]> {
  if (!isBillingEnabled()) return connections
  const memberSuspended = new Map<string, boolean>()
  const suspended = new Map<string, Set<string>>()
  const result: T[] = []
  for (const connection of connections) {
    const organizationId = connection.organizationId
    if (userId) {
      if (!memberSuspended.has(organizationId)) {
        memberSuspended.set(organizationId, await isMemberSuspended(organizationId, userId))
      }
      if (memberSuspended.get(organizationId)) continue
    }
    if (!suspended.has(organizationId)) {
      suspended.set(organizationId, await suspendedResourceIds(organizationId, 'connection'))
    }
    if (suspended.get(organizationId)?.has(connection.id)) continue
    result.push(connection)
  }
  return result
}

/**
 * Bring stored enforcement in line with the current deployment mode. The
 * capacity triggers read the stored `enforced` flag, so after billing is turned
 * off or enforcement is rolled back to shadow/pilot, rows enforced earlier
 * would otherwise keep rejecting writes until each organization is touched.
 * Runs once at startup; also lifts the suspensions those rows imposed.
 */
export async function syncStoredEnforcement(): Promise<number> {
  let relaxed = 0
  for (const organizationId of await billingRepository.listEnforcedOrganizationIds()) {
    if (isEnforcedFor(organizationId)) continue
    await billingRepository.withOrganizationLock(organizationId, async () => {
      await liftAllSuspensions(organizationId)
      await billingRepository.markEntitlementUnenforced(organizationId)
    })
    cache.delete(organizationId)
    relaxed += 1
  }
  return relaxed
}
