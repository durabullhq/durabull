import { redisDiscoveredQueueRepository } from '@durabull/dal'
import type {
  GetScheduledJobHandlerInput,
  GetScheduledJobHandlerOutput,
  ListScheduledJobsHandlerInput,
  ListScheduledJobsHandlerOutput,
  McpScheduledJobSummary,
} from '@durabull/mcp'
import type { Queue } from 'bullmq'

import { mapScheduledJob } from '../../lib/scheduled-jobs'
import { toMcpScheduledJobSummary } from './mcp-sanitize'
import {
  decodeCursor,
  encodeCursor,
  encodeQueueOffsetCursor,
  getQueueForConnection,
  McpToolError,
  parseQueueOffsetCursor,
  requireConnectionForPrincipal,
} from './shared'

/** Queues scanned per page when listing schedulers across a whole connection. */
export const SCHEDULED_JOBS_QUEUES_PER_PAGE = 25
/** Recent failed jobs sampled per queue to compute per-scheduler failure counts. */
const RECENT_FAILED_SAMPLE = 100

interface ScheduledJobsHandlerDeps {
  requireConnectionForPrincipal: typeof requireConnectionForPrincipal
  getQueueForConnection: typeof getQueueForConnection
  findQueue: typeof redisDiscoveredQueueRepository.findByConnectionAndName
  countQueues: typeof redisDiscoveredQueueRepository.countByConnection
  listQueues: typeof redisDiscoveredQueueRepository.listByConnection
}

const defaultDeps: ScheduledJobsHandlerDeps = {
  requireConnectionForPrincipal,
  getQueueForConnection,
  findQueue: redisDiscoveredQueueRepository.findByConnectionAndName,
  countQueues: redisDiscoveredQueueRepository.countByConnection,
  listQueues: redisDiscoveredQueueRepository.listByConnection,
}

async function failureStatsByJobName(
  queue: Queue,
  jobNames: string[]
): Promise<Map<string, { count: number; lastFailedAt?: number }>> {
  const stats = new Map<string, { count: number; lastFailedAt?: number }>()
  const wanted = new Set(jobNames.filter(Boolean))
  if (wanted.size === 0) return stats

  const failedJobs = await queue.getJobs(['failed'], 0, RECENT_FAILED_SAMPLE)
  for (const job of failedJobs) {
    if (!job || !wanted.has(job.name)) continue
    const current = stats.get(job.name) ?? { count: 0, lastFailedAt: undefined }
    current.count += 1
    const failedAt = job.finishedOn ?? job.timestamp
    if (failedAt && (!current.lastFailedAt || failedAt > current.lastFailedAt)) {
      current.lastFailedAt = failedAt
    }
    stats.set(job.name, current)
  }
  return stats
}

async function schedulersForQueue(
  queue: Queue,
  queueName: string
): Promise<McpScheduledJobSummary[]> {
  const schedulers = await queue.getJobSchedulers()
  const stats = await failureStatsByJobName(
    queue,
    schedulers.map((scheduler) => scheduler.name ?? '')
  )
  return schedulers.map((scheduler) =>
    toMcpScheduledJobSummary(mapScheduledJob(queueName, scheduler, stats.get(scheduler.name ?? '')))
  )
}

export function createListScheduledJobsHandler(deps: ScheduledJobsHandlerDeps = defaultDeps) {
  return async function listScheduledJobsHandler(
    input: ListScheduledJobsHandlerInput
  ): Promise<ListScheduledJobsHandlerOutput> {
    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)
    const pageSize = Math.min(100, Math.max(1, input.pageSize))

    if (input.queueName) {
      const offset = decodeCursor(input.cursor)
      const indexed = await deps.findQueue(connection.id, input.queueName)
      if (!indexed) {
        throw new McpToolError('not_found', `Queue ${input.queueName} not found.`)
      }
      const queue = await deps.getQueueForConnection(connection, indexed.name)
      const all = await schedulersForQueue(queue, indexed.name)
      const page = all.slice(offset, offset + pageSize)
      const nextOffset = offset + page.length
      return {
        connectionId: connection.id,
        queueName: indexed.name,
        scheduledJobs: page,
        total: all.length,
        queuesScanned: 1,
        totalQueues: 1,
        nextCursor: nextOffset < all.length ? encodeCursor(nextOffset) : null,
      }
    }

    // Connection-wide: walk queues in index order, filling the page with each queue's
    // schedulers. The cursor records the next queue and the offset within it, so a queue with
    // more schedulers than one page can hold is split across pages instead of truncated.
    let { queueIndex, offset } = parseQueueOffsetCursor(input.cursor)
    const totalQueues = await deps.countQueues(connection.id)
    const scheduledJobs: McpScheduledJobSummary[] = []
    let queuesScanned = 0
    let nextCursor: string | null = null

    while (queueIndex < totalQueues && queuesScanned < SCHEDULED_JOBS_QUEUES_PER_PAGE) {
      const [indexed] = await deps.listQueues(connection.id, { offset: queueIndex, limit: 1 })
      if (!indexed) break
      queuesScanned += 1

      const queue = await deps.getQueueForConnection(connection, indexed.name)
      const all = await schedulersForQueue(queue, indexed.name)
      const remaining = pageSize - scheduledJobs.length
      const slice = all.slice(offset, offset + remaining)
      scheduledJobs.push(...slice)

      if (offset + slice.length < all.length) {
        nextCursor = encodeQueueOffsetCursor(queueIndex, offset + slice.length)
        break
      }
      queueIndex += 1
      offset = 0
      if (scheduledJobs.length >= pageSize && queueIndex < totalQueues) {
        nextCursor = encodeQueueOffsetCursor(queueIndex, 0)
        break
      }
    }

    if (nextCursor === null && queueIndex < totalQueues) {
      nextCursor = encodeQueueOffsetCursor(queueIndex, 0)
    }

    return {
      connectionId: connection.id,
      queueName: null,
      scheduledJobs,
      total: null,
      queuesScanned,
      totalQueues,
      nextCursor,
    }
  }
}

export function createGetScheduledJobHandler(deps: ScheduledJobsHandlerDeps = defaultDeps) {
  return async function getScheduledJobHandler(
    input: GetScheduledJobHandlerInput
  ): Promise<GetScheduledJobHandlerOutput> {
    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)
    const indexed = await deps.findQueue(connection.id, input.queueName)
    if (!indexed) {
      throw new McpToolError('not_found', `Queue ${input.queueName} not found.`)
    }

    const queue = await deps.getQueueForConnection(connection, indexed.name)
    const scheduler = (await queue.getJobSchedulers()).find(
      (candidate) => candidate.key === input.schedulerId
    )
    if (!scheduler) {
      throw new McpToolError(
        'not_found',
        `Scheduler ${input.schedulerId} not found in queue ${input.queueName}.`
      )
    }

    const stats = await failureStatsByJobName(queue, [scheduler.name ?? ''])
    return {
      connectionId: connection.id,
      scheduledJob: toMcpScheduledJobSummary(
        mapScheduledJob(indexed.name, scheduler, stats.get(scheduler.name ?? ''))
      ),
    }
  }
}

export const listScheduledJobsHandler = createListScheduledJobsHandler()
export const getScheduledJobHandler = createGetScheduledJobHandler()
