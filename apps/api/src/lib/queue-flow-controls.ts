import type { Queue } from 'bullmq'
import { z } from 'zod'

/**
 * Queue-level flow controls stored in the BullMQ queue meta hash.
 *
 * - Global concurrency caps how many jobs run at once across every worker.
 * - Global rate limit caps how many jobs start per time window across every worker.
 *
 * Workers read both values from Redis, so a change applies to the whole fleet
 * without a redeploy. Workers on BullMQ releases that predate these settings
 * ignore them.
 */

export const MAX_GLOBAL_CONCURRENCY = 100_000
export const MAX_RATE_LIMIT_JOBS = 1_000_000
/** One day. Longer windows are almost always a typo for seconds vs. milliseconds. */
export const MAX_RATE_LIMIT_DURATION_MS = 86_400_000

/** Value BullMQ's `Queue#rateLimit()` / `Worker#rateLimit()` stores in the limiter key. */
const MANUAL_RATE_LIMIT_MARKER = Number.MAX_SAFE_INTEGER

// Strict like the outer object: zod strips nested unknown keys by default, which would
// silently drop a misspelled or conflicting setting such as `duration`.
export const globalRateLimitSchema = z
  .object({
    max: z.number().int().min(1).max(MAX_RATE_LIMIT_JOBS),
    durationMs: z.number().int().min(1).max(MAX_RATE_LIMIT_DURATION_MS),
  })
  .strict()

/**
 * `undefined` leaves a control unchanged, `null` removes it, a value sets it.
 */
