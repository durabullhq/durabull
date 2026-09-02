import { type RedisHealthSampleBucket, redisHealthSampleRepository } from '@durabull/dal'
import { env } from '@durabull/env'
import type { RedisHealthSnapshot } from './redis-health'

const MINUTE_MS = 60_000
export const DEFAULT_REDIS_HEALTH_RETENTION_DAYS = 30
const DEFAULT_REDIS_HEALTH_SAMPLE_INTERVAL_MS = 60_000
const MAX_REDIS_HEALTH_RETENTION_DAYS = 30

export function getRedisHealthSampleIntervalMs(): number {
  return Math.max(
    5_000,
    env.DURABULL_ALERT_POLL_INTERVAL_MS ?? DEFAULT_REDIS_HEALTH_SAMPLE_INTERVAL_MS
  )
}

export function isRedisHealthHistoryEnabled(): boolean {
  return env.DURABULL_REDIS_HEALTH_HISTORY_ENABLED !== false
}

export function getRedisHealthRetentionDays(): number {
  return Math.min(
    MAX_REDIS_HEALTH_RETENTION_DAYS,
    Math.max(
      1,
      Math.floor(env.DURABULL_REDIS_HEALTH_RETENTION_DAYS ?? DEFAULT_REDIS_HEALTH_RETENTION_DAYS)
    )
  )
}

export type RedisHealthHistoryPoint = Omit<RedisHealthSampleBucket, 'capturedAt'> & {
  capturedAt: string
}

function alignToBucket(timestamp: number, bucketMs: number): number {
  return Math.floor(timestamp / bucketMs) * bucketMs
}

function emptyPoint(timestamp: number): RedisHealthHistoryPoint {
  return {
    capturedAt: new Date(timestamp).toISOString(),
    sampleCount: 0,
    memoryUsagePercent: null,
    usedMemoryBytes: null,
    residentMemoryBytes: null,
    memoryCapacityBytes: null,
    cpuUsagePercent: null,
    memoryFragmentationRatio: null,
    memoryFragmentationBytes: null,
    connectedClientsPercent: null,
    connectedClients: null,
    maxClients: null,
    blockedClients: null,
    evictedKeysPerMinute: null,
    rejectedConnectionsPerMinute: null,
  }
}

function serializeLatest(row: Awaited<ReturnType<typeof redisHealthSampleRepository.findLatest>>) {
  if (!row) return null
  return {
    capturedAt: row.capturedAt.toISOString(),
    memoryCapacitySource: row.memoryCapacitySource,
    memoryUsagePercent: row.memoryUsagePercent,
    usedMemoryBytes: row.usedMemoryBytes,
    residentMemoryBytes: row.residentMemoryBytes,
    memoryCapacityBytes: row.memoryCapacityBytes,
    cpuUsagePercent: row.cpuUsagePercent,
    memoryFragmentationRatio: row.memoryFragmentationRatio,
    memoryFragmentationBytes: row.memoryFragmentationBytes,
    connectedClientsPercent: row.connectedClientsPercent,
    connectedClients: row.connectedClients,
    maxClients: row.maxClients,
    blockedClients: row.blockedClients,
    evictedKeysPerMinute: row.evictedKeysPerMinute,
    rejectedConnectionsPerMinute: row.rejectedConnectionsPerMinute,
  }
}

export async function recordRedisHealthSnapshot(
  connectionId: string,
  snapshot: RedisHealthSnapshot
) {
  return redisHealthSampleRepository.record({
    connectionId,
    capturedAt: new Date(snapshot.capturedAt),
    memoryCapacitySource: snapshot.memoryCapacitySource,
    memoryUsagePercent: snapshot.metrics.memoryUsagePercent,
    usedMemoryBytes: snapshot.metrics.usedMemoryBytes,
    residentMemoryBytes: snapshot.metrics.residentMemoryBytes ?? null,
    memoryCapacityBytes: snapshot.metrics.memoryCapacityBytes,
    cpuUsagePercent: snapshot.metrics.cpuUsagePercent,
    cpuSeconds: snapshot.raw.cpuSeconds,
    memoryFragmentationRatio: snapshot.metrics.memoryFragmentationRatio,
    memoryFragmentationBytes: snapshot.metrics.memoryFragmentationBytes,
    connectedClientsPercent: snapshot.metrics.connectedClientsPercent,
    connectedClients: snapshot.metrics.connectedClients,
    maxClients: snapshot.metrics.maxClients,
    blockedClients: snapshot.metrics.blockedClients,
    evictedKeys: snapshot.raw.evictedKeys,
    evictedKeysPerMinute: snapshot.metrics.evictedKeysPerMinute,
    rejectedConnections: snapshot.raw.rejectedConnections,
    rejectedConnectionsPerMinute: snapshot.metrics.rejectedConnectionsPerMinute,
  })
}

