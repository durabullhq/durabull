import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { Cluster } from 'ioredis'
import { z } from 'zod'
import { getConnectionRedisOptions } from '../lib/connection-options'
import { getRedis, type RedisClient } from '../lib/redis'

/**
 * Cursor state for cluster SCAN pagination. Encodes the current master being
 * scanned and per-master Redis SCAN cursors so each page picks up where the
 * previous one left off — without re-scanning the whole cluster.
 */
interface ClusterScanState {
  /** Index of the master currently being scanned in the cluster.nodes('master') list */
  i: number
  /** Per-master SCAN cursors, parallel to cluster.nodes('master') */
  c: string[]
}

const CLUSTER_CURSOR_PREFIX = 'cluster:'

function encodeClusterCursor(state: ClusterScanState): string {
  return `${CLUSTER_CURSOR_PREFIX}${Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')}`
}

function decodeClusterCursor(cursor: string, masterCount: number): ClusterScanState {
  if (!cursor.startsWith(CLUSTER_CURSOR_PREFIX) || cursor === '0') {
    return { i: 0, c: new Array(masterCount).fill('0') }
  }
  try {
    const decoded = Buffer.from(cursor.slice(CLUSTER_CURSOR_PREFIX.length), 'base64url').toString(
      'utf8'
    )
    const parsed = JSON.parse(decoded) as ClusterScanState
    // Defensive: pad/trim per-master cursors if cluster topology shifted between calls
    const cursors = Array.isArray(parsed.c) ? parsed.c.slice(0, masterCount) : []
    while (cursors.length < masterCount) cursors.push('0')
    return {
      i: Math.max(0, Math.min(parsed.i ?? 0, masterCount)),
      c: cursors,
    }
  } catch {
    return { i: 0, c: new Array(masterCount).fill('0') }
  }
}

/**
 * Cluster-aware SCAN: scans all master nodes in a cluster, or uses standard SCAN for standalone.
 * For cluster mode, returns an encoded cursor that contains per-master SCAN cursors and the
 * current node index, so successive calls resume where the previous page left off instead of
 * re-scanning the entire cluster each page.
 */
async function clusterAwareScan(
  client: RedisClient,
  cursor: string,
  pattern: string,
  count: number
): Promise<[string, string[]]> {
  if (client instanceof Cluster) {
    const masters = client.nodes('master')
    if (masters.length === 0) return ['0', []]

    const state = decodeClusterCursor(cursor, masters.length)
    const collected: string[] = []

    // Advance through masters, scanning each incrementally until we have enough keys
    // or all masters are exhausted.
    while (state.i < masters.length && collected.length < count) {
      const master = masters[state.i]
      const nodeCursor = state.c[state.i] ?? '0'
      const [next, keys] = await master.scan(nodeCursor, 'MATCH', pattern, 'COUNT', count)
      state.c[state.i] = next
      collected.push(...keys)

      if (next === '0') {
        // This master is exhausted, move to the next one
        state.i += 1
      }
    }

    const allDone = state.i >= masters.length
    const nextCursor = allDone ? '0' : encodeClusterCursor(state)
    return [nextCursor, collected]
  }
  return client.scan(cursor, 'MATCH', pattern, 'COUNT', count)
}

/**
 * Cluster-aware DBSIZE: sums dbsize across all master nodes for cluster mode.
 */
async function clusterAwareDbSize(client: RedisClient): Promise<number> {
  if (client instanceof Cluster) {
    const masters = client.nodes('master')
    let total = 0
    for (const master of masters) {
      total += await master.dbsize()
    }
    return total
  }
  return client.dbsize()
}

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

// Redis data types
type RedisDataType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'none' | 'unknown'

// Helper to check if a key is a BullMQ-managed key
function isBullKey(key: string): boolean {
  return key.startsWith('bull:') || key.startsWith('bullmq:')
}

