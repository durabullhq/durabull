import type { GetQueueHandlerInput, GetQueueHandlerOutput } from '@durabull/mcp'
import { toRedisConnectionOptions } from '../../lib/connection-options'
import { getQueue, safeGetWorkers } from '../../lib/redis'
import { toRedisClientSummary } from '../../lib/redis-client-time'
import { requireConnectionForPrincipal } from './shared'

export async function getQueueHandler(input: GetQueueHandlerInput): Promise<GetQueueHandlerOutput> {
  const connection = await requireConnectionForPrincipal(input.principal, input.connectionId)

  const queue = await getQueue(
    connection.id,
    connection.url,
    input.queueName,
    connection.prefix,
    toRedisConnectionOptions(connection.allowSelfSignedCerts)
  )

  const [counts, isPaused, workers, schedulers] = await Promise.all([
    queue.getJobCounts(),
    queue.isPaused(),
    safeGetWorkers(queue),
    queue.getJobSchedulers(),
  ])

  return {
    connectionId: connection.id,
    name: input.queueName,
    status: isPaused ? 'paused' : 'active',
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
    scheduledJobsCount: schedulers.length,
    workers: workers.map(toRedisClientSummary),
  }
}
