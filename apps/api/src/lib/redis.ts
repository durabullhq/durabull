import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
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
// Cache recent failures so unreachable connections back off instead of opening a socket on
// every request or monitor tick. Bun retains memory for every failed connect, so repeated
// attempts against dead hosts grow the heap until the process runs out of memory.
const recentRedisConnectionFailures = new Map<
  string,
  { message: string; permanent: boolean; consecutive: number; retryAt: number }
>()
// The most specific error each client reported (permanent errors win over later generic ones);
// connect() itself only rejects with "Connection is closed"
const redisErrorCauses = new WeakMap<Redis, string>()
// Cache recent log lines to dedupe noisy repeated errors
const recentRedisErrorLogs = new Map<string, { message: string; at: number }>()
// Cache for queues keyed by connection ID, connection URL, prefix, and queue name
const queues = new Map<string, Queue>()
// The last error each queue's connection reported, used as the failure message once it ends
const queueErrorCauses = new WeakMap<Queue, string>()

const REDIS_RECONNECT_BASE_DELAY_MS = 200
const REDIS_RECONNECT_MAX_DELAY_MS = 2000
const REDIS_MAX_RECONNECT_ATTEMPTS = 3
const REDIS_FAILURE_COOLDOWN_MS = 30_000
const REDIS_FAILURE_BACKOFF_BASE_MS = 5_000
const REDIS_FAILURE_BACKOFF_MAX_MS = 5 * 60_000
// Matches ioredis's default connectTimeout, which used to bound the lookup it performs itself
const REDIS_DNS_TIMEOUT_MS = 10_000
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

let resolveHostname = async (hostname: string): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      lookup(hostname),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`getaddrinfo timed out for ${hostname}`)),
          REDIS_DNS_TIMEOUT_MS
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Hostname to resolve before connecting, or null when the URL has none or is an IP literal. */
function getResolvableHostname(connectionUrl: string): string | null {
  let hostname: string
  try {
    hostname = new URL(connectionUrl).hostname
  } catch {
    return null
  }
  hostname = hostname.replace(/^\[|\]$/g, '')
  if (!hostname || isIP(hostname) !== 0) return null
  return hostname
}

/**
 * Fail before creating a socket when the host does not resolve. Bun never frees a socket whose
 * DNS lookup failed, so this keeps deleted hosts from leaking memory on every attempt.
 */
export async function assertHostnameResolves(connectionUrl: string): Promise<void> {
  const hostname = getResolvableHostname(connectionUrl)
  if (hostname) await resolveHostname(hostname)
}

/** Backoff key shared by every client and queue for one connection. */
function redisFailureKey(
  connectionId: string,
  connectionUrl: string,
  options?: RedisConnectionOptions
): string {
  return JSON.stringify([connectionId, connectionUrl, options?.allowSelfSignedCerts ?? false])
}

function assertNotBackingOff(
  failureKey: string,
  connectionId: string,
  connectionName: string | undefined
) {
  const recentFailure = recentRedisConnectionFailures.get(failureKey)
  if (recentFailure && Date.now() < recentFailure.retryAt) {
    throw toRedisUnavailableError(connectionId, connectionName, recentFailure.message)
  }
}

function markPermanentRedisFailure(failureKey: string, message: string) {
  const previous = recentRedisConnectionFailures.get(failureKey)
  recentRedisConnectionFailures.set(failureKey, {
    message,
    permanent: true,
    consecutive: previous?.consecutive ?? 0,
    retryAt: Math.max(previous?.retryAt ?? 0, Date.now() + REDIS_FAILURE_COOLDOWN_MS),
  })
}

