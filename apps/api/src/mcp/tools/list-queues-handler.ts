import { redisDiscoveredQueueRepository } from '@durabull/dal'
import { getQueue } from '../../lib/redis'
import { toRedisConnectionOptions } from '../../lib/connection-options'
import type { ListQueuesHandlerInput, ListQueuesHandlerOutput } from '@durabull/mcp'
import { decodeCursor, encodeCursor, requireConnectionForPrincipal } from './shared'

export async function listQueuesHandler(
  input: ListQueuesHandlerInput
): Promise<ListQueuesHandlerOutput> {
  const connection = await requireConnectionForPrincipal(input.principal, input.connectionId)

  const offset = decodeCursor(input.cursor)
  const pageSize = Math.min(100, Math.max(1, input.pageSize))
  const [total, indexedQueues] = await Promise.all([
    redisDiscoveredQueueRepository.countByConnection(connection.id),
    redisDiscoveredQueueRepository.listByConnection(connection.id, { offset, limit: pageSize }),
  ])

  const queues = await Promise.all(
    indexedQueues.map(async (indexedQueue) => {
      const queue = await getQueue(
        connection.id,
        connection.url,
        indexedQueue.name,
        connection.prefix,
        toRedisConnectionOptions(connection.allowSelfSignedCerts)
      )
      const [counts, isPaused] = await Promise.all([queue.getJobCounts(), queue.isPaused()])
      return {
        name: indexedQueue.name,
        status: isPaused ? ('paused' as const) : ('active' as const),
        jobCounts: {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          paused: counts.paused ?? 0,
          prioritized: counts.prioritized ?? 0,
        },
        isPaused,
        discoveryState: indexedQueue.state,
      }
    })
  )

  const nextOffset = offset + queues.length
  return {
    connectionId: connection.id,
    total,
    queues,
    nextCursor: nextOffset < total ? encodeCursor(nextOffset) : null,
  }
}
