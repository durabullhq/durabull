import { randomUUID } from 'node:crypto'
import {
  type AlertDelivery,
  type AlertEvent,
  type AlertRule,
  alertCheckCursorRepository,
  alertDeliveryRepository,
  alertEventRepository,
  alertRuleRepository,
  linearIssueResolutionRepository,
  type RedisConnection,
  redisConnectionRepository,
  redisDiscoveredQueueRepository,
  shouldUseEnvConnections,
} from '@durabull/dal'
import { env } from '@durabull/env'
import type { JobType } from 'bullmq'
import {
  type AlertEvaluation,
  type CursorState,
  evaluateRedisHealthRule,
  evaluateRule,
  type QueueSnapshot,
} from './alert-evaluator'
import {
  dispatchAlertNotification,
  type NotificationChannel,
  processAlertDeliveries,
} from './alert-notifier'
import {
  finalizePendingAlertRuleDeletion,
  syncLinearIssuesForResolvedEvents,
} from './alert-resolution'
import { toRedisConnectionOptions } from './connection-options'
import { getQueue, getRedis } from './redis'
import {
  buildRedisHealthSnapshot,
  REDIS_HEALTH_CURSOR_SCOPE,
  REDIS_HEALTH_EVENT_SCOPE,
  restoreRedisHealthSnapshot,
} from './redis-health'
import {
  getRedisHealthRetentionDays,
  getRedisHealthSampleIntervalMs,
  isRedisHealthHistoryEnabled,
  recordRedisHealthSnapshot,
} from './redis-health-history'

const DEFAULT_DELIVERY_SWEEP_INTERVAL_MS = 15_000
const MAX_STARTUP_JITTER_MS = 30_000
const CONNECTION_TIMEOUT_MS = 30_000
const REDIS_INFO_TIMEOUT_MS = 20_000
const MAX_CONCURRENT_CONNECTIONS = 3
const MAX_CONCURRENT_QUEUES = 5
const METRICS_WINDOW_MINUTES = 60
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const EVENT_RETENTION_DAYS = 90
const PENDING_LINEAR_SYNC_MAX_RETENTION_DAYS = 365
const EVENT_CLEANUP_BATCH_SIZE = 5_000
const EVENT_CLEANUP_MAX_BATCHES = 20
const LINEAR_IDEMPOTENCY_RETENTION_DAYS = 365
const DEFAULT_JOB_FAILED_MAX_ISSUES_PER_POLL = 100
const HARD_CAP_JOB_FAILED_MAX_ISSUES_PER_POLL = 500
const DELIVERY_SWEEP_LIMIT = 10
const MAX_CONCURRENT_DELIVERY_SWEEPS = 10
const DELIVERY_SWEEP_BUDGET_MS = 20_000
const DEFAULT_JOB_AUTO_RESOLVE_INTERVAL_MS = 5 * 60_000
const JOB_AUTO_RESOLVE_BATCH_LIMIT = 500

let pollTimer: ReturnType<typeof setInterval> | null = null
let deliverySweepTimer: ReturnType<typeof setInterval> | null = null
let resolutionRecoveryTimer: ReturnType<typeof setInterval> | null = null
let cleanupTimer: ReturnType<typeof setInterval> | null = null
let jobAutoResolveTimer: ReturnType<typeof setInterval> | null = null
let startupTimer: ReturnType<typeof setTimeout> | null = null
let isRunning = false
let pollInProgress = false
let deliverySweepInProgress = false
let resolutionRecoveryInProgress = false
let jobAutoResolveInProgress = false
// Timeouts bound a cycle's wait, but Redis/DB promises may remain alive. Keep
// those connections registered until their work actually settles so later
// cycles cannot start another worker against the same cursor.
const inFlightConnectionPolls = new Map<string, Promise<void>>()

async function runConnectionPollOnce(
  connectionId: string,
  worker: () => Promise<void>,
  timeoutMs = CONNECTION_TIMEOUT_MS
): Promise<void> {
  if (inFlightConnectionPolls.has(connectionId)) return
  const processing = Promise.resolve()
    .then(worker)
    .finally(() => {
      if (inFlightConnectionPolls.get(connectionId) === processing) {
        inFlightConnectionPolls.delete(connectionId)
      }
    })
  inFlightConnectionPolls.set(connectionId, processing)
  try {
    await withTimeout(processing, timeoutMs, `Connection ${connectionId}`)
  } catch (error) {
    // One unavailable customer must not stop other connections in this cycle.
    console.error(`[alert-monitor] Connection ${connectionId} poll failed:`, error)
  }
}

