#!/usr/bin/env bun

import '@durabull/env'
import {
  getWorkloadConnections,
  HEARTBEAT_INTERVAL_MS,
  maskRedisUrl,
  NAMESPACE_QUEUES,
  QUEUE_CONFIGS,
  TOTAL_SCHEDULED_JOBS,
} from './config'
import { ConnectionRuntime } from './connection-runtime'
import { createLogger } from './logger'
import { sleep } from './random'
import { StatsTracker } from './stats'

const logger = createLogger({
  scope: 'fleet-demo-workload',
})

class WorkloadApplication {
  private readonly stats = new StatsTracker()
  private readonly runtimes: ConnectionRuntime[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private stopping = false

  async start(): Promise<void> {
    const connections = getWorkloadConnections()
    validateConnectionConfiguration(connections[0])

    logger.info('bootstrap', 'Starting 24/7 workload application', {
      connectionCount: connections.length,
      queueCountPerConnection: QUEUE_CONFIGS.length,
      scheduledJobsPerConnection: TOTAL_SCHEDULED_JOBS,
      totalLogicalQueues: connections.length * QUEUE_CONFIGS.length,
      totalLogicalScheduledJobs: connections.length * TOTAL_SCHEDULED_JOBS,
      metricsWindowPoints: process.env.WORKLOAD_METRICS_MAX_DATA_POINTS || 'default',
      heartbeatMs: HEARTBEAT_INTERVAL_MS,
      namespaceQueues: NAMESPACE_QUEUES,
      connections: connections.map((connection) => ({
        slug: connection.slug,
        environment: connection.environment,
        name: connection.name,
        redisUrl: maskRedisUrl(connection.url),
        redisUrlSource: connection.urlSource,
        queuePrefix: connection.queuePrefix,
      })),
    })

    for (const connection of connections) {
      const runtime = new ConnectionRuntime(connection, QUEUE_CONFIGS, this.stats, logger)
      await runtime.start()
      this.runtimes.push(runtime)
      await sleep(150)
    }

    this.heartbeatTimer = setInterval(() => {
      const snapshot = this.stats.snapshotAndResetWindow()
      logger.info('heartbeat', 'Workload heartbeat', {
        totals: snapshot.totals,
        window: snapshot.window,
        windowMs: snapshot.windowMs,
        uptimeMs: snapshot.uptimeMs,
        topConnections: snapshot.connections.slice(0, 1),
        hottestQueues: snapshot.hottestQueues,
        runtimeState: this.runtimes.map((runtime) => runtime.getSnapshot()),
      })
    }, HEARTBEAT_INTERVAL_MS)

    logger.info('ready', 'Workload application running continuously')
  }

  async stop(reason: string): Promise<void> {
    if (this.stopping) return
    this.stopping = true

    logger.warn('shutdown.begin', 'Stopping workload application', { reason })

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    await Promise.allSettled(this.runtimes.map((runtime) => runtime.stop(reason)))
    this.runtimes.length = 0

    logger.info('shutdown.complete', 'Workload application stopped')
  }
}

function validateConnectionConfiguration(
  connection: ReturnType<typeof getWorkloadConnections>[number]
): void {
  const usingLocalFallback = connection.urlSource === 'default-localhost'
  const runningInCloud = process.env.RENDER === 'true' || process.env.NODE_ENV === 'production'
  if (usingLocalFallback && runningInCloud) {
    throw new Error(
      'Redis URL config missing. Set WORKLOAD_REDIS_URL. ' +
        'The workload resolved to default localhost, which is not reachable in cloud environments.'
    )
  }
}

const app = new WorkloadApplication()
let shutdownInProgress = false

async function shutdown(signal: string, code: number): Promise<void> {
  if (shutdownInProgress) return
  shutdownInProgress = true
  await app.stop(signal)
  process.exit(code)
}

process.on('SIGINT', () => {
  void shutdown('SIGINT', 0)
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM', 0)
})

process.on('uncaughtException', (error) => {
  logger.error('process.uncaughtException', 'Unhandled exception', {}, error)
  void shutdown('uncaughtException', 1)
})

process.on('unhandledRejection', (reason) => {
  logger.error('process.unhandledRejection', 'Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  })
  void shutdown('unhandledRejection', 1)
})

async function main(): Promise<void> {
  await app.start()
}

void main().catch(async (error) => {
  logger.error('bootstrap.failed', 'Failed to start workload application', {}, error)
  await app.stop('startup-failure')
  process.exit(1)
})
