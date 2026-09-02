import { getRedisHealthRetentionDays, pruneRedisHealthHistory } from './redis-health-history'

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const CLEANUP_CATCHUP_DELAY_MS = 5_000
const CLEANUP_BATCH_SIZE = 5_000
const CLEANUP_MAX_BATCHES = 20

let cleanupTimer: ReturnType<typeof setInterval> | null = null
let catchupTimer: ReturnType<typeof setTimeout> | null = null
let isRunning = false
let cleanupInProgress = false

export function startRedisHealthCleanupJob(): void {
  if (isRunning) return
  isRunning = true
  void runRedisHealthCleanup()
  cleanupTimer = setInterval(() => void runRedisHealthCleanup(), CLEANUP_INTERVAL_MS)
}

export function stopRedisHealthCleanupJob(): void {
  isRunning = false
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
  if (catchupTimer) {
    clearTimeout(catchupTimer)
    catchupTimer = null
  }
}

async function runRedisHealthCleanup(): Promise<void> {
  if (cleanupInProgress) return
  cleanupInProgress = true

  try {
    const result = await pruneRedisHealthHistory({
      retentionDays: getRedisHealthRetentionDays(),
      batchSize: CLEANUP_BATCH_SIZE,
      maxBatches: CLEANUP_MAX_BATCHES,
    })
    if (result.deleted > 0) {
      console.log(`[redis-health-cleanup] Removed ${result.deleted} expired samples`)
    }
    if (result.limitReached) {
      console.warn(
        `[redis-health-cleanup] Reached the ${CLEANUP_BATCH_SIZE * CLEANUP_MAX_BATCHES} row per-run safety limit; scheduling a catch-up pass`
      )
      scheduleCatchup()
    }
  } catch (error) {
    console.error('[redis-health-cleanup] Cleanup failed:', error)
  } finally {
    cleanupInProgress = false
  }
}

function scheduleCatchup(): void {
  if (!isRunning || catchupTimer) return
  catchupTimer = setTimeout(() => {
    catchupTimer = null
    void runRedisHealthCleanup()
  }, CLEANUP_CATCHUP_DELAY_MS)
}

export const __redisHealthCleanupTestUtils = {
  runRedisHealthCleanup,
}
