import { getQueue } from '../../lib/redis'
import { toRedisConnectionOptions } from '../../lib/connection-options'
import type { GetJobLogsHandlerInput, GetJobLogsHandlerOutput } from '@durabull/mcp'
import { McpToolError, decodeCursor, encodeCursor, requireConnectionForPrincipal } from './shared'

interface GetJobLogsHandlerDeps {
  getQueue: typeof getQueue
  requireConnectionForPrincipal: typeof requireConnectionForPrincipal
}

export function createGetJobLogsHandler(
  deps: GetJobLogsHandlerDeps = { getQueue, requireConnectionForPrincipal }
) {
  return async function getJobLogsHandler(
    input: GetJobLogsHandlerInput
  ): Promise<GetJobLogsHandlerOutput> {
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

    const pageSize = Math.min(100, Math.max(1, input.pageSize))
    const offset = decodeCursor(input.cursor)
    const end = offset + pageSize - 1
    const logs = await queue.getJobLogs(input.jobId, offset, end)
    const nextOffset = offset + pageSize

    return {
      connectionId: connection.id,
      queueName: input.queueName,
      jobId: input.jobId,
      logs: logs.logs ?? [],
      total: logs.count ?? 0,
      nextCursor: nextOffset < (logs.count ?? 0) ? encodeCursor(nextOffset) : null,
    }
  }
}

export const getJobLogsHandler = createGetJobLogsHandler()
