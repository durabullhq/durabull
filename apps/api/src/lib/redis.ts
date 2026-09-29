import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { buildIoRedisConnectionOptions, type RedisConnectionOptions } from './connection-options'

export type { RedisConnectionOptions } from './connection-options'

export interface RedisClientLifecycle {
  /** Set to false for bounded, caller-owned clients such as background INFO probes. */
  cache?: boolean
}

export class RedisUnavailableError extends Error {
  readonly code = 'REDIS_UNAVAILABLE'
  readonly connectionId: string
  readonly connectionName?: string

  constructor(connectionId: string, message: string, connectionName?: string) {
    super(message)
    this.name = 'RedisUnavailableError'
    this.connectionId = connectionId
    this.connectionName = connectionName
  }
}

// Cache for Redis connections keyed by connection ID and URL
const redisConnections = new Map<string, Redis>()
// Cache in-flight connection attempts to prevent creating duplicate clients concurrently
const redisConnectionPromises = new Map<string, Promise<Redis>>()
// Cache recent failures to avoid hot-looping permanent connection/auth issues
const recentRedisConnectionFailures = new Map<
  string,
  { message: string; at: number; permanent: boolean }
>()
// Cache recent log lines to dedupe noisy repeated errors
const recentRedisErrorLogs = new Map<string, { message: string; at: number }>()
// Cache for queues keyed by connection ID, connection URL, prefix, and queue name
const queues = new Map<string, Queue>()

const REDIS_RECONNECT_BASE_DELAY_MS = 200
const REDIS_RECONNECT_MAX_DELAY_MS = 2000
const REDIS_MAX_RECONNECT_ATTEMPTS = 3
const REDIS_FAILURE_COOLDOWN_MS = 30_000
const REDIS_ERROR_LOG_DEDUPE_WINDOW_MS = 10_000
const DEFAULT_QUEUE_SCAN_COUNT = 1000

function extractQueueNameFromMetaKey(key: string): string | null {
  // BullMQ meta keys end with ":meta". Queue names cannot contain ":".
  // This means the queue name is always the segment just before "meta",
  // even when prefixes are namespaced (for example "bull:prod-east:<queue>:meta").
  const parts = key.split(':')
  if (parts.length < 3) return null
  if (parts[parts.length - 1] !== 'meta') return null

  const queueName = parts[parts.length - 2]
  if (!queueName) return null
  return queueName
}

function normalizeRedisErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string') return error
  if (error === null || error === undefined) return 'Unknown Redis error'
  return String(error)
}

function redactRedisSensitiveData(message: string): string {
  return message
    .replace(/(redis(?:s)?:\/\/)([^@/\s]+)@/gi, '$1[REDACTED]@')
    .replace(/(args:\s*\[[^\]]*?"[^"]*?",\s*")[^"]*(")/gi, '$1[REDACTED]$2')
}

function getSafeRedisErrorMessage(error: unknown): string {
  return redactRedisSensitiveData(normalizeRedisErrorMessage(error))
}

function isPermanentRedisConnectionError(message: string): boolean {
  const normalized = message.toLowerCase()

  return (
    normalized.includes('allowlist') ||
    normalized.includes('invalid username-password pair') ||
    normalized.includes('wrongpass') ||
    normalized.includes('authentication failed') ||
    normalized.includes('noauth') ||
    normalized.includes('acl')
  )
}

function toRedisUnavailableError(
  connectionId: string,
  connectionName: string | undefined,
  message: string
): RedisUnavailableError {
  return new RedisUnavailableError(
    connectionId,
    `Failed to connect to Redis (${connectionName ?? connectionId}): ${message}`,
    connectionName
  )
}

function disconnectRedisClient(redis: Redis) {
  try {
    redis.disconnect(false)
  } catch {
    // Ignore cleanup failures; connection is already unhealthy.
  }
}

function shouldLogRedisError(connectionId: string, message: string): boolean {
  const now = Date.now()
  const existing = recentRedisErrorLogs.get(connectionId)

  if (
    existing &&
    existing.message === message &&
    now - existing.at < REDIS_ERROR_LOG_DEDUPE_WINDOW_MS
  ) {
    return false
  }

  recentRedisErrorLogs.set(connectionId, { message, at: now })
  return true
}

