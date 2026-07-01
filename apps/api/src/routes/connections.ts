import {
  and,
  connectionModes,
  eq,
  getDb,
  member,
  redisConnectionRepository,
  redisDiscoveredQueueRepository,
  shouldUseEnvConnections,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { Cluster, Redis } from 'ioredis'
import { z } from 'zod'
import { buildIoRedisConnectionOptions } from '../lib/connection-options'
import { resetQueueDiscoveryState } from '../lib/queue-discovery'
import type { RedisClient } from '../lib/redis'
import { validateRedisUrlForEnvironment } from '../lib/url-validation'
import { requireOrganization } from '../middleware/auth'
import { connectionTestRateLimiter } from '../middleware/rate-limit'

async function isOrgAdmin(userId: string, organizationId: string): Promise<boolean> {
  const db = await getDb()
  const rows = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    .limit(1)
  const role = rows[0]?.role
  return role === 'owner' || role === 'admin'
}

const connectionPrefixSchema = z.string().trim().min(1)

const app = new Hono()
  // Apply organization middleware to all routes
  .use('*', requireOrganization)

  // List all available Redis connections for the organization
  .get('/', async (c) => {
    const organizationId = c.get('organizationId')!
    const dbConnections = await redisConnectionRepository.findAll(organizationId)

    // Map database connections to API response format
    const connections = dbConnections.map((conn) => ({
      id: conn.id,
      name: conn.name,
      mode: conn.mode ?? 'standalone',
      isDefault: conn.isDefault,
      environment: conn.environment,
      prefix: conn.prefix,
      allowSelfSignedCerts: conn.allowSelfSignedCerts,
    }))

    return c.json({ connections })
  })

  // Get a single connection by ID (includes sensitive URL for org admins/owners only)
  .get('/:id', async (c) => {
    const { id } = c.req.param()
    const organizationId = c.get('organizationId')!
    const user = c.get('user')

    const conn = await redisConnectionRepository.findById(id, organizationId)
    if (!conn) {
      return c.json({ error: 'Connection not found' }, 404)
    }

    const canViewSecret = user ? await isOrgAdmin(user.id, organizationId) : false

    return c.json({
      connection: {
        id: conn.id,
        name: conn.name,
        url: canViewSecret ? conn.url : null,
        mode: conn.mode ?? 'standalone',
        isDefault: conn.isDefault,
        environment: conn.environment,
        prefix: conn.prefix,
        allowSelfSignedCerts: conn.allowSelfSignedCerts,
        createdAt: conn.createdAt.toISOString(),
        updatedAt: conn.updatedAt.toISOString(),
      },
    })
  })

  // Create a new connection for the organization
  .post(
    '/',
    zValidator(
      'json',
      z.object({
        name: z.string().min(1).max(100),
        url: z.string().min(1),
        mode: z.enum(connectionModes).optional().default('standalone'),
        environment: z.enum(['development', 'staging', 'production']).optional(),
        isDefault: z.boolean().optional(),
        prefix: connectionPrefixSchema.default('bull'),
        allowSelfSignedCerts: z.boolean().optional(),
      })
    ),
    async (c) => {
      if (shouldUseEnvConnections()) {
        return c.json(
          {
            error:
              'Connection management is disabled when DURABULL_ENV_CONNECTIONS=true. Configure connections via DURABULL_REDIS_URL_* environment variables.',
          },
          403
        )
      }

      const body = c.req.valid('json')
      const organizationId = c.get('organizationId')!

      // Validate Redis URL to prevent SSRF attacks
      const validation = validateRedisUrlForEnvironment(body.url)
      if (!validation.valid) {
        return c.json({ error: validation.error ?? 'Invalid Redis URL' }, 400)
      }

      // Check if name already exists within the organization
      const existsByName = await redisConnectionRepository.existsByName(body.name, organizationId)
      if (existsByName) {
        return c.json({ error: 'A connection with this name already exists' }, 400)
      }

      // If this is set as default, we need to clear other defaults first
      if (body.isDefault) {
        const currentDefault = await redisConnectionRepository.findDefault(organizationId)
        if (currentDefault) {
          await redisConnectionRepository.update(currentDefault.id, organizationId, {
            isDefault: false,
          })
        }
      }

      const conn = await redisConnectionRepository.create({
        name: body.name,
        url: body.url,
        mode: body.mode,
        environment: body.environment ?? 'development',
        isDefault: body.isDefault ?? false,
        prefix: body.prefix,
        allowSelfSignedCerts: body.allowSelfSignedCerts ?? false,
        organizationId,
      })

      return c.json(
        {
          connection: {
            id: conn.id,
            name: conn.name,
            mode: conn.mode ?? 'standalone',
            isDefault: conn.isDefault,
            environment: conn.environment,
            prefix: conn.prefix,
            allowSelfSignedCerts: conn.allowSelfSignedCerts,
          },
        },
        201
      )
    }
  )

  // Update an existing connection
  .patch(
    '/:id',
    zValidator(
      'json',
      z.object({
        name: z.string().min(1).max(100).optional(),
        url: z.string().min(1).optional(),
        mode: z.enum(connectionModes).optional(),
        environment: z.enum(['development', 'staging', 'production']).optional(),
        isDefault: z.boolean().optional(),
        prefix: connectionPrefixSchema.optional(),
        allowSelfSignedCerts: z.boolean().optional(),
      })
    ),
    async (c) => {
      if (shouldUseEnvConnections()) {
        return c.json(
          {
            error:
              'Connection management is disabled when DURABULL_ENV_CONNECTIONS=true. Configure connections via DURABULL_REDIS_URL_* environment variables.',
          },
          403
        )
      }

      const { id } = c.req.param()
      const body = c.req.valid('json')
      const organizationId = c.get('organizationId')!

      const existing = await redisConnectionRepository.findById(id, organizationId)
      if (!existing) {
        return c.json({ error: 'Connection not found' }, 404)
      }

      // Validate Redis URL if being updated
      if (body.url) {
        const validation = validateRedisUrlForEnvironment(body.url)
        if (!validation.valid) {
          return c.json({ error: validation.error ?? 'Invalid Redis URL' }, 400)
        }
      }

      // Check if name is being changed to an existing name
      if (body.name && body.name !== existing.name) {
        const existsByName = await redisConnectionRepository.existsByName(body.name, organizationId)
        if (existsByName) {
          return c.json({ error: 'A connection with this name already exists' }, 400)
        }
      }

      // If setting as default, use the setDefault method
      if (body.isDefault === true) {
        await redisConnectionRepository.setDefault(id, organizationId)
      }

      const shouldClearDiscoveredQueues =
        (body.url !== undefined && body.url !== existing.url) ||
        (body.prefix !== undefined && body.prefix !== existing.prefix)

      // Update other fields
      const updateData: Parameters<typeof redisConnectionRepository.update>[2] = {}
      if (body.name !== undefined) updateData.name = body.name
      if (body.url !== undefined) updateData.url = body.url
      if (body.mode !== undefined) updateData.mode = body.mode
      if (body.environment !== undefined) updateData.environment = body.environment
      if (body.isDefault === false) updateData.isDefault = false
      if (body.prefix !== undefined) updateData.prefix = body.prefix
      if (body.allowSelfSignedCerts !== undefined) {
        updateData.allowSelfSignedCerts = body.allowSelfSignedCerts
      }

      const conn = await redisConnectionRepository.update(id, organizationId, updateData)
      if (!conn) {
        return c.json({ error: 'Failed to update connection' }, 500)
      }

      if (shouldClearDiscoveredQueues) {
        await redisDiscoveredQueueRepository.deleteByConnection(id)
        resetQueueDiscoveryState(id)
      }

      return c.json({
        connection: {
          id: conn.id,
          name: conn.name,
          mode: conn.mode ?? 'standalone',
          isDefault: conn.isDefault,
          environment: conn.environment,
          prefix: conn.prefix,
          allowSelfSignedCerts: conn.allowSelfSignedCerts,
        },
      })
    }
  )

  // Delete a connection
  .delete('/:id', async (c) => {
    if (shouldUseEnvConnections()) {
      return c.json(
        {
          error:
            'Connection management is disabled when DURABULL_ENV_CONNECTIONS=true. Configure connections via DURABULL_REDIS_URL_* environment variables.',
        },
        403
      )
    }

    const { id } = c.req.param()
    const organizationId = c.get('organizationId')!

    const existing = await redisConnectionRepository.findById(id, organizationId)
    if (!existing) {
      return c.json({ error: 'Connection not found' }, 404)
    }

    // If deleting the default connection, make the first remaining one default
    if (existing.isDefault) {
      const allConnections = await redisConnectionRepository.findAll(organizationId)
      const nextDefault = allConnections.find((conn) => conn.id !== id)
      if (nextDefault) {
        await redisConnectionRepository.setDefault(nextDefault.id, organizationId)
      }
    }

    const deleted = await redisConnectionRepository.delete(id, organizationId)
    if (!deleted) {
      return c.json({ error: 'Failed to delete connection' }, 500)
    }

    return c.json({ success: true, deleted: id })
  })

  // Test a connection URL
  // Rate limited to prevent SSRF scanning attacks
  .post(
    '/test',
    connectionTestRateLimiter,
    zValidator(
      'json',
      z.object({
        url: z.string().min(1),
        allowSelfSignedCerts: z.boolean().optional(),
        mode: z.enum(connectionModes).optional().default('standalone'),
      })
    ),
    async (c) => {
      const { url, allowSelfSignedCerts, mode } = c.req.valid('json')

      // Validate URL to prevent SSRF attacks
      const validation = validateRedisUrlForEnvironment(url)
      if (!validation.valid) {
        return c.json(
          {
            success: false,
            message: validation.error ?? 'Invalid Redis URL',
          },
          400
        )
      }

      const startTime = Date.now()
      let client: RedisClient | null = null

      try {
        if (mode === 'cluster') {
          const parsed = new URL(url)
          const clusterHost = parsed.hostname
          const clusterPort = parsed.port ? parseInt(parsed.port, 10) : 6379
          const isTunneled =
            clusterHost === 'localhost' || clusterHost === '127.0.0.1' || clusterHost === '::1'
          client = new Cluster([{ host: clusterHost, port: clusterPort }], {
            lazyConnect: true,
            redisOptions: {
              connectTimeout: 5000,
              maxRetriesPerRequest: 1,
              ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
              ...(parsed.username && parsed.username !== 'default'
                ? { username: decodeURIComponent(parsed.username) }
                : {}),
              ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
              ...buildIoRedisConnectionOptions({ allowSelfSignedCerts }),
            },
            ...(isTunneled
              ? {
                  natMap: () => ({ host: clusterHost, port: clusterPort }),
                  scaleReads: 'master' as const,
                }
              : {}),
          })
        } else {
          client = new Redis(url, {
            connectTimeout: 5000,
            maxRetriesPerRequest: 1,
            lazyConnect: true,
            ...buildIoRedisConnectionOptions({ allowSelfSignedCerts }),
          })
        }

        await client.connect()
        await client.ping()

        const latencyMs = Date.now() - startTime

        return c.json({
          success: true,
          message: 'Connection successful',
          latencyMs,
        })
      } catch (error) {
        // Sanitize error messages in production to avoid information leakage
        const errorMessage =
          env.NODE_ENV === 'production'
            ? 'Connection failed. Please verify your Redis URL and credentials.'
            : error instanceof Error
              ? error.message
              : 'Connection failed'

        return c.json(
          {
            success: false,
            message: errorMessage,
          },
          400
        )
      } finally {
        if (client) {
          await client.quit().catch(() => {})
        }
      }
    }
  )

export default app