function recordRedisConnectionFailure(failureKey: string, message: string) {
  const consecutive = (recentRedisConnectionFailures.get(failureKey)?.consecutive ?? 0) + 1
  const permanent = isPermanentRedisConnectionError(message)
  const backoffMs = Math.min(
    REDIS_FAILURE_BACKOFF_BASE_MS * 2 ** (consecutive - 1),
    REDIS_FAILURE_BACKOFF_MAX_MS
  )
  recentRedisConnectionFailures.set(failureKey, {
    message,
    permanent,
    consecutive,
    retryAt: Date.now() + (permanent ? Math.max(backoffMs, REDIS_FAILURE_COOLDOWN_MS) : backoffMs),
  })
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
  failureKey: string,
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

    const permanent = isPermanentRedisConnectionError(message)
    const previous = redisErrorCauses.get(redis)
    if (permanent || !previous || !isPermanentRedisConnectionError(previous)) {
      redisErrorCauses.set(redis, message)
    }

    if (permanent) {
      markPermanentRedisFailure(failureKey, message)
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
  const sharedCacheKey = redisFailureKey(connectionId, connectionUrl, options)
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

  // Shared and caller-owned clients back off together, so background probes and UI requests
  // cannot each keep retrying a dead host.
  assertNotBackingOff(sharedCacheKey, connectionId, connectionName)

  if (shouldCache) {
    const inFlightConnection = redisConnectionPromises.get(cacheKey)
    if (inFlightConnection) {
      return inFlightConnection
    }
  }

  const connectPromise = (async () => {
    let redis: Redis | undefined

    try {
      await assertHostnameResolves(connectionUrl)
      redis = buildRedisClient(
        connectionUrl,
        cacheKey,
        sharedCacheKey,
        connectionName ?? connectionId,
        options
      )
      await redis.connect()
      if (shouldCache) redisConnections.set(cacheKey, redis)
      recentRedisConnectionFailures.delete(sharedCacheKey)
      if (shouldCache) console.log(`✅ Connected to Redis: ${connectionName ?? connectionId}`)
      return redis
    } catch (error) {
      const message = (redis && redisErrorCauses.get(redis)) ?? getSafeRedisErrorMessage(error)
      recordRedisConnectionFailure(sharedCacheKey, message)
      if (redis) disconnectRedisClient(redis)
      throw toRedisUnavailableError(connectionId, connectionName, message)
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
 * BullMQ never reconnects a queue whose ioredis client gave up retrying, so once the connection
 * ends (or never connects) the cached queue would fail with "Connection is closed" until restart.
 * Drop it instead and count the loss as a connect failure, so the next getQueue call rebuilds it
 * after the same backoff getRedis uses rather than reconnecting to a dead host on every tick.
 */
function evictQueueWhenConnectionEnds(queue: Queue, cacheKey: string, failureKey: string) {
  const evict = (fallbackMessage: string) => {
    // Already closed for a permanent error, or replaced by a newer queue
    if (queues.get(cacheKey) !== queue) return
    queues.delete(cacheKey)
    queue.close().catch(() => {})

    // Every queue on a connection ends in the same outage; count that as one failure so the
    // backoff grows per outage rather than jumping to the maximum when many queues are cached.
    const recentFailure = recentRedisConnectionFailures.get(failureKey)
    if (!recentFailure || Date.now() >= recentFailure.retryAt) {
      recordRedisConnectionFailure(failureKey, queueErrorCauses.get(queue) ?? fallbackMessage)
    }
  }

  queue.client.then(
    (client) => {
      if (client.status === 'end') {
        evict('Connection is closed.')
        return
      }
      recentRedisConnectionFailures.delete(failureKey)
      client.once('end', () => evict('Connection is closed.'))
    },
    (error) => evict(getSafeRedisErrorMessage(error))
  )
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

  const failureKey = redisFailureKey(connectionId, connectionUrl, options)

  if (!queues.has(cacheKey)) {
    // BullMQ opens its own ioredis client, so dead hosts need the same guards as getRedis.
    assertNotBackingOff(failureKey, connectionId, undefined)
    try {
      await assertHostnameResolves(connectionUrl)
    } catch (error) {
      const message = getSafeRedisErrorMessage(error)
      recordRedisConnectionFailure(failureKey, message)
      throw toRedisUnavailableError(connectionId, undefined, message)
    }
  }

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
      queueErrorCauses.set(queue, message)

      if (shouldLogRedisError(`queue:${cacheKey}`, message)) {
        console.error(`❌ Queue connection error (${name}): ${message}`)
      }

      if (isPermanentRedisConnectionError(message)) {
        markPermanentRedisFailure(failureKey, message)
        queue.close().catch(() => {})
        queues.delete(cacheKey)
      }
    })

    queues.set(cacheKey, queue)
    evictQueueWhenConnectionEnds(queue, cacheKey, failureKey)
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

export const __redisTestUtils = {
  setHostnameResolver(resolver: (hostname: string) => Promise<void>) {
    resolveHostname = resolver
  },
}
