import {
  alertCheckCursorRepository,
  alertEventRepository,
  redisDiscoveredQueueRepository,
} from '@durabull/dal'
import type {
  GetConnectionOverviewHandlerInput,
  GetConnectionOverviewHandlerOutput,
} from '@durabull/mcp'
import { MCP_SCOPE_DIAGNOSTICS_READ, MCP_SCOPE_FAILURES_READ } from '@durabull/mcp/auth'

import { REDIS_HEALTH_CURSOR_SCOPE, restoreRedisHealthSnapshot } from '../../lib/redis-health'
import {
  getQueueForConnection,
  hasGrantedScope,
  mapWithConcurrency,
  requireConnectionForPrincipal,
  toIsoString,
} from './shared'

/** Queues sampled per overview call. Beyond this, `queues.truncated` is true. */
export const OVERVIEW_MAX_QUEUES = 100
const OVERVIEW_CONCURRENCY = 8
const TOP_N = 10
/** Name lists are capped to the MCP output sanitizer's array limit so nothing is cut silently. */
const NAME_LIST_LIMIT = 100

interface OverviewHandlerDeps {
  requireConnectionForPrincipal: typeof requireConnectionForPrincipal
  getQueueForConnection: typeof getQueueForConnection
  discoverySummary: typeof redisDiscoveredQueueRepository.getSummary
  listQueues: typeof redisDiscoveredQueueRepository.listByConnection
  summarizeOpenAlerts: typeof alertEventRepository.summarizeOpenByOrganization
  findCursor: typeof alertCheckCursorRepository.findByConnectionQueue
}

const defaultDeps: OverviewHandlerDeps = {
  requireConnectionForPrincipal,
  getQueueForConnection,
  discoverySummary: redisDiscoveredQueueRepository.getSummary,
  listQueues: redisDiscoveredQueueRepository.listByConnection,
  summarizeOpenAlerts: alertEventRepository.summarizeOpenByOrganization,
  findCursor: alertCheckCursorRepository.findByConnectionQueue,
}

interface QueueSample {
  name: string
  isPaused: boolean
  workers: number
  counts: {
    waiting: number
    active: number
    delayed: number
    completed: number
    failed: number
    paused: number
    prioritized: number
  }
}

