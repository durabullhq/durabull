import {
  alertDeliveryRepository,
  alertCheckCursorRepository,
  alertEventRepository,
  alertRuleRepository,
  redisConnectionRepository,
  redisDiscoveredQueueRepository,
  type AlertDelivery,
  type AlertEvent,
  type AlertRule,
  type RedisConnection,
} from '@durabull/dal'
import { env } from '@durabull/env'
import type { JobType } from 'bullmq'
import { evaluateRule, type CursorState, type QueueSnapshot } from './alert-evaluator'
import { syncLinearIssuesForResolvedEvents } from './alert-resolution'
import {
  dispatchAlertNotification,
  processAlertDeliveries,
  type NotificationChannel,
} from './alert-notifier'
import { getQueue } from './redis'
import { toRedisConnectionOptions } from './connection-options'

const DEFAULT_POLL_INTERVAL_MS = 60_000
const DEFAULT_DELIVERY_SWEEP_INTERVAL_MS = 15_000
const MAX_STARTUP_JITTER_MS = 30_000
const CONNECTION_TIMEOUT_MS = 30_000
const MAX_CONCURRENT_CONNECTIONS = 3
const MAX_CONCURRENT_QUEUES = 5
const METRICS_WINDOW_MINUTES = 60
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const EVENT_RETENTION_DAYS = 90
const DEFAULT_JOB_FAILED_MAX_ISSUES_PER_POLL = 100
const HARD_CAP_JOB_FAILED_MAX_ISSUES_PER_POLL = 500
const DELIVERY_SWEEP_LIMIT = 10
const MAX_CONCURRENT_DELIVERY_SWEEPS = 10
const DELIVERY_SWEEP_BUDGET_MS = 20_000
const DEFAULT_JOB_AUTO_RESOLVE_INTERVAL_MS = 5 * 60_000
const JOB_AUTO_RESOLVE_BATCH_LIMIT = 500

let pollTimer: ReturnType<typeof setInterval> | null = null
let deliverySweepTimer: ReturnType<typeof setInterval> | null = null
let cleanupTimer: ReturnType<typeof setInterval> | null = null
let jobAutoResolveTimer: ReturnType<typeof setInterval> | null = null
let startupTimer: ReturnType<typeof setTimeout> | null = null
let isRunning = false
let pollInProgress = false
let deliverySweepInProgress = false
let jobAutoResolveInProgress = false

