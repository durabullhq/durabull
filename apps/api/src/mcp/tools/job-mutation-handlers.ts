import type { JobMutationHandlerInput, JobMutationHandlerOutput } from '@durabull/mcp'

import { getQueueForConnection, McpToolError, requireConnectionForPrincipal } from './shared'

interface JobMutationHandlerDeps {
  requireConnectionForPrincipal: typeof requireConnectionForPrincipal
  getQueueForConnection: typeof getQueueForConnection
}

const defaultDeps: JobMutationHandlerDeps = { requireConnectionForPrincipal, getQueueForConnection }

async function loadJob(deps: JobMutationHandlerDeps, input: JobMutationHandlerInput) {
  const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)
  const queue = await deps.getQueueForConnection(connection, input.queueName)
  const job = await queue.getJob(input.jobId)
  if (!job) {
    throw new McpToolError('not_found', `Job ${input.jobId} not found in queue ${input.queueName}.`)
  }
  return { connection, job, state: await job.getState() }
}

export function createRetryJobHandler(deps: JobMutationHandlerDeps = defaultDeps) {
  return async function retryJobHandler(
    input: JobMutationHandlerInput
  ): Promise<JobMutationHandlerOutput> {
    const { connection, job, state } = await loadJob(deps, input)
    if (state !== 'failed') {
      throw new McpToolError(
        'conflict',
        `Only failed jobs can be retried; job ${input.jobId} is ${state}.`
      )
    }

    await job.retry()

    return {
      connectionId: connection.id,
      queueName: input.queueName,
      jobId: input.jobId,
      previousState: state,
      state: await job.getState(),
    }
  }
}

export function createPromoteJobHandler(deps: JobMutationHandlerDeps = defaultDeps) {
  return async function promoteJobHandler(
    input: JobMutationHandlerInput
  ): Promise<JobMutationHandlerOutput> {
    const { connection, job, state } = await loadJob(deps, input)
    if (state !== 'delayed') {
      throw new McpToolError(
        'conflict',
        `Only delayed jobs can be promoted; job ${input.jobId} is ${state}.`
      )
    }

    await job.promote()

    return {
      connectionId: connection.id,
      queueName: input.queueName,
      jobId: input.jobId,
      previousState: state,
      state: await job.getState(),
    }
  }
}

export const retryJobHandler = createRetryJobHandler()
export const promoteJobHandler = createPromoteJobHandler()