export function createGetConnectionOverviewHandler(deps: OverviewHandlerDeps = defaultDeps) {
  return async function getConnectionOverviewHandler(
    input: GetConnectionOverviewHandlerInput
  ): Promise<GetConnectionOverviewHandlerOutput> {
    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)
    const warnings: string[] = []

    const includeAlerts = hasGrantedScope(input.grantedScopes, MCP_SCOPE_FAILURES_READ)
    const includeRedisHealth = hasGrantedScope(input.grantedScopes, MCP_SCOPE_DIAGNOSTICS_READ)

    const [discovery, indexedQueues, alertSummaries, healthCursor] = await Promise.all([
      deps.discoverySummary(connection.id),
      deps.listQueues(connection.id, { offset: 0, limit: OVERVIEW_MAX_QUEUES }),
      includeAlerts ? deps.summarizeOpenAlerts(connection.organizationId) : Promise.resolve(null),
      includeRedisHealth
        ? deps.findCursor(connection.id, REDIS_HEALTH_CURSOR_SCOPE)
        : Promise.resolve(null),
    ])

    const samples = await mapWithConcurrency(
      indexedQueues,
      OVERVIEW_CONCURRENCY,
      async (indexed): Promise<QueueSample | null> => {
        try {
          const queue = await deps.getQueueForConnection(connection, indexed.name)
          const [counts, isPaused, workers] = await Promise.all([
            queue.getJobCounts(),
            queue.isPaused(),
            queue.getWorkersCount().catch(() => 0),
          ])
          return {
            name: indexed.name,
            isPaused,
            workers,
            counts: {
              waiting: counts.waiting ?? 0,
              active: counts.active ?? 0,
              delayed: counts.delayed ?? 0,
              completed: counts.completed ?? 0,
              failed: counts.failed ?? 0,
              paused: counts.paused ?? 0,
              prioritized: counts.prioritized ?? 0,
            },
          }
        } catch {
          warnings.push(`Could not read queue ${indexed.name}.`)
          return null
        }
      }
    )

    const totals = {
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
      paused: 0,
      prioritized: 0,
    }
    const paused: string[] = []
    const withoutWorkers: string[] = []
    let workersTotal = 0
    const scanned = samples.filter((sample): sample is QueueSample => sample !== null)

    for (const sample of scanned) {
      for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
        totals[key] += sample.counts[key]
      }
      workersTotal += sample.workers
      if (sample.isPaused) paused.push(sample.name)
      const backlog = sample.counts.waiting + sample.counts.prioritized
      if (backlog > 0 && sample.workers === 0 && !sample.isPaused) {
        withoutWorkers.push(sample.name)
      }
    }

    const topFailed = scanned
      .filter((sample) => sample.counts.failed > 0)
      .sort((left, right) => right.counts.failed - left.counts.failed)
      .slice(0, TOP_N)
      .map((sample) => ({ name: sample.name, failed: sample.counts.failed }))
    const topBacklog = scanned
      .filter((sample) => sample.counts.waiting > 0)
      .sort((left, right) => right.counts.waiting - left.counts.waiting)
      .slice(0, TOP_N)
      .map((sample) => ({ name: sample.name, waiting: sample.counts.waiting }))

    const truncated = discovery.total > indexedQueues.length
    if (truncated) {
      warnings.push(
        `Scanned ${indexedQueues.length} of ${discovery.total} queues; totals are partial. Use list_queues to page through the rest.`
      )
    }
    if (discovery.total === 0) {
      warnings.push('No queues have been discovered on this connection yet.')
    }
    if (paused.length > NAME_LIST_LIMIT) {
      warnings.push(
        `${paused.length} queues are paused; only the first ${NAME_LIST_LIMIT} are listed.`
      )
    }
    if (withoutWorkers.length > NAME_LIST_LIMIT) {
      warnings.push(
        `${withoutWorkers.length} queues have backlog without workers; only the first ${NAME_LIST_LIMIT} are listed.`
      )
    }

    const alertRow = alertSummaries?.find((summary) => summary.connectionId === connection.id)
    const alerts = includeAlerts
      ? {
          open: alertRow?.open ?? 0,
          firing: alertRow?.firing ?? 0,
          acknowledged: alertRow?.acknowledged ?? 0,
        }
      : null

    const snapshot = includeRedisHealth
      ? restoreRedisHealthSnapshot(healthCursor?.lastMetricsSnapshot)
      : null
    const redisHealth = snapshot
      ? {
          capturedAt: snapshot.capturedAt,
          memoryUsagePercent: snapshot.metrics.memoryUsagePercent,
          cpuUsagePercent: snapshot.metrics.cpuUsagePercent,
          connectedClients: snapshot.metrics.connectedClients,
          blockedClients: snapshot.metrics.blockedClients,
        }
      : null

    return {
      connectionId: connection.id,
      name: connection.name,
      environment: connection.environment ?? null,
      prefix: connection.prefix,
      discovery: {
        totalQueues: discovery.total,
        confirmed: discovery.confirmed,
        pending: discovery.pending,
        lastDiscoveredAt: toIsoString(discovery.lastDiscoveredAt),
      },
      queues: {
        scanned: scanned.length,
        truncated,
        totals,
        paused: paused.slice(0, NAME_LIST_LIMIT),
        withoutWorkers: withoutWorkers.slice(0, NAME_LIST_LIMIT),
        topFailed,
        topBacklog,
      },
      workers: { total: workersTotal },
      alerts,
      redisHealth,
      warnings,
    }
  }
}

export const getConnectionOverviewHandler = createGetConnectionOverviewHandler()
