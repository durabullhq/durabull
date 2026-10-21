import { redisConnectionRepository, redisHealthSampleRepository } from '@durabull/dal'
import { isBillingEnabled } from '../billing/config'
import { getEntitlement, getStorageRetentionDays } from '../billing/entitlements'
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
    const planResult = await prunePlanRetention()
    if (planResult.deleted > 0) {
      console.log(
        `[redis-health-cleanup] Removed ${planResult.deleted} samples beyond organization plan retention`
      )
    }
    if (planResult.limitReached) scheduleCatchup()
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

/**
 * Organization-aware retention for Cloud plans. Samples are kept for the
 * plan's visible window, or the previous window during the seven-day
 * recovery period after a history downgrade. Deletion is indexed and bounded
 * per run. Billing never deletes customer Redis data; these are Durabull's
 * own stored health samples.
 */
async function prunePlanRetention(): Promise<{ deleted: number; limitReached: boolean }> {
  if (!isBillingEnabled()) return { deleted: 0, limitReached: false }
  const deploymentMaxDays = getRedisHealthRetentionDays()
  const connectionIds = await redisConnectionRepository.findAllIdsUnsafe()
  const byOrganization = new Map<string, string[]>()
  for (const id of connectionIds) {
    const connection = await redisConnectionRepository.findByIdUnsafe(id)
    if (!connection) continue
    const list = byOrganization.get(connection.organizationId) ?? []
    list.push(id)
    byOrganization.set(connection.organizationId, list)
  }

  let deleted = 0
  let budget = CLEANUP_BATCH_SIZE * CLEANUP_MAX_BATCHES
  for (const [organizationId, ids] of byOrganization) {
    const entitlement = await getEntitlement(organizationId)
    const retentionDays = getStorageRetentionDays(entitlement, deploymentMaxDays)
    if (retentionDays >= deploymentMaxDays) continue
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    while (budget > 0) {
      const batch = await redisHealthSampleRepository.deleteOlderThanForConnections(
        ids,
        cutoff,
        Math.min(CLEANUP_BATCH_SIZE, budget)
      )
      deleted += batch
      budget -= batch
      if (batch < CLEANUP_BATCH_SIZE) break
    }
    if (budget <= 0) return { deleted, limitReached: true }
  }
  return { deleted, limitReached: false }
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
