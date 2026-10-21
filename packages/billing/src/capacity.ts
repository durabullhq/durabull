import {
  CAPACITY_LIMIT_KEYS,
  type CapacityLimitKey,
  type CapacityUsage,
  type PlanLimits,
} from './catalog'

/** Temporary allowance for existing excess resources after a downgrade. */
export const CAPACITY_ADJUSTMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/** A new adjustment window is not granted within this period of the last one. */
export const CAPACITY_ADJUSTMENT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000
/** Excess existing resources that get the adjustment window; other excess is suspended at once. */
export const ADJUSTMENT_WINDOW_LIMIT_KEYS: readonly CapacityLimitKey[] = [
  'connections.enabled',
  'members.reserved',
]
/** Previously collected history is retained this long after a history downgrade. */
export const HISTORY_RECOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export interface CapacityTransitionInput {
  now: Date
  nextLimits: PlanLimits
  usage: CapacityUsage
  /** A window currently in progress. It is never extended. */
  activeWindowExpiresAt: Date | null
  /** When the previous adjustment window ended, if any. */
  lastWindowEndedAt: Date | null
  /**
   * Grace already gave the customer time (failed renewal) or the change is an
   * explicit end of a temporary grant: suspend immediately without a window.
   */
  skipWindow: boolean
}

export interface CapacityTransitionResult {
  overLimit: Array<{ limit: CapacityLimitKey; usage: number; allowed: number }>
  /** Window during which excess existing resources stay enabled. */
  windowExpiresAt: Date | null
  /** All excess resources must be suspended now. */
  suspendNow: boolean
  /** Excess that never gets a window (alert rules, destinations, service accounts). */
  suspendImmediately: CapacityLimitKey[]
}

export function overLimitEntries(limits: PlanLimits, usage: CapacityUsage) {
  const result: Array<{ limit: CapacityLimitKey; usage: number; allowed: number }> = []
  for (const key of CAPACITY_LIMIT_KEYS) {
    const allowed = limits[key]
    const used = usage[key] ?? 0
    if (allowed !== null && used > allowed) result.push({ limit: key, usage: used, allowed })
  }
  return result
}

/**
 * Decide how an organization above its new limits is treated.
 *
 * New creation is always blocked at the limit. Existing excess gets one
 * seven-day adjustment window, which repeated upgrade/downgrade cycles cannot
 * extend: an in-progress window keeps its original expiry and a fresh window
 * is refused within the cooldown after the last one ended.
 */
export function evaluateCapacityTransition(
  input: CapacityTransitionInput
): CapacityTransitionResult {
  const overLimit = overLimitEntries(input.nextLimits, input.usage)
  const windowed = overLimit.filter((entry) => ADJUSTMENT_WINDOW_LIMIT_KEYS.includes(entry.limit))
  const suspendImmediately = overLimit
    .filter((entry) => !ADJUSTMENT_WINDOW_LIMIT_KEYS.includes(entry.limit))
    .map((entry) => entry.limit)
  const suspendAll = { overLimit, windowExpiresAt: null, suspendNow: true, suspendImmediately }
  if (overLimit.length > 0 && input.skipWindow && !input.activeWindowExpiresAt) return suspendAll
  if (windowed.length === 0) {
    return { overLimit, windowExpiresAt: null, suspendNow: false, suspendImmediately }
  }

  const nowMs = input.now.getTime()
  if (input.activeWindowExpiresAt) {
    const expiresMs = input.activeWindowExpiresAt.getTime()
    return expiresMs > nowMs
      ? {
          overLimit,
          windowExpiresAt: input.activeWindowExpiresAt,
          suspendNow: false,
          suspendImmediately,
        }
      : suspendAll
  }

  const recentlyUsed =
    input.lastWindowEndedAt !== null &&
    nowMs - input.lastWindowEndedAt.getTime() < CAPACITY_ADJUSTMENT_COOLDOWN_MS
  if (recentlyUsed) return suspendAll

  return {
    overLimit,
    windowExpiresAt: new Date(nowMs + CAPACITY_ADJUSTMENT_WINDOW_MS),
    suspendNow: false,
    suspendImmediately,
  }
}

export interface CapacityCandidate {
  id: string
  createdAt: Date
  /** Resources the policy must always keep (the organization owner). */
  pinned?: boolean
  /** Owner's explicit choice to keep this resource enabled. */
  preferred?: boolean
}

/**
 * Deterministically choose which resources remain enabled within a limit.
 * Pinned resources first, then the owner's preferences, then the oldest
 * eligible resources (ties broken by id). Returns ids to keep and suspend.
 */
export function selectResourcesWithinLimit(
  candidates: CapacityCandidate[],
  limit: number | null
): { keep: string[]; suspend: string[] } {
  if (limit === null) return { keep: candidates.map((c) => c.id), suspend: [] }
  const ordered = [...candidates].sort((a, b) => {
    const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
    if (pin !== 0) return pin
    const pref = Number(Boolean(b.preferred)) - Number(Boolean(a.preferred))
    if (pref !== 0) return pref
    const age = a.createdAt.getTime() - b.createdAt.getTime()
    if (age !== 0) return age
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  const allowed = Math.max(0, limit, ordered.filter((c) => c.pinned).length)
  return {
    keep: ordered.slice(0, allowed).map((c) => c.id),
    suspend: ordered.slice(allowed).map((c) => c.id),
  }
}

export interface HistoryRetentionInput {
  now: Date
  visibleDays: number | null
  /** Days of history retained from before a downgrade, and until when. */
  floorDays: number | null
  floorExpiresAt: Date | null
  /** Deployment-wide maximum retention. */
  deploymentMaxDays: number
}

/** Storage retention: the visible window, or the pre-downgrade window during recovery. */
export function effectiveRetentionDays(input: HistoryRetentionInput): number {
  const visible = input.visibleDays ?? input.deploymentMaxDays
  const floorActive =
    input.floorDays !== null &&
    input.floorExpiresAt !== null &&
    input.floorExpiresAt.getTime() > input.now.getTime()
  const days = floorActive ? Math.max(visible, input.floorDays ?? 0) : visible
  return Math.max(1, Math.min(input.deploymentMaxDays, Math.floor(days)))
}

/** Clamp a requested history range to the plan's visible window. */
export function clampHistoryRange(
  range: { from: Date; to: Date },
  visibleDays: number | null,
  now: Date
): { from: Date; to: Date; clamped: boolean } {
  const to = range.to.getTime() > now.getTime() ? now : range.to
  if (visibleDays === null) return { from: range.from, to, clamped: to !== range.to }
  const earliestMs = now.getTime() - visibleDays * 24 * 60 * 60 * 1000
  if (range.from.getTime() >= earliestMs) return { from: range.from, to, clamped: to !== range.to }
  const from = new Date(earliestMs)
  return { from, to: to.getTime() < from.getTime() ? from : to, clamped: true }
}
