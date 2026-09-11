import { describe, expect, it } from 'bun:test'
import type { AlertRule } from '@durabull/dal'
import {
  evaluateFailureRate,
  evaluateFailureThreshold,
  evaluateRedisHealth,
  evaluateRule,
  evaluateQueueStalled,
  type CursorState,
  type QueueSnapshot,
} from './alert-evaluator'
import type { RedisHealthSnapshot } from './redis-health'

function createSnapshot(overrides: Partial<QueueSnapshot> = {}): QueueSnapshot {
  return {
    queueName: 'email-send',
    connectionName: 'Primary Redis',
    jobCounts: {
      failed: 42,
      waiting: 0,
      active: 0,
      completed: 200,
    },
    failedMetrics: {
      count: 42,
      dataPoints: [3, 2, 4],
    },
    completedMetrics: {
      count: 200,
      dataPoints: [40, 35, 20],
    },
    ...overrides,
  }
}

describe('alert evaluator', () => {
  it('fires a Redis health alert when a metric meets its threshold exactly', () => {
    const snapshot = {
      kind: 'redis_health',
      connectionName: 'Primary Redis',
      capturedAt: '2026-09-02T18:00:00.000Z',
      memoryCapacitySource: 'maxmemory',
      metrics: {
        memoryUsagePercent: 80,
        cpuUsagePercent: 42,
        memoryFragmentationRatio: 1.2,
        memoryFragmentationBytes: 20 * 1024 * 1024,
        connectedClientsPercent: 5,
        blockedClients: 0,
        evictedKeysPerMinute: 0,
        rejectedConnectionsPerMinute: 0,
        usedMemoryBytes: 80 * 1024 * 1024,
        memoryCapacityBytes: 100 * 1024 * 1024,
        connectedClients: 50,
        maxClients: 1000,
      },
      raw: { cpuSeconds: 10, evictedKeys: 0, rejectedConnections: 0 },
    } satisfies RedisHealthSnapshot

    const evaluation = evaluateRedisHealth(
      { metric: 'memory_usage_percent', threshold: 80 },
      snapshot
    )

    expect(evaluation.triggered).toBe(true)
    expect(evaluation.summary).toContain('Memory usage is 80%')
    expect(evaluation.context).toMatchObject({
      metric: 'memory_usage_percent',
      value: 80,
      threshold: 80,
    })
  })

  it('does not treat a high fragmentation ratio with tiny byte overhead as critical', () => {
    const snapshot = {
      kind: 'redis_health',
      connectionName: 'Primary Redis',
      capturedAt: '2026-09-02T18:00:00.000Z',
      memoryCapacitySource: 'maxmemory',
      metrics: {
        memoryUsagePercent: 50,
        cpuUsagePercent: null,
        memoryFragmentationRatio: 2,
        memoryFragmentationBytes: 2 * 1024 * 1024,
        connectedClientsPercent: 5,
        blockedClients: 0,
        evictedKeysPerMinute: null,
        rejectedConnectionsPerMinute: null,
        usedMemoryBytes: 50,
        memoryCapacityBytes: 100,
        connectedClients: 5,
        maxClients: 100,
      },
      raw: { cpuSeconds: 10, evictedKeys: 0, rejectedConnections: 0 },
    } satisfies RedisHealthSnapshot

    const evaluation = evaluateRedisHealth(
      { metric: 'memory_fragmentation_ratio', threshold: 1.5 },
      snapshot
    )

    expect(evaluation.triggered).toBe(false)
    expect(evaluation.context.belowFragmentationByteFloor).toBe(true)
  })

  it('keeps rate-based Redis health rules quiet until a previous sample exists', () => {
    const snapshot = {
      kind: 'redis_health',
      connectionName: 'Primary Redis',
      capturedAt: '2026-09-02T18:00:00.000Z',
      memoryCapacitySource: 'unknown',
      metrics: {
        memoryUsagePercent: null,
        cpuUsagePercent: null,
        memoryFragmentationRatio: null,
        memoryFragmentationBytes: null,
        connectedClientsPercent: null,
        blockedClients: null,
        evictedKeysPerMinute: null,
        rejectedConnectionsPerMinute: null,
        usedMemoryBytes: null,
        memoryCapacityBytes: null,
        connectedClients: null,
        maxClients: null,
      },
      raw: { cpuSeconds: 10, evictedKeys: 0, rejectedConnections: 0 },
    } satisfies RedisHealthSnapshot

    const evaluation = evaluateRedisHealth({ metric: 'cpu_usage_percent', threshold: 80 }, snapshot)

    expect(evaluation.triggered).toBe(false)
    expect(evaluation.available).toBe(false)
    expect(evaluation.summary).toBe('')
    expect(evaluation.context.metricUnavailable).toBe(true)
  })

  it('evaluates absolute Redis allocation when no maxmemory limit is configured', () => {
    const snapshot = {
      kind: 'redis_health',
      connectionName: 'Primary Redis',
      capturedAt: '2026-09-02T18:00:00.000Z',
      memoryCapacitySource: 'unknown',
      metrics: {
        memoryUsagePercent: null,
        cpuUsagePercent: null,
        memoryFragmentationRatio: null,
        memoryFragmentationBytes: null,
        connectedClientsPercent: null,
        blockedClients: 0,
        evictedKeysPerMinute: null,
        rejectedConnectionsPerMinute: null,
        usedMemoryBytes: 512 * 1024 * 1024,
        usedMemoryMegabytes: 512,
        residentMemoryBytes: 640 * 1024 * 1024,
        residentMemoryMegabytes: 640,
        memoryCapacityBytes: null,
        connectedClients: 5,
        maxClients: 100,
      },
      raw: { cpuSeconds: 10, evictedKeys: 0, rejectedConnections: 0 },
    } satisfies RedisHealthSnapshot

    const allocated = evaluateRedisHealth(
      { metric: 'used_memory_megabytes', threshold: 500 },
      snapshot
    )
    const resident = evaluateRedisHealth(
      { metric: 'resident_memory_megabytes', threshold: 700 },
      snapshot
    )

    expect(allocated).toMatchObject({ triggered: true, available: true })
    expect(allocated.summary).toContain('Memory allocated is 512 MiB')
    expect(resident).toMatchObject({ triggered: false, available: true })
  })

  it('fires failure threshold only on new failures beyond the cursor delta', () => {
    const cursor: CursorState = {
      lastFailedCount: 35,
      lastCompletedCount: 180,
      lastCheckedAt: new Date(Date.now() - 5 * 60_000),
    }

    const evaluation = evaluateFailureThreshold(
      { count: 5, windowMinutes: 5 },
      createSnapshot({
        jobCounts: { failed: 42, waiting: 0, active: 0, completed: 200 },
      }),
      cursor
    )

    expect(evaluation.triggered).toBe(true)
    expect(evaluation.context.delta).toBe(7)
  })

  it('uses failed metrics as the baseline when no cursor exists yet', () => {
    const evaluation = evaluateFailureThreshold(
      { count: 5, windowMinutes: 5 },
      createSnapshot({
        jobCounts: { failed: 42, waiting: 0, active: 0, completed: 200 },
        failedMetrics: { count: 42, dataPoints: [2, 3, 4] },
      }),
      null
    )

    expect(evaluation.triggered).toBe(true)
    expect(evaluation.context.delta).toBe(9)
    expect(evaluation.context.usedMetricsBaseline).toBe(true)
  })

  it('clamps negative failure deltas to zero', () => {
    const cursor: CursorState = {
      lastFailedCount: 90,
      lastCompletedCount: 180,
      lastCheckedAt: new Date(Date.now() - 5 * 60_000),
    }

    const evaluation = evaluateFailureThreshold(
      { count: 1, windowMinutes: 5 },
      createSnapshot({
        jobCounts: { failed: 42, waiting: 0, active: 0, completed: 200 },
      }),
      cursor
    )

    expect(evaluation.triggered).toBe(false)
    expect(evaluation.context.delta).toBe(0)
    expect(evaluation.summary).toBe('')
  })

  it('does not fire failure threshold when cursor is outside the configured window', () => {
    const cursor: CursorState = {
      lastFailedCount: 10,
      lastCompletedCount: 100,
      lastCheckedAt: new Date(Date.now() - 120 * 60_000), // 2 hours ago (outside 5-min window)
    }

    const evaluation = evaluateFailureThreshold(
      { count: 5, windowMinutes: 5 },
      createSnapshot({
        jobCounts: { failed: 100, waiting: 0, active: 0, completed: 200 },
      }),
      cursor
    )

    expect(evaluation.triggered).toBe(false)
    expect(evaluation.context.withinWindow).toBe(false)
  })

  it('uses metric datapoints when calculating failure rate', () => {
    const evaluation = evaluateFailureRate(
      { rate: 0.2, windowMinutes: 15, minSample: 20 },
      createSnapshot({
        failedMetrics: { count: 500, dataPoints: [4, 4, 4] },
        completedMetrics: { count: 500, dataPoints: [20, 20, 20] },
      })
    )

    expect(evaluation.triggered).toBe(false)
    expect(evaluation.context.failedInWindow).toBe(12)
    expect(evaluation.context.completedInWindow).toBe(60)
  })

  it('falls back to BullMQ metric counts when datapoints are unavailable', () => {
    const evaluation = evaluateFailureRate(
      { rate: 0.2, windowMinutes: 15, minSample: 20 },
      createSnapshot({
        failedMetrics: { count: 12, dataPoints: [] },
        completedMetrics: { count: 48, dataPoints: [] },
      })
    )

    expect(evaluation.triggered).toBe(false)
    expect(evaluation.context.failedInWindow).toBe(12)
    expect(evaluation.context.completedInWindow).toBe(48)
    expect(evaluation.context.totalProcessed).toBe(60)
  })

  it('does not fire failure rate alerts when the rate equals the threshold exactly', () => {
    const evaluation = evaluateFailureRate(
      { rate: 0.2, windowMinutes: 15, minSample: 20 },
      createSnapshot({
        failedMetrics: { count: 10, dataPoints: [4, 6] },
        completedMetrics: { count: 40, dataPoints: [10, 30] },
      })
    )

    expect(evaluation.triggered).toBe(false)
    expect(evaluation.context.rate).toBe(0.2)
  })

  it('skips failure rate alerts below the minimum sample threshold', () => {
    const evaluation = evaluateFailureRate(
      { rate: 0.05, windowMinutes: 15, minSample: 500 },
      createSnapshot({
        failedMetrics: { count: 10, dataPoints: [5, 5] },
        completedMetrics: { count: 20, dataPoints: [10, 10] },
      })
    )

    expect(evaluation.triggered).toBe(false)
    expect(evaluation.context.totalProcessed).toBe(30)
  })

  it('detects a stalled queue when work is present and completions stop', () => {
    const cursor: CursorState = {
      lastFailedCount: 5,
      lastCompletedCount: 220,
      lastCheckedAt: new Date(Date.now() - 20 * 60_000),
    }

    const evaluation = evaluateQueueStalled(
      { stalledMinutes: 10 },
      createSnapshot({
        jobCounts: { failed: 42, waiting: 8, active: 2, completed: 220 },
        completedMetrics: { count: 0, dataPoints: [0, 0, 0] },
      }),
      cursor
    )

    expect(evaluation.triggered).toBe(true)
    expect(evaluation.summary).toContain('appears stalled')
  })

  it('does not fire stalled alerts when new completions were observed since the last check', () => {
    const cursor: CursorState = {
      lastFailedCount: 5,
      lastCompletedCount: 210,
      lastCheckedAt: new Date(Date.now() - 20 * 60_000),
    }

    const evaluation = evaluateQueueStalled(
      { stalledMinutes: 10 },
      createSnapshot({
        jobCounts: { failed: 42, waiting: 8, active: 2, completed: 220 },
        completedMetrics: { count: 0, dataPoints: [0, 0, 0] },
      }),
      cursor
    )

    expect(evaluation.triggered).toBe(false)
    expect(evaluation.context.completionDelta).toBe(10)
  })

  it('does not fire stalled alerts before the configured time window elapses', () => {
    const cursor: CursorState = {
      lastFailedCount: 5,
      lastCompletedCount: 220,
      lastCheckedAt: new Date(Date.now() - 3 * 60_000),
    }

    const evaluation = evaluateQueueStalled(
      { stalledMinutes: 10 },
      createSnapshot({
        jobCounts: { failed: 42, waiting: 8, active: 2, completed: 220 },
        completedMetrics: { count: 0, dataPoints: [0, 0, 0] },
      }),
      cursor
    )

    expect(evaluation.triggered).toBe(false)
    expect(Number(evaluation.context.minutesSinceLastCheck)).toBeLessThan(10)
  })

  it('routes evaluateRule to the correct evaluator and handles unknown types safely', () => {
    const thresholdRule = {
      id: 'rule-threshold',
      organizationId: 'org-1',
      connectionId: 'conn-1',
      queueName: 'email-send',
      queueFilterMode: null,
      filterQueueNames: [],
      name: 'Failures',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      enabled: true,
      notificationChannels: [],
      cooldownMinutes: 30,
      mutedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies AlertRule

    const thresholdEvaluation = evaluateRule(thresholdRule, createSnapshot(), {
      lastFailedCount: 35,
      lastCompletedCount: 180,
      lastCheckedAt: new Date(Date.now() - 5 * 60_000),
    })

    expect(thresholdEvaluation.triggered).toBe(true)

    const unknownEvaluation = evaluateRule(
      {
        ...thresholdRule,
        type: 'totally_unknown' as AlertRule['type'],
      },
      createSnapshot(),
      null
    )

    expect(unknownEvaluation).toEqual({
      triggered: false,
      summary: 'Unknown rule type: totally_unknown',
      context: {},
    })
  })
})