function buildRedisClient(
  connectionUrl: string,
  cacheKey: string,
  label: string,
  options?: RedisConnectionOptions
): Redis {
  const redis = new Redis(connectionUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy: (attempts) => {
      if (attempts > REDIS_MAX_RECONNECT_ATTEMPTS) return null
      return Math.min(attempts * REDIS_RECONNECT_BASE_DELAY_MS, REDIS_RECONNECT_MAX_DELAY_MS)
    },
    ...buildIoRedisConnectionOptions(options),
  })

  redis.on('error', (error) => {
    const message = getSafeRedisErrorMessage(error)

    if (shouldLogRedisError(cacheKey, message)) {
      console.error(`❌ Redis error (${label}): ${message}`)
    }

    if (isPermanentRedisConnectionError(message)) {
      recentRedisConnectionFailures.set(cacheKey, {
        message,
        at: Date.now(),
        permanent: true,
      })
      disconnectRedisClient(redis)
    }
  })

  redis.on('end', () => {
    redisConnections.delete(cacheKey)
  })

  return redis
}

/**
 * Get or create a Redis connection for the given connection ID and URL.
 */
export async function getRedis(
  connectionId: string,
  connectionUrl: string,
  connectionName?: string,
  options?: RedisConnectionOptions,
  lifecycle: RedisClientLifecycle = {}
): Promise<Redis> {
  const shouldCache = lifecycle.cache !== false
  const sharedCacheKey = JSON.stringify([
    connectionId,
    connectionUrl,
    options?.allowSelfSignedCerts ?? false,
  ])
  const cacheKey = shouldCache ? sharedCacheKey : `caller-owned:${sharedCacheKey}`
  if (shouldCache) {
    const existingConnection = redisConnections.get(cacheKey)
    if (existingConnection) {
      if (existingConnection.status !== 'end') {
        return existingConnection
      }
      redisConnections.delete(cacheKey)
    }
  }

  const recentFailure = recentRedisConnectionFailures.get(cacheKey)
  if (recentFailure) {
    const elapsed = Date.now() - recentFailure.at
    if (recentFailure.permanent && elapsed < REDIS_FAILURE_COOLDOWN_MS) {
      throw toRedisUnavailableError(connectionId, connectionName, recentFailure.message)
    }
    recentRedisConnectionFailures.delete(cacheKey)
  }

  if (shouldCache) {
    const inFlightConnection = redisConnectionPromises.get(cacheKey)
    if (inFlightConnection) {
      return inFlightConnection
    }
  }

  const connectPromise = (async () => {
    const redis = buildRedisClient(connectionUrl, cacheKey, connectionName ?? connectionId, options)

    try {
      await redis.connect()
      if (shouldCache) redisConnections.set(cacheKey, redis)
      recentRedisConnectionFailures.delete(cacheKey)
      if (shouldCache) console.log(`✅ Connected to Redis: ${connectionName ?? connectionId}`)
      return redis
    } catch (error) {
      const message = getSafeRedisErrorMessage(error)
      const existingFailure = recentRedisConnectionFailures.get(cacheKey)
      const permanent = existingFailure?.permanent ?? isPermanentRedisConnectionError(message)
      const failureMessage = existingFailure?.permanent ? existingFailure.message : message
      recentRedisConnectionFailures.set(cacheKey, {
        message: failureMessage,
        at: Date.now(),
        permanent,
      })
      disconnectRedisClient(redis)
      throw toRedisUnavailableError(connectionId, connectionName, failureMessage)
    } finally {
      if (shouldCache) redisConnectionPromises.delete(cacheKey)
    }
  })()

  if (shouldCache) redisConnectionPromises.set(cacheKey, connectPromise)
  return connectPromise
}

/**
 * Discover queues for a specific Redis connection.
 */
export async function discoverQueues(
  connectionId: string,
  connectionUrl: string,
  prefix = 'bull',
  options?: RedisConnectionOptions
): Promise<Array<string>> {
  const queueNames = new Set<string>()
  let cursor = '0'

  do {
    const page = await scanQueuesPage(
      connectionId,
      connectionUrl,
      cursor,
      DEFAULT_QUEUE_SCAN_COUNT,
      prefix,
      options
    )
    cursor = page.cursor
    for (const queueName of page.queueNames) {
      queueNames.add(queueName)
    }
  } while (cursor !== '0')

  return Array.from(queueNames)
}

