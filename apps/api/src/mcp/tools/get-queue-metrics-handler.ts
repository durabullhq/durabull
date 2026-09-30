import { redisDiscoveredQueueRepository } from '@durabull/dal'
import type { GetQueueMetricsHandlerInput, GetQueueMetricsHandlerOutput } from '@durabull/mcp'

import {
  collectQueueMcpMetricsSummary,
  DEFAULT_METRICS_WINDOW_MINUTES,
  MCP_MAX_METRICS_WINDOW_MINUTES,
} from '../../lib/bullmq-metrics'
import { getQueue } from '../../lib/redis'
import { toRedisConnectionOptions } from '../../lib/connection-options'
import { McpToolError, requireConnectionForPrincipal } from './shared'

export async function getQueueMetricsHandler(
  input: GetQueueMetricsHandlerInput
): Promise<GetQueueMetricsHandlerOutput> {
  const connection = await requireConnectionForPrincipal(input.principal, input.connectionId)

  const indexedQueue = await redisDiscoveredQueueRepository.findByConnectionAndName(
    connection.id,
    input.queueName
  )
  if (!indexedQueue) {
    throw new McpToolError('not_found', `Queue ${input.queueName} not found.`)
  }

  const requestedWindowMinutes =
    typeof input.windowMinutes === 'number' && Number.isFinite(input.windowMinutes)
      ? Math.min(Math.max(Math.floor(input.windowMinutes), 1), MCP_MAX_METRICS_WINDOW_MINUTES)
      : DEFAULT_METRICS_WINDOW_MINUTES

  const queue = await getQueue(
    connection.id,
    connection.url,
    input.queueName,
    connection.prefix,
    toRedisConnectionOptions(connection.allowSelfSignedCerts)
  )

  const metrics = await collectQueueMcpMetricsSummary(queue, {
    queueName: input.queueName,
    windowMinutes: requestedWindowMinutes,
  })

  return {
    connectionId: connection.id,
    ...metrics,
  }
}
