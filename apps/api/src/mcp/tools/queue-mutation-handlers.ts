import { redisDiscoveredQueueRepository } from '@durabull/dal'
import type { QueueMutationHandlerInput, QueuePauseHandlerOutput } from '@durabull/mcp'

import { getQueueForConnection, McpToolError, requireConnectionForPrincipal } from './shared'

interface QueueMutationHandlerDeps {
  requireConnectionForPrincipal: typeof requireConnectionForPrincipal
  getQueueForConnection: typeof getQueueForConnection
  findQueue: typeof redisDiscoveredQueueRepository.findByConnectionAndName
}

const defaultDeps: QueueMutationHandlerDeps = {
  requireConnectionForPrincipal,
  getQueueForConnection,
  findQueue: redisDiscoveredQueueRepository.findByConnectionAndName,
}

/**
 * Pausing a queue that BullMQ has never seen would create queue metadata in Redis, so both
 * mutations require the queue to be present in the discovery index first.
 */
async function loadIndexedQueue(deps: QueueMutationHandlerDeps, input: QueueMutationHandlerInput) {
  const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)
  const indexed = await deps.findQueue(connection.id, input.queueName)
  if (!indexed) {
    throw new McpToolError('not_found', `Queue ${input.queueName} not found.`)
  }
  const queue = await deps.getQueueForConnection(connection, indexed.name)
  return { connection, queue, queueName: indexed.name }
}

export function createPauseQueueHandler(deps: QueueMutationHandlerDeps = defaultDeps) {
  return async function pauseQueueHandler(
    input: QueueMutationHandlerInput
  ): Promise<QueuePauseHandlerOutput> {
    const { connection, queue, queueName } = await loadIndexedQueue(deps, input)
    const alreadyPaused = await queue.isPaused()
    if (!alreadyPaused) {
      await queue.pause()
    }
    return { connectionId: connection.id, queueName, isPaused: true, changed: !alreadyPaused }
  }
}

export function createResumeQueueHandler(deps: QueueMutationHandlerDeps = defaultDeps) {
  return async function resumeQueueHandler(
    input: QueueMutationHandlerInput
  ): Promise<QueuePauseHandlerOutput> {
    const { connection, queue, queueName } = await loadIndexedQueue(deps, input)
    const wasPaused = await queue.isPaused()
    if (wasPaused) {
      await queue.resume()
    }
    return { connectionId: connection.id, queueName, isPaused: false, changed: wasPaused }
  }
}

export const pauseQueueHandler = createPauseQueueHandler()
export const resumeQueueHandler = createResumeQueueHandler()
