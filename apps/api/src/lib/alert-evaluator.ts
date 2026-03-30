import type { AlertRule } from '@durabull/dal'
import { z } from 'zod'

export interface AlertEvaluation {
  triggered: boolean
  summary: string
  context: Record<string, unknown>
}

export interface QueueSnapshot {
  queueName: string
  connectionName: string
  jobCounts: { failed: number; waiting: number; active: number; completed: number }
  failedMetrics: { count: number; dataPoints: number[] }
  completedMetrics: { count: number; dataPoints: number[] }
}

export interface CursorState {
  lastFailedCount: number
  lastCompletedCount: number
  lastCheckedAt: Date
}

export interface FailureThresholdConfig {
  count: number
  windowMinutes: number
}

export interface FailureRateConfig {
  rate: number
  windowMinutes: number
  minSample: number
}

export interface QueueStalledConfig {
  stalledMinutes: number
}

const failureThresholdConfigSchema = z.object({
  count: z.number().int().min(1),
  windowMinutes: z.number().int().min(1),
})

const failureRateConfigSchema = z.object({
  rate: z.number().min(0.01).max(1),
  windowMinutes: z.number().int().min(1),
  minSample: z.number().int().min(1),
})

const queueStalledConfigSchema = z.object({
  stalledMinutes: z.number().int().min(1),
})

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function getMetricWindowCount(metrics: { count: number; dataPoints: number[] }): number {
  return metrics.dataPoints.length > 0 ? sum(metrics.dataPoints) : metrics.count
}

/**
 * failure_threshold: ">= N NEW failures in M minutes"
 * Uses cursor delta scoped by the configured window so old failures don't re-trigger
 * and monitor downtime doesn't produce false positives.
 */
export function evaluateFailureThreshold(
  config: FailureThresholdConfig,
  snapshot: QueueSnapshot,
  cursor: CursorState | null
): AlertEvaluation {
  const currentFailed = snapshot.jobCounts.failed
  const failuresInWindow = getMetricWindowCount(snapshot.failedMetrics)
  const previousFailed = cursor?.lastFailedCount ?? 0
  const delta = cursor ? Math.max(0, currentFailed - previousFailed) : failuresInWindow

  // Only count the delta if the cursor falls within the configured window.
  // If the monitor was down or the last check is older than the window, skip
  // to avoid counting a large backlog as a sudden spike.
  const minutesSinceLastCheck = cursor ? (Date.now() - cursor.lastCheckedAt.getTime()) / 60_000 : 0

  // Allow a 10% tolerance beyond the window to account for polling jitter and clock drift
  const windowWithTolerance = config.windowMinutes * 1.1
  const withinWindow = cursor ? minutesSinceLastCheck <= windowWithTolerance : true
  const triggered = withinWindow && delta >= config.count

  return {
    triggered,
    summary: triggered
      ? `${delta} jobs failed in ${snapshot.queueName} (last ${config.windowMinutes} min, threshold: ${config.count})`
      : '',
    context: {
      delta,
      currentFailed,
      previousFailed,
      failuresInWindow,
      threshold: config.count,
      windowMinutes: config.windowMinutes,
      minutesSinceLastCheck,
      withinWindow,
      usedMetricsBaseline: cursor === null,
    },
  }
}

/**
 * failure_rate: "failure rate > X% over M minutes"
 * Uses BullMQ metrics count within retention window.
 */
export function evaluateFailureRate(
  config: FailureRateConfig,
  snapshot: QueueSnapshot
): AlertEvaluation {
  const failedInWindow = getMetricWindowCount(snapshot.failedMetrics)
  const completedInWindow = getMetricWindowCount(snapshot.completedMetrics)
  const totalProcessed = failedInWindow + completedInWindow

  if (totalProcessed < config.minSample) {
    return {
      triggered: false,
      summary: '',
      context: { failedInWindow, completedInWindow, totalProcessed, minSample: config.minSample },
    }
  }

  const rate = failedInWindow / totalProcessed
  const triggered = rate > config.rate

  return {
    triggered,
    summary: triggered
      ? `${(rate * 100).toFixed(1)}% failure rate in ${snapshot.queueName} (${failedInWindow}/${totalProcessed} jobs, threshold: ${(config.rate * 100).toFixed(0)}%)`
      : '',
    context: {
      rate,
      failedInWindow,
      completedInWindow,
      totalProcessed,
      threshold: config.rate,
      windowMinutes: config.windowMinutes,
    },
  }
}

/**
 * queue_stalled: waiting/active jobs with no completions for configured window.
 */
export function evaluateQueueStalled(
  config: QueueStalledConfig,
  snapshot: QueueSnapshot,
  cursor: CursorState | null
): AlertEvaluation {
  const hasWorkInQueue = snapshot.jobCounts.waiting > 0 || snapshot.jobCounts.active > 0
  const completedInWindow = getMetricWindowCount(snapshot.completedMetrics)
  const completionDelta = cursor
    ? Math.max(0, snapshot.jobCounts.completed - cursor.lastCompletedCount)
    : 0
  const minutesSinceLastCheck = cursor
    ? (Date.now() - cursor.lastCheckedAt.getTime()) / 60_000
    : Number.POSITIVE_INFINITY

  const triggered =
    hasWorkInQueue &&
    completedInWindow === 0 &&
    completionDelta === 0 &&
    minutesSinceLastCheck >= config.stalledMinutes

  return {
    triggered,
    summary: triggered
      ? `${snapshot.queueName} appears stalled: ${snapshot.jobCounts.waiting} waiting, ${snapshot.jobCounts.active} active, 0 completions in last ${config.stalledMinutes} min`
      : '',
    context: {
      waiting: snapshot.jobCounts.waiting,
      active: snapshot.jobCounts.active,
      completedInWindow,
      completionDelta,
      stalledMinutes: config.stalledMinutes,
      minutesSinceLastCheck,
    },
  }
}

export function evaluateRule(
  rule: AlertRule,
  snapshot: QueueSnapshot,
  cursor: CursorState | null
): AlertEvaluation {
  const config = (rule.config ?? {}) as Record<string, unknown>

  switch (rule.type) {
    case 'failure_threshold': {
      const parsed = failureThresholdConfigSchema.safeParse(config)
      if (!parsed.success) {
        return {
          triggered: false,
          summary: `Invalid config for rule ${rule.id}: ${parsed.error.message}`,
          context: {},
        }
      }
      return evaluateFailureThreshold(parsed.data, snapshot, cursor)
    }
    case 'failure_rate': {
      const parsed = failureRateConfigSchema.safeParse(config)
      if (!parsed.success) {
        return {
          triggered: false,
          summary: `Invalid config for rule ${rule.id}: ${parsed.error.message}`,
          context: {},
        }
      }
      return evaluateFailureRate(parsed.data, snapshot)
    }
    case 'queue_stalled': {
      const parsed = queueStalledConfigSchema.safeParse(config)
      if (!parsed.success) {
        return {
          triggered: false,
          summary: `Invalid config for rule ${rule.id}: ${parsed.error.message}`,
          context: {},
        }
      }
      return evaluateQueueStalled(parsed.data, snapshot, cursor)
    }
    default:
      return { triggered: false, summary: `Unknown rule type: ${rule.type}`, context: {} }
  }
}