export interface QueueScanPage {
  cursor: string
  queueNames: string[]
}

export async function scanQueuesPage(
  connectionId: string,
  connectionUrl: string,
  cursor = '0',
  count = DEFAULT_QUEUE_SCAN_COUNT,
  prefix = 'bull',
  options?: RedisConnectionOptions
): Promise<QueueScanPage> {
  const redisClient = await getRedis(connectionId, connectionUrl, undefined, options)
  const scanCount = Math.max(100, count)
  const escapedPrefix = prefix.replace(/[\\*?[\]]/g, '\\$&')
  const [nextCursor, keys] = await redisClient.scan(
    cursor,
    'MATCH',
    `${escapedPrefix}:*:meta`,
    'COUNT',
    scanCount
  )

  const queueNames = new Set<string>()
  for (const key of keys) {
    const queueName = extractQueueNameFromMetaKey(key)
    if (queueName) {
      queueNames.add(queueName)
    }
  }

  return {
    cursor: nextCursor,
    queueNames: Array.from(queueNames),
  }
}

/**
 * Debug: Get all prefix:* keys to understand the Redis structure.
 */
export async function debugGetBullKeys(
  connectionId: string,
  connectionUrl: string,
  prefix = 'bull',
  options?: RedisConnectionOptions
): Promise<string[]> {
  const redisClient = await getRedis(connectionId, connectionUrl, undefined, options)
  const escapedPrefix = prefix.replace(/[\\*?[\]]/g, '\\$&')
  const keys: string[] = []
  let cursor = '0'

  do {
    const [nextCursor, foundKeys] = await redisClient.scan(
      cursor,
      'MATCH',
      `${escapedPrefix}:*`,
      'COUNT',
      100
    )
    cursor = nextCursor
    keys.push(...foundKeys)
  } while (cursor !== '0')

  return keys.sort()
}

/**
 * Get or create a Queue instance for the given connection and queue name.
 */
export async function getQueue(
  connectionId: string,
  connectionUrl: string,
  name: string,
  prefix = 'bull',
  options?: RedisConnectionOptions
): Promise<Queue> {
  const cacheKey = JSON.stringify([
    connectionId,
    connectionUrl,
    prefix,
    name,
    options?.allowSelfSignedCerts ?? false,
  ])

  if (!queues.has(cacheKey)) {
    const queue = new Queue(name, {
      connection: {
        url: connectionUrl,
        maxRetriesPerRequest: null,
        retryStrategy: (attempts: number) => {
          if (attempts > REDIS_MAX_RECONNECT_ATTEMPTS) return null
          return Math.min(attempts * REDIS_RECONNECT_BASE_DELAY_MS, REDIS_RECONNECT_MAX_DELAY_MS)
        },
        ...buildIoRedisConnectionOptions(options),
      },
      prefix,
    })

    queue.on('error', (error) => {
      const message = getSafeRedisErrorMessage(error)

      if (shouldLogRedisError(`queue:${cacheKey}`, message)) {
        console.error(`❌ Queue connection error (${name}): ${message}`)
      }

      if (isPermanentRedisConnectionError(message)) {
        recentRedisConnectionFailures.set(
          JSON.stringify([connectionId, connectionUrl, options?.allowSelfSignedCerts ?? false]),
          {
            message,
            at: Date.now(),
            permanent: true,
          }
        )
        queue.close().catch(() => {})
        queues.delete(cacheKey)
      }
    })

    queues.set(cacheKey, queue)
  }

  return queues.get(cacheKey)!
}

/**
 * Safely fetch workers, returning empty array if CLIENT LIST permission is unavailable
 */
export async function safeGetWorkers(queue: Queue): Promise<Array<Record<string, string>>> {
  try {
    return await queue.getWorkers()
  } catch (error) {
    console.warn(
      `❌ Could not fetch workers for queue ${queue.name}:`,
      error instanceof Error ? error.message : 'unknown error'
    )
    return []
  }
}