export const updateFlowControlsSchema = z
  .object({
    globalConcurrency: z.number().int().min(1).max(MAX_GLOBAL_CONCURRENCY).nullable().optional(),
    globalRateLimit: globalRateLimitSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => value.globalConcurrency !== undefined || value.globalRateLimit !== undefined, {
    message: 'Provide globalConcurrency, globalRateLimit, or both.',
  })

export type UpdateFlowControlsInput = z.infer<typeof updateFlowControlsSchema>

type FlowControlsQueue = Pick<
  Queue,
  | 'client'
  | 'keys'
  | 'getGlobalConcurrency'
  | 'getGlobalRateLimit'
  | 'getRateLimitTtl'
  | 'getActiveCount'
  | 'setGlobalConcurrency'
  | 'removeGlobalConcurrency'
  | 'setGlobalRateLimit'
  | 'removeGlobalRateLimit'
  | 'removeRateLimitKey'
>

export interface QueueFlowControlLimits {
  globalConcurrency: number | null
  globalRateLimit: { max: number; durationMs: number } | null
}

export interface QueueFlowControlsState extends QueueFlowControlLimits {
  /** Milliseconds until the current rate-limit window ends. `0` when not throttled. */
  rateLimitTtlMs: number
  rateLimited: boolean
  /** True when active jobs have reached the global concurrency cap. */
  isMaxed: boolean
  activeCount: number
}

/**
 * Workers set the limiter key's expiry only when they start the first job of a
 * window, so an open window keeps its old length after the limit changes. This
 * caps it at the new duration so a shorter window applies right away instead of
 * after the old (up to 24 hour) window ends. A manual rateLimit() marker is left
 * alone: that back-off was chosen by a worker, not by the configured limit.
 */
const CAP_LIMITER_WINDOW_SCRIPT = `
local count = tonumber(redis.call('GET', KEYS[1]))
if count and count < tonumber(ARGV[2]) and redis.call('PTTL', KEYS[1]) > tonumber(ARGV[1]) then
  return redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return 0
`

function toLimits(
  globalConcurrency: number | null,
  globalRateLimit: { max: number; duration: number } | null
): QueueFlowControlLimits {
  return {
    globalConcurrency:
      typeof globalConcurrency === 'number' && Number.isFinite(globalConcurrency)
        ? globalConcurrency
        : null,
    globalRateLimit:
      globalRateLimit &&
      Number.isFinite(globalRateLimit.max) &&
      Number.isFinite(globalRateLimit.duration)
        ? { max: globalRateLimit.max, durationMs: globalRateLimit.duration }
        : null,
  }
}

/**
 * Reads only the configured limits (one HGET + one HMGET on the meta hash).
 * Cheap enough for the queue detail endpoint; never throws so a queue whose
 * meta cannot be read still renders.
 */
export async function readQueueFlowControlLimits(
  queue: Partial<Pick<FlowControlsQueue, 'getGlobalConcurrency' | 'getGlobalRateLimit'>>
): Promise<QueueFlowControlLimits> {
  const [globalConcurrency, globalRateLimit] = await Promise.all([
    queue.getGlobalConcurrency ? queue.getGlobalConcurrency().catch(() => null) : null,
    queue.getGlobalRateLimit ? queue.getGlobalRateLimit().catch(() => null) : null,
  ])
  return toLimits(globalConcurrency, globalRateLimit)
}

/**
 * Reads the limits and the live throttle state for the flow-controls editor.
 * Unlike readQueueFlowControlLimits it lets read errors through: the editor
 * must not present "no limits" or "not throttled" when it could not tell.
 */
export async function readQueueFlowControls(
  queue: FlowControlsQueue
): Promise<QueueFlowControlsState> {
  const [globalConcurrency, globalRateLimit] = await Promise.all([
    queue.getGlobalConcurrency(),
    queue.getGlobalRateLimit(),
  ])
  const limits = toLimits(globalConcurrency, globalRateLimit)

  // With a global limit, BullMQ compares the limiter count against it. Without one,
  // a bare getRateLimitTtl() returns the limiter key's TTL even when a worker's own
  // limiter is far below its max, so only count the marker that a manual
  // rateLimit() writes (MAX_SAFE_INTEGER) as throttled.
  const [activeCount, rawTtl] = await Promise.all([
    queue.getActiveCount(),
    queue.getRateLimitTtl(limits.globalRateLimit ? undefined : MANUAL_RATE_LIMIT_MARKER),
  ])

  // PTTL returns -2 (no key) or -1 (no expiry); both mean "not currently throttled".
  const rateLimitTtlMs = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 0

  return {
    ...limits,
    rateLimitTtlMs,
    rateLimited: rateLimitTtlMs > 0,
    // Same check as BullMQ's isMaxed (LLEN active >= concurrency), derived from the
    // values above so the count and the flag shown together cannot disagree.
    isMaxed: limits.globalConcurrency !== null && activeCount >= limits.globalConcurrency,
    activeCount,
  }
}

export async function applyQueueFlowControls(
  queue: FlowControlsQueue,
  input: UpdateFlowControlsInput
): Promise<void> {
  if (input.globalConcurrency === null) {
    await queue.removeGlobalConcurrency()
  } else if (input.globalConcurrency !== undefined) {
    await queue.setGlobalConcurrency(input.globalConcurrency)
  }

  if (input.globalRateLimit === null) {
    await queue.removeGlobalRateLimit()
  } else if (input.globalRateLimit !== undefined) {
    const { max, durationMs } = input.globalRateLimit
    await queue.setGlobalRateLimit(max, durationMs)
    const client = await queue.client
    await client.eval(
      CAP_LIMITER_WINDOW_SCRIPT,
      1,
      queue.keys.limiter,
      durationMs,
      MANUAL_RATE_LIMIT_MARKER
    )
  }
}

/**
 * Deletes the limiter key so the current window ends. The configured limit stays
 * in place and applies again from the next job. Workers that already saw the
 * window sleep until their own back-off ends, which BullMQ caps at the worker's
 * `maximumRateLimitDelay` (30 seconds by default).
 */
export async function clearQueueRateLimitWindow(queue: FlowControlsQueue): Promise<void> {
  await queue.removeRateLimitKey()
}