function getPollIntervalMs(): number {
  return Math.max(5_000, env.DURABULL_ALERT_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS)
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
  if (!isAlertMonitorEnabled()) {
    console.log('[alert-monitor] Disabled via DURABULL_ALERT_ENABLED=false')
    return
  }

  isRunning = true
  const pollIntervalMs = getPollIntervalMs()
  const deliverySweepIntervalMs = getDeliverySweepIntervalMs()
  const jitter = Math.floor(Math.random() * MAX_STARTUP_JITTER_MS)
  console.log(
    `[alert-monitor] Starting in ${(jitter / 1000).toFixed(0)}s, poll interval ${Math.round(pollIntervalMs / 1000)}s, delivery sweep interval ${Math.round(deliverySweepIntervalMs / 1000)}s`
  )

  startupTimer = setTimeout(() => {
    void runPollCycle()
    void runDeliverySweepCycle()
    void runCleanup()
    void runJobAutoResolveCycle()
    pollTimer = setInterval(() => void runPollCycle(), pollIntervalMs)
    deliverySweepTimer = setInterval(() => void runDeliverySweepCycle(), deliverySweepIntervalMs)
    cleanupTimer = setInterval(() => void runCleanup(), CLEANUP_INTERVAL_MS)
    jobAutoResolveTimer = setInterval(
      () => void runJobAutoResolveCycle(),
      getJobAutoResolveIntervalMs()
    )
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
    const rules = await alertRuleRepository.findAllEnabled()
    if (rules.length > 0) {
      const rulesByConnection = new Map<string, AlertRule[]>()
      for (const rule of rules) {
        const existing = rulesByConnection.get(rule.connectionId) ?? []
        existing.push(rule)
        rulesByConnection.set(rule.connectionId, existing)
      }

      await processWithConcurrency(
        Array.from(rulesByConnection.entries()),
        MAX_CONCURRENT_CONNECTIONS,
        async ([connectionId, connectionRules]) => {
          await withTimeout(
            processConnection(connectionId, connectionRules),
            CONNECTION_TIMEOUT_MS,
            `Connection ${connectionId}`
          )
        }
      )
    }
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

async function processConnection(connectionId: string, rules: AlertRule[]): Promise<void> {
  try {
    // findByIdUnsafe bypasses org-scoping because the background monitor needs to
    // access connections across all organizations. Access is implicitly scoped via
    // the alert rules, which are always org-scoped when created through the API.
    const connection = await redisConnectionRepository.findByIdUnsafe(connectionId)
    if (!connection) return

    const discoveredQueueNames = await loadDiscoveredQueueNames(connectionId)
    const queueNames = getUniqueQueueNames(rules, discoveredQueueNames)
    if (queueNames.length === 0) return

    const cursors = await alertCheckCursorRepository.findByConnection(connectionId)
    const cursorMap = new Map(cursors.map((cursor) => [cursor.queueName, cursor]))

    await processWithConcurrency(queueNames, MAX_CONCURRENT_QUEUES, async (queueName) => {
      const queue = await getQueue(
        connectionId,
        connection.url,
        queueName,
        connection.prefix,
        toRedisConnectionOptions(connection.allowSelfSignedCerts)
      )

      const [jobCountsRaw, failedMetricsRaw, completedMetricsRaw] = await Promise.all([
        queue.getJobCounts('failed', 'waiting', 'active', 'completed'),
        queue.getMetrics('failed', 0, METRICS_WINDOW_MINUTES),
        queue.getMetrics('completed', 0, METRICS_WINDOW_MINUTES),
      ])

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

      const cursorRow = cursorMap.get(queueName)
      const cursor: CursorState | null = cursorRow
        ? {
            lastCheckedAt: cursorRow.lastCheckedAt,
            lastFailedCount: cursorRow.lastFailedCount,
            lastCompletedCount: cursorRow.lastCompletedCount,
          }
        : null

      const applicableRules = rules.filter((rule) => isRuleApplicableToQueue(rule, queueName))
      for (const rule of applicableRules) {
        if (rule.type === 'job_failed') {
          await scanFailedJobsAndMaybeAlert(rule, queue, connection, queueName)
        } else {
          await evaluateAndMaybeAlert(rule, snapshot, cursor, connection)
        }
      }

      await alertCheckCursorRepository.upsert({
        connectionId,
        queueName,
        lastCheckedAt: new Date(),
        lastFailedCount: snapshot.jobCounts.failed,
        lastCompletedCount: snapshot.jobCounts.completed,
        lastMetricsSnapshot: {
          jobCounts: snapshot.jobCounts,
          failedMetrics: snapshot.failedMetrics,
          completedMetrics: snapshot.completedMetrics,
        },
      })
    })
  } catch (error) {
    console.error(`[alert-monitor] Connection ${connectionId} failed:`, error)
  }
}

async function evaluateAndMaybeAlert(
  rule: AlertRule,
  snapshot: QueueSnapshot,
  cursor: CursorState | null,
  connection: RedisConnection
): Promise<void> {
  const evaluation = evaluateRule(rule, snapshot, cursor)

  if (!evaluation.triggered) {
    const activeEvent = await alertEventRepository.findActiveFiring(rule.id, snapshot.queueName)
    if (activeEvent) {
      const resolvedEvent = await alertEventRepository.resolve(activeEvent.id, rule.organizationId)
      if (resolvedEvent) {
        await syncLinearIssuesForResolvedEvents([resolvedEvent], {
          kind: 'auto_condition_cleared',
        })
      }
    }
    return
  }

  const activeEvent = await alertEventRepository.findActiveFiring(rule.id, snapshot.queueName)
  if (activeEvent) {
    try {
      await processAlertDeliveries(activeEvent, connection, rule.name)
      await markLegacyNotificationSentIfComplete(activeEvent.id)
    } catch (error) {
      console.error('[alert-monitor] Delivery retry failed:', error)
    }
    return
  }

  const recentEvent = await alertEventRepository.findMostRecentForRule(rule.id, snapshot.queueName)
  if (recentEvent) {
    const cooldownMs = rule.cooldownMinutes * 60_000
    const elapsedMs = Date.now() - recentEvent.firedAt.getTime()
    if (elapsedMs < cooldownMs) {
      console.log(
        `[alert-monitor] Suppressed alert for rule "${rule.name}" on ${snapshot.queueName}`
      )
      return
    }
  }

  const event = await alertEventRepository.create({
    alertRuleId: rule.id,
    organizationId: rule.organizationId,
    connectionId: rule.connectionId,
    queueName: snapshot.queueName,
    type: rule.type,
    status: 'firing',
    summary: evaluation.summary,
    context: evaluation.context,
    firedAt: new Date(),
  })

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
    const { event, created } = await alertEventRepository.createOrGetByDedupeKey({
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
    })

    if (!created) {
      await processAlertDeliveries(event, connection, rule.name)
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
      await syncLinearIssuesForResolvedEvents(resolvedEvents, { kind: 'auto_job_completed' })
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

    const resolvedEvent = await alertEventRepository.resolve(event.id, event.organizationId)
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
  try {
    const deleted = await alertEventRepository.deleteOlderThan(EVENT_RETENTION_DAYS)
    if (deleted > 0) {
      console.log(`[alert-monitor] Cleaned up ${deleted} old alert events`)
    }
  } catch (error) {
    console.error('[alert-monitor] Cleanup failed:', error)
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

  await Promise.all(workers)
}

export const __alertMonitorTestUtils = {
  getUniqueQueueNames,
  isRuleApplicableToQueue,
  evaluateAndMaybeAlert,
  scanFailedJobsAndMaybeAlert,
  normalizeFailedJob,
  processConnection,
  processDueAlertDeliveries,
  processWithConcurrency,
  runJobAutoResolveCycle,
  autoResolveCompletedJobEvents,
  getEventJobId,
}
