import type { ConnectionMode } from '@durabull/dal'
import { Queue } from 'bullmq'
import { Cluster, Redis } from 'ioredis'
import { buildIoRedisConnectionOptions, type RedisConnectionOptions } from './connection-options'

export type { RedisConnectionOptions } from './connection-options'
export type RedisClient = Redis | Cluster

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

// Cache for Redis connections keyed by (connectionId, url, allowSelfSignedCerts, mode)
const redisConnections = new Map<string, RedisClient>()
// Cache in-flight connection attempts to prevent creating duplicate clients concurrently
const redisConnectionPromises = new Map<string, Promise<RedisClient>>()
// Cache recent failures to avoid hot-looping permanent connection/auth issues
const recentRedisConnectionFailures = new Map<
  string,
  { message: string; at: number; permanent: boolean }
>()
// Cache recent log lines to dedupe noisy repeated errors
const recentRedisErrorLogs = new Map<string, { message: string; at: number }>()
// Cache for queues keyed by (connectionId, url, prefix, name, allowSelfSignedCerts, mode)
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

function disconnectRedisClient(client: RedisClient) {
  try {
    client.disconnect(false)
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

/**
 * Parse a Redis URL into host and port for cluster startup nodes.
 * Returns extra ioredis options derived from the URL (auth, TLS).
 */
function parseRedisUrl(url: string): {
  host: string
  port: number
  redisOptions: Record<string, unknown>
} {
  const parsed = new URL(url)
  const host = parsed.hostname
  const port = parsed.port ? parseInt(parsed.port, 10) : 6379
  const redisOptions: Record<string, unknown> = {}

  if (parsed.password) {
    redisOptions.password = decodeURIComponent(parsed.password)
  }
  if (parsed.username && parsed.username !== 'default') {
    redisOptions.username = decodeURIComponent(parsed.username)
  }
  if (parsed.protocol === 'rediss:') {
    redisOptions.tls = {}
  }

  return { host, port, redisOptions }
}

function attachClientErrorHandlers(client: RedisClient, cacheKey: string, label: string) {
  const modeLabel = client instanceof Cluster ? 'Redis Cluster' : 'Redis'

  client.on('error', (error) => {
    const message = getSafeRedisErrorMessage(error)

    if (shouldLogRedisError(cacheKey, message)) {
      console.error(`❌ ${modeLabel} error (${label}): ${message}`)
    }

    if (isPermanentRedisConnectionError(message)) {
      recentRedisConnectionFailures.set(cacheKey, {
        message,
        at: Date.now(),
        permanent: true,
      })
      disconnectRedisClient(client)
    }
  })

  client.on('end', () => {
    redisConnections.delete(cacheKey)
  })
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

  attachClientErrorHandlers(redis, cacheKey, label)
  return redis
}

function buildClusterClient(
  connectionUrl: string,
  cacheKey: string,
  label: string,
  options?: RedisConnectionOptions
): Cluster {
  const { host, port, redisOptions: urlOptions } = parseRedisUrl(connectionUrl)
  const tlsOptions = buildIoRedisConnectionOptions(options)

  // Merge TLS settings: rediss:// gives `tls: {}`, self-signed opt-in adds
  // `tls: { rejectUnauthorized: false }`. The opt-in takes precedence.
  const mergedRedisOptions: Record<string, unknown> = { ...urlOptions }
  if (tlsOptions.tls) {
    mergedRedisOptions.tls = { ...(urlOptions.tls as object | undefined), ...tlsOptions.tls }
  }

  // When connecting through a tunnel (localhost/127.0.0.1), cluster nodes report their
  // internal IPs in CLUSTER SLOTS which aren't reachable. Use natMap to redirect all
  // discovered nodes back through the tunnel endpoint.
  const isTunneled = host === 'localhost' || host === '127.0.0.1' || host === '::1'

  const cluster = new Cluster([{ host, port }], {
    lazyConnect: true,
    redisOptions: {
      maxRetriesPerRequest: null,
      ...mergedRedisOptions,
    },
    clusterRetryStrategy: (attempts) => {
      if (attempts > REDIS_MAX_RECONNECT_ATTEMPTS) return null
      return Math.min(attempts * REDIS_RECONNECT_BASE_DELAY_MS, REDIS_RECONNECT_MAX_DELAY_MS)
    },
    ...(isTunneled
      ? {
          natMap: () => ({ host, port }),
          scaleReads: 'master' as const,
        }
      : {}),
  })

  attachClientErrorHandlers(cluster, cacheKey, label)
  return cluster
}

function makeConnectionCacheKey(
  connectionId: string,
  connectionUrl: string,
  options: RedisConnectionOptions | undefined,
  mode: ConnectionMode
): string {
  return JSON.stringify([connectionId, connectionUrl, options?.allowSelfSignedCerts ?? false, mode])
}

/**
 * Scan all master nodes of a cluster for keys matching the pattern.
 */
async function scanAllClusterNodes(
  cluster: Cluster,
  pattern: string,
  count: number
): Promise<string[]> {
  const masters = cluster.nodes('master')
  const allKeys: string[] = []
  for (const master of masters) {
    let cursor = '0'
    do {
      const [next, keys] = await master.scan(cursor, 'MATCH', pattern, 'COUNT', count)
      cursor = next
      allKeys.push(...keys)
    } while (cursor !== '0')
  }
  return allKeys
}

/**
 * Get or create a Redis connection for the given connection ID and URL.
 * Pass mode='cluster' to connect via Redis Cluster.
 */
export async function getRedis(
  connectionId: string,
  connectionUrl: string,
  connectionName?: string,
  options?: RedisConnectionOptions,
  mode: ConnectionMode = 'standalone'
): Promise<RedisClient> {
  const cacheKey = makeConnectionCacheKey(connectionId, connectionUrl, options, mode)
  const existingConnection = redisConnections.get(cacheKey)
  if (existingConnection) {
    if (existingConnection.status !== 'end') {
      return existingConnection
    }
    redisConnections.delete(cacheKey)
  }

  const recentFailure = recentRedisConnectionFailures.get(cacheKey)
  if (recentFailure) {
    const elapsed = Date.now() - recentFailure.at
    if (recentFailure.permanent && elapsed < REDIS_FAILURE_COOLDOWN_MS) {
      throw toRedisUnavailableError(connectionId, connectionName, recentFailure.message)
    }
    recentRedisConnectionFailures.delete(cacheKey)
  }

  const inFlightConnection = redisConnectionPromises.get(cacheKey)
  if (inFlightConnection) {
    return inFlightConnection
  }

  const connectPromise = (async () => {
    const label = connectionName ?? connectionId
    const client =
      mode === 'cluster'
        ? buildClusterClient(connectionUrl, cacheKey, label, options)
        : buildRedisClient(connectionUrl, cacheKey, label, options)

    try {
      await client.connect()
      redisConnections.set(cacheKey, client)
      recentRedisConnectionFailures.delete(cacheKey)
      const modeLabel = mode === 'cluster' ? 'Redis Cluster' : 'Redis'
      console.log(`✅ Connected to ${modeLabel}: ${label}`)
      return client
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
      disconnectRedisClient(client)
      throw toRedisUnavailableError(connectionId, connectionName, failureMessage)
    } finally {
      redisConnectionPromises.delete(cacheKey)
    }
  })()

  redisConnectionPromises.set(cacheKey, connectPromise)
  return connectPromise
}

/**
 * Discover queues for a specific Redis connection.
 */
export async function discoverQueues(
  connectionId: string,
  connectionUrl: string,
  prefix = 'bull',
  options?: RedisConnectionOptions,
  mode: ConnectionMode = 'standalone'
): Promise<Array<string>> {
  const queueNames = new Set<string>()

  if (mode === 'cluster') {
    const client = (await getRedis(
      connectionId,
      connectionUrl,
      undefined,
      options,
      mode
    )) as Cluster
    const escapedPrefix = prefix.replace(/[\\*?[\]]/g, '\\$&')
    const keys = await scanAllClusterNodes(
      client,
      `${escapedPrefix}:*:meta`,
      DEFAULT_QUEUE_SCAN_COUNT
    )
    for (const key of keys) {
      const queueName = extractQueueNameFromMetaKey(key)
      if (queueName) queueNames.add(queueName)
    }
    return Array.from(queueNames)
  }

  let cursor = '0'
  do {
    const page = await scanQueuesPage(
      connectionId,
      connectionUrl,
      cursor,
      DEFAULT_QUEUE_SCAN_COUNT,
      prefix,
      options,
      mode
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
  options?: RedisConnectionOptions,
  mode: ConnectionMode = 'standalone'
): Promise<QueueScanPage> {
  const redisClient = await getRedis(connectionId, connectionUrl, undefined, options, mode)
  const scanCount = Math.max(100, count)
  const escapedPrefix = prefix.replace(/[\\*?[\]]/g, '\\$&')

  if (redisClient instanceof Cluster) {
    // For cluster mode, scan all master nodes in one go
    const keys = await scanAllClusterNodes(redisClient, `${escapedPrefix}:*:meta`, scanCount)
    const queueNames = new Set<string>()
    for (const key of keys) {
      const queueName = extractQueueNameFromMetaKey(key)
      if (queueName) queueNames.add(queueName)
    }
    return { cursor: '0', queueNames: Array.from(queueNames) }
  }

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
  options?: RedisConnectionOptions,
  mode: ConnectionMode = 'standalone'
): Promise<string[]> {
  const redisClient = await getRedis(connectionId, connectionUrl, undefined, options, mode)
  const escapedPrefix = prefix.replace(/[\\*?[\]]/g, '\\$&')

  if (redisClient instanceof Cluster) {
    const keys = await scanAllClusterNodes(redisClient, `${escapedPrefix}:*`, 100)
    return keys.sort()
  }

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
  options?: RedisConnectionOptions,
  mode: ConnectionMode = 'standalone'
): Promise<Queue> {
  const cacheKey = JSON.stringify([
    connectionId,
    connectionUrl,
    prefix,
    name,
    options?.allowSelfSignedCerts ?? false,
    mode,
  ])

  if (!queues.has(cacheKey)) {
    let queue: Queue

    if (mode === 'cluster') {
      // For cluster mode, pass the cluster client instance directly to BullMQ
      const client = await getRedis(connectionId, connectionUrl, undefined, options, mode)
      queue = new Queue(name, { connection: client, prefix })
    } else {
      queue = new Queue(name, {
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
    }

    queue.on('error', (error) => {
      const message = getSafeRedisErrorMessage(error)

      if (shouldLogRedisError(`queue:${cacheKey}`, message)) {
        console.error(`❌ Queue connection error (${name}): ${message}`)
      }

      if (isPermanentRedisConnectionError(message)) {
        recentRedisConnectionFailures.set(
          makeConnectionCacheKey(connectionId, connectionUrl, options, mode),
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