const app = new Hono()
  // Search Redis keys with pattern matching
  .get(
    '/search',
    zValidator(
      'query',
      z.object({
        pattern: z.string().optional().default('*'),
        cursor: z.string().optional().default('0'),
        pageSize: z.coerce.number().min(1).max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
        excludeBull: z
          .string()
          .optional()
          .transform((val) => val === 'true'),
      })
    ),
    async (c) => {
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const redisOptions = getConnectionRedisOptions(c)
      const connectionMode = c.get('connectionMode')
      const { pattern, cursor, pageSize, excludeBull } = c.req.valid('query')

      const redis = await getRedis(
        connectionId,
        connectionUrl,
        undefined,
        redisOptions,
        connectionMode
      )

      // Use SCAN for efficient key discovery
      // When excluding bull keys, we need to scan more to get enough non-bull keys
      const scanCount = excludeBull ? pageSize * 4 : pageSize * 2
      const [nextCursor, rawKeys] = await clusterAwareScan(redis, cursor, pattern, scanCount)

      // Filter out bull keys if requested
      const filteredKeys = excludeBull ? rawKeys.filter((key) => !isBullKey(key)) : rawKeys

      // Get key info for each key (type, TTL)
      const keyInfoPromises = filteredKeys.slice(0, pageSize).map(async (key) => {
        const [type, ttl] = await Promise.all([redis.type(key), redis.ttl(key)])

        // Try to get memory usage (may not be available in all Redis versions)
        let memoryBytes: number | undefined
        try {
          const memory = await redis.memory('USAGE', key)
          memoryBytes = memory ?? undefined
        } catch {
          // Memory command not available
        }

        return {
          key,
          type: type as RedisDataType,
          ttl,
          memoryBytes,
        }
      })

      const keys = await Promise.all(keyInfoPromises)

      // Try to get approximate total count
      let total: number | undefined
      try {
        total = await clusterAwareDbSize(redis)
      } catch {
        // DBSIZE not available
      }

      return c.json({
        keys,
        cursor: nextCursor,
        hasMore: nextCursor !== '0',
        total,
      })
    }
  )

  // Get value for a specific key
  .get(
    '/value/:key',
    zValidator(
      'param',
      z.object({
        key: z.string(),
      })
    ),
    zValidator(
      'query',
      z.object({
        // For collections, optionally limit the number of items returned
        limit: z.coerce.number().min(1).max(1000).optional().default(100),
        offset: z.coerce.number().min(0).optional().default(0),
      })
    ),
    async (c) => {
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const redisOptions = getConnectionRedisOptions(c)
      const connectionMode = c.get('connectionMode')
      const { key } = c.req.valid('param')
      const { limit, offset } = c.req.valid('query')

      // URL decode the key since it might contain special characters
      const decodedKey = decodeURIComponent(key)

      const redis = await getRedis(
        connectionId,
        connectionUrl,
        undefined,
        redisOptions,
        connectionMode
      )

      // Get key type and TTL
      const [type, ttl] = await Promise.all([redis.type(decodedKey), redis.ttl(decodedKey)])

      if (type === 'none') {
        return c.json({ error: 'Key not found' }, 404)
      }

      // Get memory usage
      let memoryBytes: number | undefined
      try {
        const memory = await redis.memory('USAGE', decodedKey)
        memoryBytes = memory ?? undefined
      } catch {
        // Memory command not available
      }

      let value: unknown
      let length: number | undefined

      // Fetch value based on type
      switch (type) {
        case 'string': {
          value = await redis.get(decodedKey)
          // Try to parse as JSON
          if (typeof value === 'string') {
            try {
              value = JSON.parse(value)
            } catch {
              // Keep as string
            }
          }
          break
        }

        case 'hash': {
          const hashValues = await redis.hgetall(decodedKey)
          // Parse JSON values in hash
          const parsedHash: Record<string, unknown> = {}
          for (const [field, fieldValue] of Object.entries(hashValues)) {
            try {
              parsedHash[field] = JSON.parse(fieldValue)
            } catch {
              parsedHash[field] = fieldValue
            }
          }
          value = parsedHash
          length = Object.keys(hashValues).length
          break
        }

        case 'list': {
          length = await redis.llen(decodedKey)
          const items = await redis.lrange(decodedKey, offset, offset + limit - 1)
          // Try to parse JSON items
          value = items.map((item) => {
            try {
              return JSON.parse(item)
            } catch {
              return item
            }
          })
          break
        }

        case 'set': {
          length = await redis.scard(decodedKey)
          const members = await redis.sscan(decodedKey, 0, 'COUNT', limit)
          value = members[1].map((item) => {
            try {
              return JSON.parse(item)
            } catch {
              return item
            }
          })
          break
        }

        case 'zset': {
          length = await redis.zcard(decodedKey)
          const zsetItems = await redis.zrange(decodedKey, offset, offset + limit - 1, 'WITHSCORES')
          // Parse zset items (returns [member, score, member, score, ...])
          const parsed: Array<{ member: unknown; score: number }> = []
          for (let i = 0; i < zsetItems.length; i += 2) {
            const member = zsetItems[i]
            const score = parseFloat(zsetItems[i + 1])
            let parsedMember: unknown
            try {
              parsedMember = JSON.parse(member)
            } catch {
              parsedMember = member
            }
            parsed.push({ member: parsedMember, score })
          }
          value = parsed
          break
        }

        case 'stream': {
          // Get stream info
          const streamInfo = await redis.xinfo('STREAM', decodedKey)
          // Get recent entries
          const entries = await redis.xrange(decodedKey, '-', '+', 'COUNT', limit)
          value = {
            info: streamInfo,
            entries: entries.map(([id, fields]) => ({
              id,
              fields: Object.fromEntries(
                fields.reduce((acc: Array<[string, string]>, curr, idx, arr) => {
                  if (idx % 2 === 0) {
                    acc.push([curr, arr[idx + 1]])
                  }
                  return acc
                }, [])
              ),
            })),
          }
          length = await redis.xlen(decodedKey)
          break
        }

        default: {
          value = `Unsupported type: ${type}`
        }
      }

      return c.json({
        key: decodedKey,
        type: type as RedisDataType,
        value,
        ttl,
        memoryBytes,
        length,
      })
    }
  )

  // Delete a key
  .delete(
    '/:key',
    zValidator(
      'param',
      z.object({
        key: z.string(),
      })
    ),
    async (c) => {
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const redisOptions = getConnectionRedisOptions(c)
      const connectionMode = c.get('connectionMode')
      const { key } = c.req.valid('param')
      const decodedKey = decodeURIComponent(key)

      // Prevent deletion of BullMQ-managed keys
      if (isBullKey(decodedKey)) {
        return c.json(
          {
            error: 'Cannot delete BullMQ keys',
            message:
              'Bull-related keys must be managed through their respective queues. Use Durabull to manage jobs and queue data.',
          },
          403
        )
      }

      const redis = await getRedis(
        connectionId,
        connectionUrl,
        undefined,
        redisOptions,
        connectionMode
      )
      const deleted = await redis.del(decodedKey)

      return c.json({ success: deleted > 0, deleted })
    }
  )

export default app
