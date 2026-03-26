import {
  alertCheckCursorRepository,
  alertEventRepository,
  alertRuleRepository,
  redisConnectionRepository,
  redisDiscoveredQueueRepository,
  type AlertRule,
  type RedisConnection,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { evaluateRule, type CursorState, type QueueSnapshot } from './alert-evaluator'
import { dispatchAlertNotification, type NotificationChannel } from './alert-notifier'
import { getQueue } from './redis'

const DEFAULT_POLL_INTERVAL_MS = 60_000
const MAX_STARTUP_JITTER_MS = 30_000
const CONNECTION_TIMEOUT_MS = 30_000
const MAX_CONCURRENT_CONNECTIONS = 3
const MAX_CONCURRENT_QUEUES = 5
const METRICS_WINDOW_MINUTES = 60
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const EVENT_RETENTION_DAYS = 90

let pollTimer: ReturnType<typeof setInterval> | null = null
let cleanupTimer: ReturnType<typeof setInterval> | null = null
let startupTimer: ReturnType<typeof setTimeout> | null = null
let isRunning = false
let pollInProgress = false

function getPollIntervalMs(): number {
  return Math.max(5_000, env.DURABULL_ALERT_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS)
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
  const jitter = Math.floor(Math.random() * MAX_STARTUP_JITTER_MS)
  console.log(
    `[alert-monitor] Starting in ${(jitter / 1000).toFixed(0)}s, poll interval ${Math.round(pollIntervalMs / 1000)}s`
  )

  startupTimer = setTimeout(() => {
    void runPollCycle()
    void runCleanup()
    pollTimer = setInterval(() => void runPollCycle(), pollIntervalMs)
    cleanupTimer = setInterval(() => void runCleanup(), CLEANUP_INTERVAL_MS)
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
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
  isRunning = false
  console.log('[alert-monitor] Stopped.')
}

async function runPollCycle(): Promise<void> {
  if (pollInProgress) return
  pollInProgress = true

  try {
    const rules = await alertRuleRepository.findAllEnabled()
    if (rules.length === 0) return

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
  } catch (error) {
    console.error('[alert-monitor] Poll cycle failed:', error)
  } finally {
    pollInProgress = false
  }
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
      const queue = await getQueue(connectionId, connection.url, queueName)

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
        await evaluateAndMaybeAlert(rule, snapshot, cursor, connection)
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
      await alertEventRepository.resolve(activeEvent.id, rule.organizationId)
    }
    return
  }

  const activeEvent = await alertEventRepository.findActiveFiring(rule.id, snapshot.queueName)
  if (activeEvent) return

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
    await alertEventRepository.markNotificationSent(event.id)
  } catch (error) {
    console.error('[alert-monitor] Notification dispatch failed:', error)
  }
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
  processConnection,
  processWithConcurrency,
}
