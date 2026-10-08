import { getQueue } from '../../lib/redis'
import { toRedisConnectionOptions } from '../../lib/connection-options'
import type { GetJobStacktracesHandlerInput, GetJobStacktracesHandlerOutput } from '@durabull/mcp'
import { McpToolError, decodeCursor, encodeCursor, requireConnectionForPrincipal } from './shared'

interface GetJobStacktracesHandlerDeps {
  getQueue: typeof getQueue
  requireConnectionForPrincipal: typeof requireConnectionForPrincipal
}

export function createGetJobStacktracesHandler(
  deps: GetJobStacktracesHandlerDeps = { getQueue, requireConnectionForPrincipal }
) {
  return async function getJobStacktracesHandler(
    input: GetJobStacktracesHandlerInput
  ): Promise<GetJobStacktracesHandlerOutput> {
    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)

    const queue = await deps.getQueue(
      connection.id,
      connection.url,
      input.queueName,
      connection.prefix,
      toRedisConnectionOptions(connection.allowSelfSignedCerts)
    )
    const job = await queue.getJob(input.jobId)
    if (!job) {
      throw new McpToolError(
        'not_found',
        `Job ${input.jobId} not found in queue ${input.queueName}.`
      )
    }

    const allStacktraces = job.stacktrace ?? []
    const pageSize = Math.min(100, Math.max(1, input.pageSize))
    const offset = decodeCursor(input.cursor)
    const reversed = [...allStacktraces].reverse()
    const page = reversed.slice(offset, offset + pageSize)
    const nextOffset = offset + page.length

    return {
      connectionId: connection.id,
      queueName: input.queueName,
      jobId: input.jobId,
      total: allStacktraces.length,
      stacktraces: page.map((stacktrace, index) => ({
        attemptNumber: allStacktraces.length - (offset + index),
        stacktrace,
        isLatest: offset + index === 0,
      })),
      nextCursor: nextOffset < allStacktraces.length ? encodeCursor(nextOffset) : null,
    }
  }
}

export const getJobStacktracesHandler = createGetJobStacktracesHandler()
