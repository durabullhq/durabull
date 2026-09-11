import { redisDiscoveredQueueRepository } from '@durabull/dal'
import type { FindJobHandlerInput, FindJobHandlerOutput } from '@durabull/mcp'

import {
  getQueueForConnection,
  mapWithConcurrency,
  requireConnectionForPrincipal,
  toMcpJobSummary,
} from './shared'

/** Upper bound on queues probed per call; keeps one tool call to a predictable Redis cost. */
export const FIND_JOB_MAX_QUEUES = 100
const FIND_JOB_CONCURRENCY = 8

interface FindJobHandlerDeps {
  requireConnectionForPrincipal: typeof requireConnectionForPrincipal
  getQueueForConnection: typeof getQueueForConnection
  countQueues: typeof redisDiscoveredQueueRepository.countByConnection
  listQueues: typeof redisDiscoveredQueueRepository.listByConnection
}

export function createFindJobHandler(
  deps: FindJobHandlerDeps = {
    requireConnectionForPrincipal,
    getQueueForConnection,
    countQueues: redisDiscoveredQueueRepository.countByConnection,
    listQueues: redisDiscoveredQueueRepository.listByConnection,
  }
) {
  return async function findJobHandler(input: FindJobHandlerInput): Promise<FindJobHandlerOutput> {
    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)

    const [totalQueues, indexedQueues] = await Promise.all([
      deps.countQueues(connection.id),
      deps.listQueues(connection.id, { offset: 0, limit: FIND_JOB_MAX_QUEUES }),
    ])

    const probes = await mapWithConcurrency(
      indexedQueues,
      FIND_JOB_CONCURRENCY,
      async (indexed) => {
        const queue = await deps.getQueueForConnection(connection, indexed.name)
        const job = await queue.getJob(input.jobId)
        if (!job) return null
        const state = await job.getState()
        return { queueName: indexed.name, job: toMcpJobSummary(job, state) }
      }
    )

    return {
      connectionId: connection.id,
      jobId: input.jobId,
      matches: probes.filter((match): match is NonNullable<typeof match> => match !== null),
      queuesScanned: indexedQueues.length,
      totalQueues,
      truncated: totalQueues > indexedQueues.length,
    }
  }
}

export const findJobHandler = createFindJobHandler()