export async function getRedisHealthHistory(
  connectionId: string,
  options: {
    from: Date
    to: Date
    targetPoints: number
    expectedSampleIntervalMinutes?: number
  }
) {
  const durationMs = Math.max(options.to.getTime() - options.from.getTime(), 0)
  // Account for both endpoints so the response never exceeds the requested
  // point budget after aligning the range to bucket boundaries.
  const estimatedMinuteBuckets = Math.ceil(durationMs / MINUTE_MS) + 1
  const targetPoints = Math.max(1, Math.floor(options.targetPoints))
  const expectedSampleIntervalMinutes = Math.max(
    1,
    Math.ceil(options.expectedSampleIntervalMinutes ?? 1)
  )
  const bucketMinutes = Math.max(
    expectedSampleIntervalMinutes,
    Math.ceil(estimatedMinuteBuckets / targetPoints)
  )
  const bucketMs = bucketMinutes * MINUTE_MS
  const start = alignToBucket(options.from.getTime(), bucketMs)
  const requestedEnd = alignToBucket(options.to.getTime(), bucketMs)
  const [buckets, latest] = await Promise.all([
    redisHealthSampleRepository.findBuckets({
      connectionId,
      from: new Date(start),
      toExclusive: new Date(requestedEnd + bucketMs),
      bucketSeconds: bucketMinutes * 60,
    }),
    redisHealthSampleRepository.findLatest(connectionId),
  ])
  const byTimestamp = new Map(
    buckets.map((bucket) => [alignToBucket(bucket.capturedAt.getTime(), bucketMs), bucket])
  )
  const latestCapturedAt = latest?.capturedAt.getTime()
  const nextSampleDueAt =
    latestCapturedAt !== undefined &&
    latestCapturedAt >= options.from.getTime() &&
    latestCapturedAt <= options.to.getTime()
      ? latestCapturedAt + expectedSampleIntervalMinutes * MINUTE_MS
      : null
  const pendingEndBucket =
    requestedEnd > start &&
    !byTimestamp.has(requestedEnd) &&
    nextSampleDueAt !== null &&
    nextSampleDueAt > options.to.getTime()
  const end = pendingEndBucket ? requestedEnd - bucketMs : requestedEnd
  const series: RedisHealthHistoryPoint[] = []
  let sampledBuckets = 0
  for (let timestamp = start; timestamp <= end; timestamp += bucketMs) {
    const bucket = byTimestamp.get(timestamp)
    if (!bucket || bucket.sampleCount === 0) {
      series.push(emptyPoint(timestamp))
      continue
    }
    sampledBuckets += 1
    series.push({ ...bucket, capturedAt: new Date(timestamp).toISOString() })
  }

  return {
    latest: serializeLatest(latest),
    range: {
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString(),
      bucketMinutes,
      expectedSampleIntervalMinutes,
      aggregation: 'max' as const,
      totalBuckets: series.length,
      sampledBuckets,
      coveragePercent: series.length > 0 ? (sampledBuckets / series.length) * 100 : 0,
    },
    series,
  }
}

export async function pruneRedisHealthHistory(options: {
  retentionDays: number
  batchSize?: number
  maxBatches?: number
}) {
  const retentionDays = Math.max(1, Math.floor(options.retentionDays))
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? 5_000))
  const maxBatches = Math.max(1, Math.floor(options.maxBatches ?? 20))
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  let deleted = 0

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const batchDeleted = await redisHealthSampleRepository.deleteOlderThan(cutoff, batchSize)
    deleted += batchDeleted
    if (batchDeleted < batchSize) break
  }

  return {
    deleted,
    cutoff: cutoff.toISOString(),
    retentionDays,
    limitReached: await redisHealthSampleRepository.hasOlderThan(cutoff),
  }
}