interface MonitorCursorRow {
  lastMetricsSnapshot: unknown
  lastCheckedAt: Date
  lastObservationToken: string
  lastFailedCount: number
  lastCompletedCount: number
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function isPendingEvaluation(cursor: MonitorCursorRow | undefined): boolean {
  return objectValue(cursor?.lastMetricsSnapshot)?.evaluationApplied === false
}

function restoreEvaluationBaseline(value: unknown): CursorState | null {
  const baseline = objectValue(objectValue(value)?.evaluationBaseline)
  if (!baseline) return null
  const lastCheckedAt =
    typeof baseline.lastCheckedAt === 'string' ? new Date(baseline.lastCheckedAt) : null
  if (
    !lastCheckedAt ||
    !Number.isFinite(lastCheckedAt.getTime()) ||
    typeof baseline.lastFailedCount !== 'number' ||
    typeof baseline.lastCompletedCount !== 'number'
  ) {
    return null
  }
  return {
    lastCheckedAt,
    lastFailedCount: baseline.lastFailedCount,
    lastCompletedCount: baseline.lastCompletedCount,
  }
}

function restoreQueueSnapshot(value: unknown): QueueSnapshot | null {
  const source = objectValue(value)
  const jobCounts = objectValue(source?.jobCounts)
  const failedMetrics = objectValue(source?.failedMetrics)
  const completedMetrics = objectValue(source?.completedMetrics)
  if (
    source?.kind !== 'queue' ||
    typeof source.queueName !== 'string' ||
    typeof source.connectionName !== 'string' ||
    !jobCounts ||
    !failedMetrics ||
    !completedMetrics ||
    !['failed', 'waiting', 'active', 'completed'].every(
      (key) => typeof jobCounts[key] === 'number'
    ) ||
    typeof failedMetrics.count !== 'number' ||
    !Array.isArray(failedMetrics.dataPoints) ||
    typeof completedMetrics.count !== 'number' ||
    !Array.isArray(completedMetrics.dataPoints)
  ) {
    return null
  }

  return {
    queueName: source.queueName,
    connectionName: source.connectionName,
    jobCounts: jobCounts as QueueSnapshot['jobCounts'],
    failedMetrics: failedMetrics as unknown as QueueSnapshot['failedMetrics'],
    completedMetrics: completedMetrics as unknown as QueueSnapshot['completedMetrics'],
  }
}

function capturedRuleRevisions(rules: AlertRule[]): Array<{ id: string; updatedAt: string }> {
  return rules.map((rule) => ({ id: rule.id, updatedAt: rule.updatedAt.toISOString() }))
}

/**
 * Pending observations are replayed only for the exact rule revisions that
 * existed when the sample was collected. This prevents a new or edited rule
 * from firing against data that predates that rule revision after a restart.
 * Legacy pending snapshots intentionally match no rules and are safely
 * superseded by the fresh sample collected immediately after replay.
 */
function wasRuleRevisionCaptured(rule: AlertRule, value: unknown): boolean {
  const revisions = objectValue(value)?.applicableRuleRevisions
  if (!Array.isArray(revisions)) return false
  return revisions.some((value) => {
    const revision = objectValue(value)
    return revision?.id === rule.id && revision.updatedAt === rule.updatedAt.toISOString()
  })
}

function getPollIntervalMs(): number {
  return getRedisHealthSampleIntervalMs()
}

function getDeliverySweepIntervalMs(): number {
  return Math.max(5_000, Math.min(getPollIntervalMs(), DEFAULT_DELIVERY_SWEEP_INTERVAL_MS))
}

function getJobAutoResolveIntervalMs(): number {
  return Math.max(
    30_000,
    env.DURABULL_ALERT_JOB_RESOLVE_INTERVAL_MS ?? DEFAULT_JOB_AUTO_RESOLVE_INTERVAL_MS
  )
}

function isAlertMonitorEnabled(): boolean {
  return env.DURABULL_ALERT_ENABLED !== false
}

function getUniqueQueueNames(rules: AlertRule[], discoveredQueueNames: string[]): string[] {
  const queueNames = new Set<string>()
  let needsAllDiscovered = false

  for (const rule of rules) {
    if (typeof rule.queueName === 'string' && rule.queueName.trim().length > 0) {
      queueNames.add(rule.queueName)
    }

    const filterList = Array.isArray(rule.filterQueueNames) ? rule.filterQueueNames : []

    if (rule.queueFilterMode === 'include' && filterList.length > 0) {
      for (const name of filterList) queueNames.add(name)
    } else if (rule.queueName === null) {
      needsAllDiscovered = true
    }
  }

  if (needsAllDiscovered) {
    for (const queueName of discoveredQueueNames) {
      queueNames.add(queueName)
    }
  }

  return Array.from(queueNames)
}

function isRuleApplicableToQueue(rule: AlertRule, queueName: string): boolean {
  if (rule.queueFilterMode === 'include') {
    const included = Array.isArray(rule.filterQueueNames) ? rule.filterQueueNames : []
    if (included.length > 0) return included.includes(queueName)
    return rule.queueName === queueName
  }

  if (rule.queueFilterMode === 'exclude') {
    const excluded = Array.isArray(rule.filterQueueNames) ? rule.filterQueueNames : []
    return !excluded.includes(queueName)
  }

  if (rule.queueName !== null) {
    return rule.queueName === queueName
  }

  return true
}

async function loadDiscoveredQueueNames(connectionId: string): Promise<string[]> {
  const names: string[] = []
  const pageSize = 500
  let offset = 0

  while (true) {
    const rows = await redisDiscoveredQueueRepository.listByConnection(connectionId, {
      offset,
      limit: pageSize,
    })
    if (rows.length === 0) break
    names.push(...rows.map((row) => row.name))
    if (rows.length < pageSize) break
    offset += rows.length
  }

  return names
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function startAlertMonitor(): void {
  if (isRunning) return
  const alertsEnabled = isAlertMonitorEnabled()
  const redisHealthHistoryEnabled = isRedisHealthHistoryEnabled()

  isRunning = true
  const pollIntervalMs = getPollIntervalMs()
  const deliverySweepIntervalMs = getDeliverySweepIntervalMs()
  const jitter = Math.floor(Math.random() * MAX_STARTUP_JITTER_MS)
  console.log(
    `[alert-monitor] Starting in ${(jitter / 1000).toFixed(0)}s, poll interval ${Math.round(pollIntervalMs / 1000)}s, alerts ${alertsEnabled ? 'enabled' : 'disabled'}, Redis health history ${redisHealthHistoryEnabled ? `enabled (${getRedisHealthRetentionDays()}d retention)` : 'disabled'}`
  )

  startupTimer = setTimeout(() => {
    void runCleanup()
    cleanupTimer = setInterval(() => void runCleanup(), CLEANUP_INTERVAL_MS)
    if (alertsEnabled || redisHealthHistoryEnabled) {
      void runPollCycle()
      pollTimer = setInterval(() => void runPollCycle(), pollIntervalMs)
    }
    // Manual resolutions and rule deletions still need external cleanup when
    // automatic alert evaluation is disabled.
    resolutionRecoveryTimer = setInterval(
      () => void runResolutionRecoveryCycle(),
      deliverySweepIntervalMs
    )
    if (alertsEnabled) {
      void runDeliverySweepCycle()
      void runJobAutoResolveCycle()
      deliverySweepTimer = setInterval(() => void runDeliverySweepCycle(), deliverySweepIntervalMs)
      jobAutoResolveTimer = setInterval(
        () => void runJobAutoResolveCycle(),
        getJobAutoResolveIntervalMs()
      )
    }
  }, jitter)
}

export function stopAlertMonitor(): void {
  if (startupTimer) {
    clearTimeout(startupTimer)
    startupTimer = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (deliverySweepTimer) {
    clearInterval(deliverySweepTimer)
    deliverySweepTimer = null
  }
  if (resolutionRecoveryTimer) {
    clearInterval(resolutionRecoveryTimer)
    resolutionRecoveryTimer = null
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
  if (jobAutoResolveTimer) {
    clearInterval(jobAutoResolveTimer)
    jobAutoResolveTimer = null
  }
  isRunning = false
  console.log('[alert-monitor] Stopped.')
}

async function runPollCycle(): Promise<void> {
  if (pollInProgress) return
  pollInProgress = true

  try {
    // Skips disabled rules and rules snoozed via mutedUntil; snoozed rules
    // resume automatically on the first poll after the timestamp passes.
    const evaluateAlerts = isAlertMonitorEnabled()
    const collectRedisHealth = isRedisHealthHistoryEnabled()
    const filterEnvConnections = evaluateAlerts && shouldUseEnvConnections()
    const [rules, connections] = await Promise.all([
      evaluateAlerts ? alertRuleRepository.findAllActive() : Promise.resolve([]),
      collectRedisHealth || filterEnvConnections
        ? redisConnectionRepository.findAllIdsUnsafe()
        : Promise.resolve([]),
    ])
    const activeConnectionIds = new Set(connections)
    const rulesByConnection = new Map<string, AlertRule[]>()
    for (const rule of rules) {
      // Env-managed connections can leave historical rows and rules behind
      // when configuration changes. Never dial a connection that is no longer
      // part of the active configuration.
      if (filterEnvConnections && !activeConnectionIds.has(rule.connectionId)) continue
      const existing = rulesByConnection.get(rule.connectionId) ?? []
      existing.push(rule)
      rulesByConnection.set(rule.connectionId, existing)
    }
    if (collectRedisHealth) {
      for (const connectionId of connections) {
        if (!rulesByConnection.has(connectionId)) rulesByConnection.set(connectionId, [])
      }
    }

    await processWithConcurrency(
      Array.from(rulesByConnection.entries()),
      MAX_CONCURRENT_CONNECTIONS,
      async ([connectionId, connectionRules]) => {
        await runConnectionPollOnce(connectionId, () =>
          processConnection(connectionId, connectionRules, { collectRedisHealth })
        )
      }
    )
  } catch (error) {
    console.error('[alert-monitor] Poll cycle failed:', error)
  } finally {
    pollInProgress = false
  }
}

async function runDeliverySweepCycle(): Promise<void> {
  if (deliverySweepInProgress) return
  deliverySweepInProgress = true
  try {
    await processDueAlertDeliveries()
  } catch (error) {
    console.error('[alert-monitor] Delivery sweep cycle failed:', error)
  } finally {
    deliverySweepInProgress = false
  }
}

async function processDueAlertDeliveries(): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < DELIVERY_SWEEP_BUDGET_MS) {
    const deliveries = await alertDeliveryRepository.claimDue(DELIVERY_SWEEP_LIMIT)
    if (deliveries.length === 0) return

    await processWithConcurrency(
      deliveries,
      MAX_CONCURRENT_DELIVERY_SWEEPS,
      processDueAlertDelivery
    )
    if (deliveries.length < DELIVERY_SWEEP_LIMIT) return
  }
}

async function runResolutionRecoveryCycle(): Promise<void> {
  if (resolutionRecoveryInProgress) return
  resolutionRecoveryInProgress = true
  try {
    const pendingSync = await alertEventRepository.findPendingLinearResolutionSync(10)
    if (pendingSync.length > 0) {
      await syncLinearIssuesForResolvedEvents(pendingSync)
    }

    const deletionClaimToken = randomUUID()
    const deletionRules = await alertRuleRepository.claimDeletionRequested(3, deletionClaimToken)
    await processWithConcurrency(deletionRules, 3, async (rule) => {
      await finalizePendingAlertRuleDeletion(rule, deletionClaimToken)
    })
  } catch (error) {
    console.error('[alert-monitor] Resolution recovery cycle failed:', error)
  } finally {
    resolutionRecoveryInProgress = false
  }
}

async function processDueAlertDelivery(delivery: AlertDelivery): Promise<void> {
  try {
    const event = await alertEventRepository.findById(
      delivery.alertEventId,
      delivery.organizationId
    )
    if (!event) {
      await markDeliveryFailedWithoutRetry(delivery, 'Alert event no longer exists.')
      return
    }

    const rule = await alertRuleRepository.findById(event.alertRuleId, event.organizationId)
    if (!rule) {
      await markDeliveryFailedWithoutRetry(delivery, 'Alert rule no longer exists.')
      return
    }

    const connection = await redisConnectionRepository.findByIdUnsafe(event.connectionId)
    if (!connection) {
      await markDeliveryFailedWithoutRetry(delivery, 'Redis connection no longer exists.')
      return
    }

    await processAlertDeliveries(event, connection, rule.name, {
      claimedDeliveries: [delivery],
    })
    await markLegacyNotificationSentIfComplete(event.id)
  } catch (error) {
    console.error('[alert-monitor] Due delivery sweep failed:', {
      deliveryId: delivery.id,
      alertEventId: delivery.alertEventId,
      error,
    })
    await markDeliveryFailedForRetry(
      delivery,
      error instanceof Error ? error.message : 'Due delivery sweep failed.'
    )
  }
}

async function markDeliveryFailedWithoutRetry(
  delivery: AlertDelivery,
  error: string
): Promise<void> {
  if (!(delivery.claimedAt instanceof Date)) {
    console.error(
      '[alert-monitor] Claimed delivery is missing claimedAt; cannot mark non-retryable.',
      {
        deliveryId: delivery.id,
      }
    )
    return
  }
  await alertDeliveryRepository.markFailed(delivery.id, {
    error,
    retryable: false,
    expectedClaimedAt: delivery.claimedAt,
  })
}

async function markDeliveryFailedForRetry(delivery: AlertDelivery, error: string): Promise<void> {
  if (!(delivery.claimedAt instanceof Date)) {
    console.error('[alert-monitor] Claimed delivery is missing claimedAt; cannot mark retryable.', {
      deliveryId: delivery.id,
    })
    return
  }
  await alertDeliveryRepository.markFailed(delivery.id, {
    error,
    retryable: true,
    nextRetryAt: new Date(Date.now() + 30_000),
    expectedClaimedAt: delivery.claimedAt,
  })
}

async function processConnection(
  connectionId: string,
  rules: AlertRule[],
  options: { collectRedisHealth?: boolean } = {}
): Promise<void> {
  try {
    // findByIdUnsafe bypasses org-scoping because this internal worker monitors
    // connections across organizations. IDs originate only from persisted rules
    // or the repository's internal active-connection enumeration, never user input.
    const connection = await redisConnectionRepository.findByIdUnsafe(connectionId)
    if (!connection) return

    const cursors = await alertCheckCursorRepository.findByConnection(connectionId)
    const cursorMap = new Map(cursors.map((cursor) => [cursor.queueName, cursor]))
    const redisHealthRules = rules.filter((rule) => rule.type === 'redis_health')
    const queueRules = rules.filter((rule) => rule.type !== 'redis_health')

    if (redisHealthRules.length > 0 || options.collectRedisHealth === true) {
      await processRedisHealthRules(connection, redisHealthRules, cursorMap, {
        persistHistory: options.collectRedisHealth === true,
      })
    }

    if (queueRules.length === 0) return

    const discoveredQueueNames = await loadDiscoveredQueueNames(connectionId)
    const queueNames = getUniqueQueueNames(queueRules, discoveredQueueNames)
    if (queueNames.length === 0) return

    await processWithConcurrency(queueNames, MAX_CONCURRENT_QUEUES, async (queueName) => {
      const queue = await getQueue(
        connectionId,
        connection.url,
        queueName,
        connection.prefix,
        toRedisConnectionOptions(connection.allowSelfSignedCerts)
      )

      let cursorRow = cursorMap.get(queueName) as MonitorCursorRow | undefined
      let cursor: CursorState | null = cursorRow
        ? isPendingEvaluation(cursorRow)
          ? restoreEvaluationBaseline(cursorRow.lastMetricsSnapshot)
          : {
              lastCheckedAt: cursorRow.lastCheckedAt,
              lastFailedCount: cursorRow.lastFailedCount,
              lastCompletedCount: cursorRow.lastCompletedCount,
            }
        : null

      if (cursorRow && isPendingEvaluation(cursorRow)) {
        const pendingCursor = cursorRow
        const pendingSnapshot = restoreQueueSnapshot(cursorRow.lastMetricsSnapshot)
        if (pendingSnapshot) {
          const pendingRules = queueRules.filter(
            (rule) =>
              rule.type !== 'job_failed' &&
              isRuleApplicableToQueue(rule, queueName) &&
              wasRuleRevisionCaptured(rule, pendingCursor.lastMetricsSnapshot)
          )
          for (const rule of pendingRules) {
            await evaluateAndMaybeAlert(
              rule,
              pendingSnapshot,
              cursor,
              connection,
              cursorRow.lastCheckedAt,
              queueName,
              cursorRow.lastObservationToken
            )
          }
        }

        const source = objectValue(cursorRow.lastMetricsSnapshot) ?? {}
        const replayedCursor = await alertCheckCursorRepository.upsert({
          connectionId,
          queueName,
          lastCheckedAt: cursorRow.lastCheckedAt,
          observationToken: cursorRow.lastObservationToken,
          lastFailedCount: pendingSnapshot?.jobCounts.failed ?? cursorRow.lastFailedCount,
          lastCompletedCount: pendingSnapshot?.jobCounts.completed ?? cursorRow.lastCompletedCount,
          lastMetricsSnapshot: { ...source, evaluationApplied: true },
        })
        if (
          replayedCursor.lastCheckedAt.getTime() !== cursorRow.lastCheckedAt.getTime() ||
          replayedCursor.lastObservationToken !== cursorRow.lastObservationToken
        ) {
          return
        }
        cursorRow = replayedCursor
        cursor = {
          lastCheckedAt: replayedCursor.lastCheckedAt,
          lastFailedCount: replayedCursor.lastFailedCount,
          lastCompletedCount: replayedCursor.lastCompletedCount,
        }
      }

      const observationToken = randomUUID()
      const [jobCountsRaw, failedMetricsRaw, completedMetricsRaw] = await Promise.all([
        queue.getJobCounts('failed', 'waiting', 'active', 'completed'),
        queue.getMetrics('failed', 0, METRICS_WINDOW_MINUTES),
        queue.getMetrics('completed', 0, METRICS_WINDOW_MINUTES),
      ])
      // Counter deltas must use the time the values were actually observed,
      // not the start of a potentially slow Redis round trip.
      const capturedAt = new Date()

      const snapshot: QueueSnapshot = {
        queueName,
        connectionName: connection.name,
        jobCounts: {
          failed: jobCountsRaw.failed ?? 0,
          waiting: jobCountsRaw.waiting ?? 0,
          active: jobCountsRaw.active ?? 0,
          completed: jobCountsRaw.completed ?? 0,
        },
        failedMetrics: {
          count: failedMetricsRaw.meta.count,
          dataPoints: failedMetricsRaw.data,
        },
        completedMetrics: {
          count: completedMetricsRaw.meta.count,
          dataPoints: completedMetricsRaw.data,
        },
      }

      const applicableRules = queueRules.filter((rule) => isRuleApplicableToQueue(rule, queueName))
      const replayableRules = applicableRules.filter((rule) => rule.type !== 'job_failed')
      const evaluationBaseline = cursor
        ? {
            lastCheckedAt: cursor.lastCheckedAt.toISOString(),
            lastFailedCount: cursor.lastFailedCount,
            lastCompletedCount: cursor.lastCompletedCount,
          }
        : null
      const pendingSnapshot = {
        kind: 'queue',
        queueName,
        connectionName: connection.name,
        capturedAt: capturedAt.toISOString(),
        jobCounts: snapshot.jobCounts,
        failedMetrics: snapshot.failedMetrics,
        completedMetrics: snapshot.completedMetrics,
        evaluationApplied: false,
        evaluationBaseline,
        applicableRuleRevisions: capturedRuleRevisions(replayableRules),
      }

      const appliedCursor = await alertCheckCursorRepository.upsert({
        connectionId,
        queueName,
        lastCheckedAt: capturedAt,
        observationToken,
        lastFailedCount: snapshot.jobCounts.failed,
        lastCompletedCount: snapshot.jobCounts.completed,
        lastMetricsSnapshot: pendingSnapshot,
      })
      if (
        appliedCursor.lastCheckedAt.getTime() !== capturedAt.getTime() ||
        appliedCursor.lastObservationToken !== observationToken
      ) {
        return
      }

      for (const rule of applicableRules) {
        if (rule.type === 'job_failed') {
          await scanFailedJobsAndMaybeAlert(rule, queue, connection, queueName)
        } else {
          await evaluateAndMaybeAlert(
            rule,
            snapshot,
            cursor,
            connection,
            capturedAt,
            queueName,
            observationToken
          )
        }
      }

      await alertCheckCursorRepository.upsert({
        connectionId,
        queueName,
        lastCheckedAt: capturedAt,
        observationToken,
        lastFailedCount: snapshot.jobCounts.failed,
        lastCompletedCount: snapshot.jobCounts.completed,
        lastMetricsSnapshot: { ...pendingSnapshot, evaluationApplied: true },
      })
    })
  } catch (error) {
    console.error(`[alert-monitor] Connection ${connectionId} failed:`, error)
  }
}

async function processRedisHealthRules(
  connection: RedisConnection,
  rules: AlertRule[],
  cursorMap: Map<string, MonitorCursorRow>,
  options: { persistHistory?: boolean } = {}
): Promise<void> {
  try {
    let cursor = cursorMap.get(REDIS_HEALTH_CURSOR_SCOPE)
    if (cursor && isPendingEvaluation(cursor)) {
      const pendingCursor = cursor
      const pendingSnapshot = restoreRedisHealthSnapshot(cursor.lastMetricsSnapshot)
      const source = objectValue(cursor.lastMetricsSnapshot) ?? {}
      let historyPersisted = pendingSnapshot?.historyPersisted === true
      if (pendingSnapshot && options.persistHistory === true && !historyPersisted) {
        try {
          await recordRedisHealthSnapshot(connection.id, pendingSnapshot)
          historyPersisted = true
        } catch (error) {
          console.error(
            `[alert-monitor] Redis health history replay failed for ${connection.id}:`,
            error
          )
        }
      }
      if (pendingSnapshot) {
        for (const rule of rules.filter((candidate) =>
          wasRuleRevisionCaptured(candidate, pendingCursor.lastMetricsSnapshot)
        )) {
          await processAlertEvaluation(
            rule,
            REDIS_HEALTH_EVENT_SCOPE,
            evaluateRedisHealthRule(rule, pendingSnapshot),
            connection,
            cursor.lastCheckedAt,
            REDIS_HEALTH_CURSOR_SCOPE,
            cursor.lastObservationToken
          )
        }
      }
      const replayedCursor = await alertCheckCursorRepository.upsert({
        connectionId: connection.id,
        queueName: REDIS_HEALTH_CURSOR_SCOPE,
        lastCheckedAt: cursor.lastCheckedAt,
        observationToken: cursor.lastObservationToken,
        lastFailedCount: 0,
        lastCompletedCount: 0,
        lastMetricsSnapshot: {
          ...source,
          historyPersisted,
          evaluationApplied: true,
        },
      })
      if (
        replayedCursor.lastCheckedAt.getTime() !== cursor.lastCheckedAt.getTime() ||
        replayedCursor.lastObservationToken !== cursor.lastObservationToken
      ) {
        return
      }
      cursor = replayedCursor
    }

    const previous = restoreRedisHealthSnapshot(cursor?.lastMetricsSnapshot)
    const redis = await getRedis(
      connection.id,
      connection.url,
      connection.name,
      toRedisConnectionOptions(connection.allowSelfSignedCerts),
      { cache: false }
    )
    const observationToken = randomUUID()
    let info: string
    try {
      info = await withTimeout(
        redis.info(),
        REDIS_INFO_TIMEOUT_MS,
        `Redis INFO for ${connection.id}`
      )
    } finally {
      // History collection is enabled by default for every connection. A
      // caller-owned probe prevents that from retaining one socket forever
      // per tenant connection and bounds live probes by monitor concurrency.
      redis.disconnect?.(false)
    }
    // INFO counters represent the completed response. Timestamping here keeps
    // CPU/eviction/rejection rates accurate even when Redis responds slowly.
    const capturedAt = new Date()
    const snapshot = buildRedisHealthSnapshot(info, connection.name, capturedAt, previous)

    const evaluationBaseline = previous ?? null
    const pendingSnapshot = {
      ...snapshot,
      historyPersisted: false,
      evaluationApplied: false,
      evaluationBaseline,
      applicableRuleRevisions: capturedRuleRevisions(rules),
    }
    const initialCursor = await alertCheckCursorRepository.upsert({
      connectionId: connection.id,
      queueName: REDIS_HEALTH_CURSOR_SCOPE,
      lastCheckedAt: capturedAt,
      observationToken,
      lastFailedCount: 0,
      lastCompletedCount: 0,
      lastMetricsSnapshot: pendingSnapshot,
    })

    let historyPersisted = false
    if (options.persistHistory === true) {
      try {
        await recordRedisHealthSnapshot(connection.id, snapshot)
        historyPersisted = true
      } catch (error) {
        // History persistence must not prevent active rules from evaluating.
        console.error(
          `[alert-monitor] Redis health history write failed for ${connection.id}:`,
          error
        )
      }
    }

    const appliedCursor = historyPersisted
      ? await alertCheckCursorRepository.upsert({
          connectionId: connection.id,
          queueName: REDIS_HEALTH_CURSOR_SCOPE,
          lastCheckedAt: capturedAt,
          observationToken,
          lastFailedCount: 0,
          lastCompletedCount: 0,
          lastMetricsSnapshot: { ...pendingSnapshot, historyPersisted: true },
        })
      : initialCursor
    if (
      appliedCursor.lastCheckedAt.getTime() !== capturedAt.getTime() ||
      appliedCursor.lastObservationToken !== observationToken
    ) {
      return
    }

    for (const rule of rules) {
      await processAlertEvaluation(
        rule,
        REDIS_HEALTH_EVENT_SCOPE,
        evaluateRedisHealthRule(rule, snapshot),
        connection,
        capturedAt,
        REDIS_HEALTH_CURSOR_SCOPE,
        observationToken
      )
    }

    await alertCheckCursorRepository.upsert({
      connectionId: connection.id,
      queueName: REDIS_HEALTH_CURSOR_SCOPE,
      lastCheckedAt: capturedAt,
      observationToken,
      lastFailedCount: 0,
      lastCompletedCount: 0,
      lastMetricsSnapshot: {
        ...pendingSnapshot,
        historyPersisted,
        evaluationApplied: true,
      },
    })
  } catch (error) {
    console.error(`[alert-monitor] Redis INFO health check failed for ${connection.id}:`, error)
  }
}

async function evaluateAndMaybeAlert(
  rule: AlertRule,
  snapshot: QueueSnapshot,
  cursor: CursorState | null,
  connection: RedisConnection,
  capturedAt?: Date,
  cursorScope?: string,
  observationToken?: string
): Promise<void> {
  const evaluation = evaluateRule(rule, snapshot, cursor, capturedAt)

  await processAlertEvaluation(
    rule,
    snapshot.queueName,
    evaluation,
    connection,
    capturedAt,
    cursorScope,
    observationToken
  )
}

async function processAlertEvaluation(
  rule: AlertRule,
  eventScope: string,
  evaluation: AlertEvaluation,
  connection: RedisConnection,
  capturedAt?: Date,
  cursorScope?: string,
  observationToken?: string
): Promise<void> {
  const currentRule = await alertRuleRepository.findById(rule.id, rule.organizationId)
  if (
    !currentRule ||
    !currentRule.enabled ||
    (currentRule.mutedUntil !== null && currentRule.mutedUntil.getTime() > Date.now()) ||
    !matchesRuleEvaluationState(currentRule, rule)
  ) {
    return
  }

  // An absent INFO field or missing rate baseline is unknown, not healthy.
  // Preserve an open incident until a later sample can actually evaluate it.
  if (evaluation.available === false) return

  if (!evaluation.triggered) {
    const activeEvent = await alertEventRepository.findActiveFiring(rule.id, eventScope)
    if (activeEvent) {
      await alertEventRepository.resolveActiveIfRuleCurrent(
        activeEvent.id,
        rule.organizationId,
        rule,
        capturedAt && cursorScope && observationToken
          ? {
              connectionId: rule.connectionId,
              queueName: cursorScope,
              capturedAt,
              observationToken,
            }
          : undefined
      )
      // Resolution atomically enqueues external cleanup. The bounded recovery
      // worker owns network I/O so polling cannot stall on provider outages.
    }
    return
  }

  const activeEvent = await alertEventRepository.findActiveFiring(rule.id, eventScope)
  if (activeEvent) {
    try {
      await resumeAlertNotification(activeEvent, rule, connection)
      await markLegacyNotificationSentIfComplete(activeEvent.id)
    } catch (error) {
      console.error('[alert-monitor] Delivery retry failed:', error)
    }
    return
  }

  // Cooldown anchors to the most recent non-suppressed event; anchoring to
  // suppressed events would extend the window on every suppression.
  const recentEvent = await alertEventRepository.findMostRecentFiredForRule(rule.id, eventScope)
  const recentMetric = redisHealthMetricFromContext(recentEvent?.context)
  const evaluatedMetric = redisHealthMetricFromContext(evaluation.context)
  const cooldownApplies =
    !wasInvalidatedByRuleChange(recentEvent?.context) &&
    (rule.type !== 'redis_health' ||
      (recentMetric !== null && evaluatedMetric !== null && recentMetric === evaluatedMetric))
  if (recentEvent && cooldownApplies) {
    const cooldownMs = rule.cooldownMinutes * 60_000
    const elapsedMs = Date.now() - recentEvent.firedAt.getTime()
    if (elapsedMs < cooldownMs) {
      // Record the suppression so it is visible in the incident history.
      // Coalesced to one event per cooldown window; never dispatches.
      await alertEventRepository.upsertSuppressed(
        {
          alertRuleId: rule.id,
          organizationId: rule.organizationId,
          connectionId: rule.connectionId,
          queueName: eventScope,
          type: rule.type,
          summary: evaluation.summary,
          context: (evaluation.context ?? {}) as Record<string, unknown>,
          dedupeKey: `suppressed:${recentEvent.id}`,
          observationToken,
        },
        {
          expectedRule: rule,
          latestEvaluation:
            capturedAt && cursorScope && observationToken
              ? {
                  connectionId: rule.connectionId,
                  queueName: cursorScope,
                  capturedAt,
                  observationToken,
                }
              : undefined,
        }
      )
      console.log(`[alert-monitor] Suppressed alert for rule "${rule.name}" on ${eventScope}`)
      return
    }
  }

  const { event, created, staleRule } = await alertEventRepository.createOrGetActive(
    {
      alertRuleId: rule.id,
      organizationId: rule.organizationId,
      connectionId: rule.connectionId,
      queueName: eventScope,
      type: rule.type,
      summary: evaluation.summary,
      context: evaluation.context,
      firedAt: new Date(),
    },
    {
      expectedRule: rule,
      latestEvaluation:
        capturedAt && cursorScope && observationToken
          ? {
              connectionId: rule.connectionId,
              queueName: cursorScope,
              capturedAt,
              observationToken,
            }
          : undefined,
    }
  )

  if (staleRule || !event) return

  if (!created) {
    try {
      await resumeAlertNotification(event, rule, connection)
      await markLegacyNotificationSentIfComplete(event.id)
    } catch (error) {
      console.error('[alert-monitor] Delivery retry failed:', error)
    }
    return
  }

  console.log(`[alert-monitor] Alert fired: ${evaluation.summary}`)

  const channels = (rule.notificationChannels ?? []) as NotificationChannel[]
  if (channels.length === 0) return

  try {
    await dispatchAlertNotification(event, channels, connection, rule.name)
    await markLegacyNotificationSentIfComplete(event.id)
  } catch (error) {
    console.error('[alert-monitor] Notification dispatch failed:', error)
  }
}

async function resumeAlertNotification(
  event: AlertEvent,
  rule: AlertRule,
  connection: RedisConnection
): Promise<void> {
  const channels = (rule.notificationChannels ?? []) as NotificationChannel[]
  if (event.status === 'firing' && !event.notificationSentAt && channels.length > 0) {
    // A crash can occur after event creation but before enqueueing deliveries.
    // Enqueue is idempotent, so replay also repairs this gap without resending
    // deliveries that have already completed.
    await dispatchAlertNotification(event, channels, connection, rule.name)
  } else {
    await processAlertDeliveries(event, connection, rule.name)
  }
}

function matchesRuleEvaluationState(current: AlertRule, expected: AlertRule): boolean {
  return (
    current.updatedAt.getTime() === expected.updatedAt.getTime() &&
    current.type === expected.type &&
    current.queueName === expected.queueName &&
    current.queueFilterMode === expected.queueFilterMode &&
    current.cooldownMinutes === expected.cooldownMinutes &&
    JSON.stringify(current.config) === JSON.stringify(expected.config) &&
    JSON.stringify(current.filterQueueNames) === JSON.stringify(expected.filterQueueNames) &&
    JSON.stringify(current.notificationChannels) === JSON.stringify(expected.notificationChannels)
  )
}

function redisHealthMetricFromContext(context: unknown): string | null {
  if (!context || typeof context !== 'object') return null
  const metric = (context as Record<string, unknown>).metric
  return typeof metric === 'string' && metric.length > 0 ? metric : null
}

function wasInvalidatedByRuleChange(context: unknown): boolean {
  return (
    typeof context === 'object' &&
    context !== null &&
    (context as Record<string, unknown>).ruleRevisionInvalidated === true
  )
}

async function scanFailedJobsAndMaybeAlert(
  rule: AlertRule,
  queue: {
    getJobs: (
      types?: JobType | JobType[],
      start?: number,
      end?: number,
      asc?: boolean
    ) => Promise<unknown[]>
  },
  connection: RedisConnection,
  queueName: string
): Promise<void> {
  const config = (rule.config ?? {}) as Record<string, unknown>
  const requestedMax =
    typeof config.maxIssuesPerPoll === 'number'
      ? Math.floor(config.maxIssuesPerPoll)
      : DEFAULT_JOB_FAILED_MAX_ISSUES_PER_POLL
  const maxIssuesPerPoll = Math.min(
    HARD_CAP_JOB_FAILED_MAX_ISSUES_PER_POLL,
    Math.max(1, requestedMax)
  )

  const jobs = await queue.getJobs(['failed'], 0, maxIssuesPerPoll - 1, false)
  for (const rawJob of jobs) {
    const job = normalizeFailedJob(rawJob)
    if (!job.id) continue

    const dedupeKey = `job:${connection.id}:${queueName}:${job.id}`
    const result = await alertEventRepository.createOrGetByDedupeKey(
      {
        alertRuleId: rule.id,
        organizationId: rule.organizationId,
        connectionId: rule.connectionId,
        queueName,
        type: rule.type,
        status: 'firing',
        summary: `Job ${job.id} failed in ${queueName}${job.failedReason ? `: ${job.failedReason}` : ''}`,
        context: {
          jobId: job.id,
          jobName: job.name,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          attempts: job.attempts,
          failedAt: job.failedAt,
        },
        firedAt: job.failedAt ? new Date(job.failedAt) : new Date(),
        dedupeKey,
      },
      { expectedRule: rule }
    )
    // A rule may be disabled, edited, or deleted while the Redis scan runs.
    // The repository checks its revision under the same lock as event creation.
    if (!result) return
    const { event, created } = result

    if (!created) {
      await resumeAlertNotification(event, rule, connection)
      await markLegacyNotificationSentIfComplete(event.id)
      continue
    }

    console.log(`[alert-monitor] Job failed alert fired: ${event.summary}`)

    const channels = (rule.notificationChannels ?? []) as NotificationChannel[]
    if (channels.length === 0) continue

    try {
      await dispatchAlertNotification(event, channels, connection, rule.name)
      await markLegacyNotificationSentIfComplete(event.id)
    } catch (error) {
      console.error('[alert-monitor] Job failed notification dispatch failed:', error)
    }
  }
}

function normalizeFailedJob(rawJob: unknown): {
  id: string | null
  name: string | null
  failedReason: string | null
  attemptsMade: number | null
  attempts: number | null
  failedAt: string | null
} {
  const source =
    typeof rawJob === 'object' && rawJob !== null ? (rawJob as Record<string, unknown>) : {}
  const opts =
    typeof source.opts === 'object' && source.opts !== null
      ? (source.opts as Record<string, unknown>)
      : {}
  const failedAtMs =
    typeof source.finishedOn === 'number'
      ? source.finishedOn
      : typeof source.processedOn === 'number'
        ? source.processedOn
        : null

  return {
    id: typeof source.id === 'string' || typeof source.id === 'number' ? String(source.id) : null,
    name: typeof source.name === 'string' ? source.name : null,
    failedReason:
      typeof source.failedReason === 'string' ? source.failedReason.slice(0, 500) : null,
    attemptsMade: typeof source.attemptsMade === 'number' ? source.attemptsMade : null,
    attempts: typeof opts.attempts === 'number' ? opts.attempts : null,
    failedAt: failedAtMs ? new Date(failedAtMs).toISOString() : null,
  }
}

async function markLegacyNotificationSentIfComplete(eventId: string): Promise<void> {
  const counts = await alertDeliveryRepository.countByStatuses(eventId)
  const total = counts.pending + counts.claimed + counts.delivered + counts.failed
  if (total === 0 || counts.delivered === total) {
    await alertEventRepository.markNotificationSent(eventId)
  }
}

async function runJobAutoResolveCycle(): Promise<void> {
  if (jobAutoResolveInProgress) return
  jobAutoResolveInProgress = true

  try {
    const events = await alertEventRepository.findFiringJobEvents({
      limit: JOB_AUTO_RESOLVE_BATCH_LIMIT,
    })
    if (events.length === 0) return

    const eventsByConnection = new Map<string, AlertEvent[]>()
    for (const event of events) {
      const existing = eventsByConnection.get(event.connectionId) ?? []
      existing.push(event)
      eventsByConnection.set(event.connectionId, existing)
    }

    const resolvedEvents: AlertEvent[] = []
    await processWithConcurrency(
      Array.from(eventsByConnection.entries()),
      MAX_CONCURRENT_CONNECTIONS,
      async ([connectionId, connectionEvents]) => {
        try {
          const resolved = await withTimeout(
            autoResolveCompletedJobEvents(connectionId, connectionEvents),
            CONNECTION_TIMEOUT_MS,
            `Job auto-resolve for connection ${connectionId}`
          )
          resolvedEvents.push(...resolved)
        } catch (error) {
          console.error(`[alert-monitor] Job auto-resolve failed for ${connectionId}:`, error)
        }
      }
    )

    if (resolvedEvents.length > 0) {
      console.log(
        `[alert-monitor] Auto-resolved ${resolvedEvents.length} alert(s) whose jobs completed`
      )
    }
  } catch (error) {
    console.error('[alert-monitor] Job auto-resolve cycle failed:', error)
  } finally {
    jobAutoResolveInProgress = false
  }
}

async function autoResolveCompletedJobEvents(
  connectionId: string,
  events: AlertEvent[]
): Promise<AlertEvent[]> {
  const connection = await redisConnectionRepository.findByIdUnsafe(connectionId)
  if (!connection) return []

  const resolved: AlertEvent[] = []
  for (const event of events) {
    const jobId = getEventJobId(event.context)
    if (!jobId) continue

    const queue = await getQueue(
      connectionId,
      connection.url,
      event.queueName,
      connection.prefix,
      toRedisConnectionOptions(connection.allowSelfSignedCerts)
    )

    const state = await queue.getJobState(jobId)
    if (state !== 'completed') continue

    const resolvedEvent = await alertEventRepository.resolve(
      event.id,
      event.organizationId,
      'auto_job_completed'
    )
    if (resolvedEvent) resolved.push(resolvedEvent)
  }

  return resolved
}

function getEventJobId(context: unknown): string | null {
  const source =
    typeof context === 'object' && context !== null ? (context as Record<string, unknown>) : {}
  return typeof source.jobId === 'string' && source.jobId.length > 0 ? source.jobId : null
}

async function runCleanup(): Promise<void> {
  await runResolutionRecoveryCycle()

  try {
    const cutoff = new Date(Date.now() - LINEAR_IDEMPOTENCY_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    let deleted = 0
    for (let batch = 0; batch < EVENT_CLEANUP_MAX_BATCHES; batch += 1) {
      const batchDeleted = await linearIssueResolutionRepository.deleteCompletedOlderThan(
        cutoff,
        EVENT_CLEANUP_BATCH_SIZE
      )
      deleted += batchDeleted
      if (batchDeleted < EVENT_CLEANUP_BATCH_SIZE) break
    }
    if (deleted > 0) {
      console.log(`[alert-monitor] Cleaned up ${deleted} Linear idempotency records`)
    }
  } catch (error) {
    console.error('[alert-monitor] Linear idempotency cleanup failed:', error)
  }

  try {
    let deletedTotal = 0
    for (let batch = 0; batch < EVENT_CLEANUP_MAX_BATCHES; batch += 1) {
      const deleted = await alertEventRepository.deleteOlderThan(
        EVENT_RETENTION_DAYS,
        PENDING_LINEAR_SYNC_MAX_RETENTION_DAYS,
        EVENT_CLEANUP_BATCH_SIZE
      )
      deletedTotal += deleted
      if (deleted < EVENT_CLEANUP_BATCH_SIZE) break
    }
    if (deletedTotal > 0) {
      console.log(`[alert-monitor] Cleaned up ${deletedTotal} old alert events`)
    }
    if (deletedTotal === EVENT_CLEANUP_BATCH_SIZE * EVENT_CLEANUP_MAX_BATCHES) {
      console.warn('[alert-monitor] Alert event cleanup reached its per-run safety limit.')
    }
  } catch (error) {
    console.error('[alert-monitor] Alert event cleanup failed:', error)
  }
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return

  const queue = [...items]
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) return
      await worker(item)
    }
  })

  // Keep ownership of the cycle until every sibling worker settles, even if
  // one fails; releasing it early can overlap a later cycle with live siblings.
  const results = await Promise.allSettled(workers)
  const failure = results.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
}

export const __alertMonitorTestUtils = {
  getUniqueQueueNames,
  isRuleApplicableToQueue,
  evaluateAndMaybeAlert,
  processAlertEvaluation,
  scanFailedJobsAndMaybeAlert,
  normalizeFailedJob,
  processConnection,
  processRedisHealthRules,
  processDueAlertDeliveries,
  processWithConcurrency,
  runPollCycle,
  runConnectionPollOnce,
  runJobAutoResolveCycle,
  autoResolveCompletedJobEvents,
  getEventJobId,
  runCleanup,
}
