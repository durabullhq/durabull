import { alertCheckCursorRepository, alertRuleRepository } from '@durabull/dal'
import type { GetRedisHealthHandlerInput, GetRedisHealthHandlerOutput } from '@durabull/mcp'

import {
  REDIS_HEALTH_CURSOR_SCOPE,
  redisHealthConfigSchema,
  restoreRedisHealthSnapshot,
} from '../../lib/redis-health'
import {
  getRedisHealthHistory,
  getRedisHealthRetentionDays,
  getRedisHealthSampleIntervalMs,
  isRedisHealthHistoryEnabled,
  serializeRedisHealthSnapshot,
} from '../../lib/redis-health-history'
import { requireConnectionForPrincipal } from './shared'

export const REDIS_HEALTH_DEFAULT_WINDOW_MINUTES = 60
export const REDIS_HEALTH_MAX_WINDOW_MINUTES = 43_200
export const REDIS_HEALTH_DEFAULT_TARGET_POINTS = 60
export const REDIS_HEALTH_MAX_TARGET_POINTS = 100

interface GetRedisHealthHandlerDeps {
  requireConnectionForPrincipal: typeof requireConnectionForPrincipal
  findCursor: typeof alertCheckCursorRepository.findByConnectionQueue
  findRules: typeof alertRuleRepository.findByConnection
  getHistory: typeof getRedisHealthHistory
  sampleIntervalMs: () => number
  historyEnabled: () => boolean
  retentionDays: () => number
  now: () => number
}

const defaultDeps: GetRedisHealthHandlerDeps = {
  requireConnectionForPrincipal,
  findCursor: alertCheckCursorRepository.findByConnectionQueue,
  findRules: alertRuleRepository.findByConnection,
  getHistory: getRedisHealthHistory,
  sampleIntervalMs: getRedisHealthSampleIntervalMs,
  historyEnabled: isRedisHealthHistoryEnabled,
  retentionDays: getRedisHealthRetentionDays,
  now: () => Date.now(),
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

export function createGetRedisHealthHandler(deps: GetRedisHealthHandlerDeps = defaultDeps) {
  return async function getRedisHealthHandler(
    input: GetRedisHealthHandlerInput
  ): Promise<GetRedisHealthHandlerOutput> {
    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)

    const windowMinutes = clamp(
      input.windowMinutes,
      REDIS_HEALTH_DEFAULT_WINDOW_MINUTES,
      5,
      REDIS_HEALTH_MAX_WINDOW_MINUTES
    )
    const targetPoints = clamp(
      input.targetPoints,
      REDIS_HEALTH_DEFAULT_TARGET_POINTS,
      10,
      REDIS_HEALTH_MAX_TARGET_POINTS
    )

    const nowMs = deps.now()
    const to = new Date(nowMs)
    const from = new Date(nowMs - windowMinutes * 60_000)
    const sampleIntervalMs = deps.sampleIntervalMs()
    const staleAfterMs = Math.max(180_000, sampleIntervalMs * 3)

    const [cursor, rules] = await Promise.all([
      deps.findCursor(connection.id, REDIS_HEALTH_CURSOR_SCOPE),
      deps.findRules(connection.id, connection.organizationId),
    ])
    const currentSnapshot = restoreRedisHealthSnapshot(cursor?.lastMetricsSnapshot)

    const history = await deps.getHistory(connection.id, {
      from,
      to,
      targetPoints,
      expectedSampleIntervalMinutes: sampleIntervalMs / 60_000,
      latestObservedAt:
        currentSnapshot?.historyPersisted === true
          ? new Date(currentSnapshot.capturedAt)
          : undefined,
    })

    const currentLatest = currentSnapshot ? serializeRedisHealthSnapshot(currentSnapshot) : null
    const latestSource =
      currentLatest &&
      (!history.latest ||
        Date.parse(currentLatest.capturedAt) >= Date.parse(history.latest.capturedAt))
        ? currentLatest
        : history.latest

    const latest = latestSource
      ? {
          capturedAt: latestSource.capturedAt,
          memoryCapacitySource: latestSource.memoryCapacitySource,
          isStale: nowMs - Date.parse(latestSource.capturedAt) > staleAfterMs,
          memoryUsagePercent: latestSource.memoryUsagePercent ?? null,
          usedMemoryBytes: latestSource.usedMemoryBytes ?? null,
          residentMemoryBytes: latestSource.residentMemoryBytes ?? null,
          memoryCapacityBytes: latestSource.memoryCapacityBytes ?? null,
          cpuUsagePercent: latestSource.cpuUsagePercent ?? null,
          memoryFragmentationRatio: latestSource.memoryFragmentationRatio ?? null,
          memoryFragmentationBytes: latestSource.memoryFragmentationBytes ?? null,
          connectedClientsPercent: latestSource.connectedClientsPercent ?? null,
          connectedClients: latestSource.connectedClients ?? null,
          maxClients: latestSource.maxClients ?? null,
          blockedClients: latestSource.blockedClients ?? null,
          evictedKeysPerMinute: latestSource.evictedKeysPerMinute ?? null,
          rejectedConnectionsPerMinute: latestSource.rejectedConnectionsPerMinute ?? null,
        }
      : null

    const thresholds = rules.flatMap((rule) => {
      if (
        rule.type !== 'redis_health' ||
        !rule.enabled ||
        (rule.mutedUntil !== null && rule.mutedUntil.getTime() > nowMs)
      ) {
        return []
      }
      const config = redisHealthConfigSchema.safeParse(rule.config)
      if (!config.success) return []
      return [
        {
          ruleId: rule.id,
          name: rule.name,
          metric: config.data.metric,
          threshold: config.data.threshold,
        },
      ]
    })

    return {
      connectionId: connection.id,
      collectionEnabled: deps.historyEnabled(),
      retentionDays: deps.retentionDays(),
      staleAfterMs,
      latest,
      thresholds,
      range: {
        from: history.range.from,
        to: history.range.to,
        bucketMinutes: history.range.bucketMinutes,
        aggregation: 'max',
        totalBuckets: history.range.totalBuckets,
        sampledBuckets: history.range.sampledBuckets,
        coveragePercent: history.range.coveragePercent,
      },
      series: history.series.map((point) => ({
        capturedAt: point.capturedAt,
        sampleCount: point.sampleCount,
        memoryUsagePercent: point.memoryUsagePercent,
        usedMemoryBytes: point.usedMemoryBytes,
        residentMemoryBytes: point.residentMemoryBytes,
        memoryCapacityBytes: point.memoryCapacityBytes,
        cpuUsagePercent: point.cpuUsagePercent,
        memoryFragmentationRatio: point.memoryFragmentationRatio,
        memoryFragmentationBytes: point.memoryFragmentationBytes,
        connectedClientsPercent: point.connectedClientsPercent,
        connectedClients: point.connectedClients,
        maxClients: point.maxClients,
        blockedClients: point.blockedClients,
        evictedKeysPerMinute: point.evictedKeysPerMinute,
        rejectedConnectionsPerMinute: point.rejectedConnectionsPerMinute,
      })),
    }
  }
}

export const getRedisHealthHandler = createGetRedisHealthHandler()
