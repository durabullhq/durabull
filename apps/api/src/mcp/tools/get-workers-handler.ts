import { redisDiscoveredQueueRepository } from '@durabull/dal'
import type { GetWorkersHandlerInput, GetWorkersHandlerOutput } from '@durabull/mcp'
import { toRedisConnectionOptions } from '../../lib/connection-options'
import { getQueue } from '../../lib/redis'
import { toRedisClientSummary } from '../../lib/redis-client-time'
import {
  encodeWorkersCursor,
  McpToolError,
  parseWorkersCursor,
  requireConnectionForPrincipal,
} from './shared'

/** Max queues scanned in one get_workers call when queueName is omitted. */
const MAX_QUEUES_SCANNED_PER_REQUEST = 50

export async function getWorkersHandler(
  input: GetWorkersHandlerInput
): Promise<GetWorkersHandlerOutput> {
  const connection = await requireConnectionForPrincipal(input.principal, input.connectionId)
  const pageSize = Math.min(100, Math.max(1, input.pageSize))
  let { queueIndex, workerOffset } = parseWorkersCursor(input.cursor)

  const redisOptions = toRedisConnectionOptions(connection.allowSelfSignedCerts)

  const totalQueues = input.queueName
    ? 1
    : await redisDiscoveredQueueRepository.countByConnection(connection.id)

  const workers: GetWorkersHandlerOutput['workers'] = []
  const queues: GetWorkersHandlerOutput['queues'] = []
  let hasMore = false
  let queuesScanned = 0

  while (workers.length < pageSize && queueIndex < totalQueues) {
    if (!input.queueName && workerOffset === 0) {
      if (queuesScanned >= MAX_QUEUES_SCANNED_PER_REQUEST) {
        hasMore = true
        break
      }
      queuesScanned += 1
    }
    let queueName: string
    if (input.queueName) {
      if (queueIndex > 0) {
        break
      }
      const indexedQueue = await redisDiscoveredQueueRepository.findByConnectionAndName(
        connection.id,
        input.queueName
      )
      if (!indexedQueue) {
        throw new McpToolError('not_found', `Queue ${input.queueName} not found.`)
      }
      queueName = indexedQueue.name
    } else {
      const indexedQueues = await redisDiscoveredQueueRepository.listByConnection(connection.id, {
        offset: queueIndex,
        limit: 1,
      })
      if (indexedQueues.length === 0) {
        break
      }
      queueName = indexedQueues[0].name
    }

    const queue = await getQueue(
      connection.id,
      connection.url,
      queueName,
      connection.prefix,
      redisOptions
    )
    let queueWorkers: Array<Record<string, string>>
    try {
      queueWorkers = await queue.getWorkers()
    } catch {
      throw new McpToolError('internal_error', `Could not fetch workers for queue ${queueName}.`)
    }

    const [isPaused, counts] = await Promise.all([queue.isPaused(), queue.getJobCounts()])

    const sortedWorkers = [...queueWorkers].sort((left, right) =>
      String(left.id ?? '').localeCompare(String(right.id ?? ''))
    )

    for (let index = workerOffset; index < sortedWorkers.length; index += 1) {
      if (workers.length >= pageSize) {
        hasMore = true
        workerOffset = index
        break
      }

      const worker = sortedWorkers[index]
      workers.push({ ...toRedisClientSummary(worker), queueName })
    }

    if (!hasMore) {
      queues.push({
        name: queueName,
        workerCount: sortedWorkers.length,
        status: isPaused ? 'paused' : 'active',
        jobCounts: {
          active: counts.active ?? 0,
          waiting: counts.waiting ?? 0,
        },
      })
      queueIndex += 1
      workerOffset = 0
    }
  }

  if (queueIndex < totalQueues || hasMore) {
    hasMore = true
  }

  const nextCursor = hasMore ? encodeWorkersCursor(queueIndex, workerOffset) : null

  return {
    connectionId: connection.id,
    totalQueues,
    totalWorkersInPage: workers.length,
    workers,
    queues,
    nextCursor,
  }
}
