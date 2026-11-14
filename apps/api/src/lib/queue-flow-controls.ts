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

export const globalRateLimitSchema = z.object({
  max: z.number().int().min(1).max(MAX_RATE_LIMIT_JOBS),
  durationMs: z.number().int().min(1).max(MAX_RATE_LIMIT_DURATION_MS),
})

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
  | 'getGlobalConcurrency'
  | 'getGlobalRateLimit'
  | 'getRateLimitTtl'
  | 'isMaxed'
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

function toRateLimit(
  value: { max: number; duration: number } | null
): QueueFlowControlLimits['globalRateLimit'] {
  if (!value || !Number.isFinite(value.max) || !Number.isFinite(value.duration)) {
    return null
  }
  return { max: value.max, durationMs: value.duration }
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

  return {
    globalConcurrency:
      typeof globalConcurrency === 'number' && Number.isFinite(globalConcurrency)
        ? globalConcurrency
        : null,
    globalRateLimit: toRateLimit(globalRateLimit),
  }
}

export async function readQueueFlowControls(
  queue: FlowControlsQueue
): Promise<QueueFlowControlsState> {
  const [limits, isMaxed, activeCount] = await Promise.all([
    readQueueFlowControlLimits(queue),
    queue.isMaxed(),
    queue.getActiveCount(),
  ])

  // With a global limit, BullMQ compares the limiter count against it. Without one,
  // a bare getRateLimitTtl() returns the limiter key's TTL even when a worker's own
  // limiter is far below its max, so only count the marker that a manual
  // rateLimit() writes (MAX_SAFE_INTEGER) as throttled.
  const rawTtl = await queue.getRateLimitTtl(
    limits.globalRateLimit ? undefined : MANUAL_RATE_LIMIT_MARKER
  )

  // PTTL returns -2 (no key) or -1 (no expiry); both mean "not currently throttled".
  const rateLimitTtlMs = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 0

  return {
    ...limits,
    rateLimitTtlMs,
    rateLimited: rateLimitTtlMs > 0,
    isMaxed: Boolean(isMaxed),
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
    await queue.setGlobalRateLimit(input.globalRateLimit.max, input.globalRateLimit.durationMs)
  }
}

/**
 * Deletes the limiter key so workers can start jobs again immediately instead of
 * waiting for the current window to expire. The configured limit stays in place
 * and applies again from the next job.
 */
export async function clearQueueRateLimitWindow(queue: FlowControlsQueue): Promise<void> {
  await queue.removeRateLimitKey()
}
