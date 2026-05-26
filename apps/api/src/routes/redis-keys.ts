import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { Cluster } from 'ioredis'
import { z } from 'zod'
import { getConnectionRedisOptions } from '../lib/connection-options'
import { getRedis, type RedisClient } from '../lib/redis'

/**
 * Cluster-aware SCAN: scans all master nodes in a cluster, or uses standard SCAN for standalone.
 * For cluster mode, uses offset-based pagination (cursor is `cluster:<offset>` or '0' for start).
 * For standalone, uses native Redis SCAN cursor.
 */
async function clusterAwareScan(
  client: RedisClient,
  cursor: string,
  pattern: string,
  count: number
): Promise<[string, string[]]> {
  if (client instanceof Cluster) {
    // Full scan across all master nodes
    const masters = client.nodes('master')
    const allKeys: string[] = []
    for (const master of masters) {
      let nodeCursor = '0'
      do {
        const [next, keys] = await master.scan(nodeCursor, 'MATCH', pattern, 'COUNT', count)
        nodeCursor = next
        allKeys.push(...keys)
      } while (nodeCursor !== '0')
    }

    // Offset-based pagination over the full result set
    const offset = cursor.startsWith('cluster:') ? Number.parseInt(cursor.slice(8), 10) : 0
    const page = allKeys.slice(offset, offset + count)
    const nextOffset = offset + page.length
    const nextCursor = nextOffset < allKeys.length ? `cluster:${nextOffset}` : '0'
    return [nextCursor, page]
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
