import {
  type RedisConnection,
  redisConnectionRepository,
  redisDiscoveredQueueRepository,
} from '@durabull/dal'
import type { Job, Queue } from 'bullmq'
import { isResourceSuspended } from '../../billing/entitlements'
import { toRedisConnectionOptions } from '../connection-options'
import { getQueue } from '../redis'

/** Bounds a Slack lookup to a predictable Redis cost. */
const MAX_QUEUES_PROBED = 100
const PROBE_CONCURRENCY = 8
const SLACK_REDIS_TIMEOUT_MS = 8_000

export class SlackOperationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SlackOperationError'
  }
}

export async function withRedisTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new SlackOperationError(`Redis did not answer in time (${label}).`)),
          SLACK_REDIS_TIMEOUT_MS
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** An enabled, plan-active connection, or a readable reason it cannot be used. */
export async function requireUsableConnection(
  organizationId: string,
  connectionId: string
): Promise<RedisConnection> {
  const connection = await redisConnectionRepository.findById(connectionId, organizationId)
  if (!connection) throw new SlackOperationError('That Redis connection no longer exists.')
  if (!connection.enabled) {
    throw new SlackOperationError(`Connection "${connection.name}" is disabled in Durabull.`)
  }
  if (await isResourceSuspended(organizationId, 'connection', connection.id)) {
    throw new SlackOperationError(
      `Connection "${connection.name}" is paused because it is above the plan's connection limit.`
    )
  }
  return connection
}

export function openQueue(connection: RedisConnection, queueName: string): Promise<Queue> {
  return getQueue(
    connection.id,
    connection.url,
    queueName,
    connection.prefix,
    toRedisConnectionOptions(connection.allowSelfSignedCerts)
  )
}

export async function listUsableConnections(organizationId: string): Promise<RedisConnection[]> {
  const connections = await redisConnectionRepository.findAll(organizationId)
  const usable: RedisConnection[] = []
  for (const connection of connections) {
    if (!connection.enabled) continue
    if (await isResourceSuspended(organizationId, 'connection', connection.id)) continue
    usable.push(connection)
  }
  return usable
}

export interface QueueOverview {
  connection: RedisConnection
  queueName: string
  paused: boolean
  counts: Record<'waiting' | 'active' | 'delayed' | 'failed' | 'completed' | 'prioritized', number>
}

export async function getQueueOverview(
  connection: RedisConnection,
  queueName: string
): Promise<QueueOverview> {
  const queue = await openQueue(connection, queueName)
  const [counts, paused] = await withRedisTimeout(
    Promise.all([
      queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'prioritized'),
      queue.isPaused(),
    ]),
    'queue counts'
  )
  return {
    connection,
    queueName,
    paused,
    counts: {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
      prioritized: counts.prioritized ?? 0,
    },
  }
}

/** Connections in the organization that have discovered a queue with this exact name. */
export async function findQueueConnections(
  organizationId: string,
  queueName: string,
  connectionHint?: string
): Promise<RedisConnection[]> {
  const connections = await listUsableConnections(organizationId)
  const hint = connectionHint?.trim().toLowerCase()
  const candidates = hint
    ? connections.filter(
        (connection) =>
          connection.name.toLowerCase() === hint ||
          connection.id === connectionHint ||
          connection.environment?.toLowerCase() === hint
      )
    : connections
  const matches: RedisConnection[] = []
  for (const connection of candidates) {
    if (await redisDiscoveredQueueRepository.findByConnectionAndName(connection.id, queueName)) {
      matches.push(connection)
    }
  }
  return matches
}

export interface FoundJob {
  connection: RedisConnection
  queueName: string
  job: Job
  state: string
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++
      results[current] = await fn(items[current] as T)
    }
  })
  await Promise.all(workers)
  return results
}

/** Looks a job id up across an organization's queues (optionally one named queue). */
export async function findJob(
  organizationId: string,
  jobId: string,
  queueName?: string
): Promise<{ matches: FoundJob[]; truncated: boolean }> {
  const connections = await listUsableConnections(organizationId)
  const matches: FoundJob[] = []
  let truncated = false
  for (const connection of connections) {
    const queueNames = queueName
      ? [queueName]
      : (
          await redisDiscoveredQueueRepository.listByConnection(connection.id, {
            offset: 0,
            limit: MAX_QUEUES_PROBED,
          })
        ).map((queue) => queue.name)
    if (!queueName) {
      const total = await redisDiscoveredQueueRepository.countByConnection(connection.id)
      if (total > queueNames.length) truncated = true
    }
    const probes = await mapWithConcurrency(queueNames, PROBE_CONCURRENCY, async (name) => {
      try {
        const queue = await openQueue(connection, name)
        const job = await withRedisTimeout(queue.getJob(jobId), 'job lookup')
        if (!job) return null
        return { connection, queueName: name, job, state: await job.getState() }
      } catch {
        return null
      }
    })
    for (const probe of probes) if (probe) matches.push(probe)
    if (matches.length >= 5) break
  }
  return { matches, truncated }
}

/** Retries one failed job, the same operation as the Retry button in Durabull. */
export async function retryFailedJob(
  organizationId: string,
  input: { connectionId: string; queueName: string; jobId: string }
): Promise<{ connection: RedisConnection }> {
  const connection = await requireUsableConnection(organizationId, input.connectionId)
  const queue = await openQueue(connection, input.queueName)
  const job = await withRedisTimeout(queue.getJob(input.jobId), 'job lookup')
  if (!job)
    throw new SlackOperationError(`Job ${input.jobId} no longer exists in ${input.queueName}.`)
  const state = await withRedisTimeout(job.getState(), 'job state')
  if (state !== 'failed') {
    throw new SlackOperationError(
      `Job ${input.jobId} is ${state}; only failed jobs can be retried.`
    )
  }
  await withRedisTimeout(job.retry(), 'job retry')
  return { connection }
}

export async function setQueuePaused(
  organizationId: string,
  input: { connectionId: string; queueName: string; paused: boolean }
): Promise<QueueOverview> {
  const connection = await requireUsableConnection(organizationId, input.connectionId)
  const queue = await openQueue(connection, input.queueName)
  await withRedisTimeout(input.paused ? queue.pause() : queue.resume(), 'pause queue')
  return getQueueOverview(connection, input.queueName)
}
