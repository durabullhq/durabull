import type { Auth } from '@durabull/auth'
import {
  type ConnectionMode,
  redisConnectionRepository,
  shouldUseEnvConnections,
} from '@durabull/dal'
import type { Session } from 'better-auth/types'
import { createMiddleware } from 'hono/factory'
import { getAuthlessContext, isAuthlessMode } from '../lib/authless'

// Extend Hono's context to include the connection info
declare module 'hono' {
  interface ContextVariableMap {
    connectionId: string
    connectionUrl: string
    connectionName: string
    connectionPrefix: string
    connectionAllowSelfSignedCerts: boolean
    connectionMode: ConnectionMode
  }
}

// Extended session type that includes organization plugin fields
interface SessionWithOrg extends Session {
  activeOrganizationId?: string | null
}

/**
 * Creates a connection middleware that:
 * 1. Validates the user is authenticated (via Better Auth session)
 * 2. Validates the user has an active organization
 * 3. Extracts the connection ID from the URL path parameter
 * 4. Validates the connection exists and belongs to the user's organization
 *
 * This middleware INCLUDES session handling - you don't need to apply
 * sessionMiddleware separately for connection routes.
 *
 * Makes the connection info available via:
 * - c.get('connectionId')
 * - c.get('connectionUrl')
 * - c.get('connectionName')
 *
 * Expected URL format: /api/c/:connectionId/...
 */
export function createConnectionMiddleware(auth?: Auth) {
  return createMiddleware(async (c, next) => {
    if (isAuthlessMode()) {
      const context = await getAuthlessContext()
      c.set('user', context.user)
      c.set('session', context.session)
      c.set('organizationId', context.organization.id)
      c.set('organization', context.organization)
    } else {
      if (!auth) {
        return c.json(
          {
            error: 'Service Unavailable',
            message: 'Authentication service is not configured.',
          },
          503
        )
      }

      // Step 1: Get and validate session
      const session = await auth.api.getSession({ headers: c.req.raw.headers })

      if (!session) {
        return c.json(
          {
            error: 'Unauthorized',
            message: 'You must be logged in to access this resource',
          },
          401
        )
      }

      // Set session info in context
      const sessionWithOrg = session.session as SessionWithOrg
      const organizationId = sessionWithOrg.activeOrganizationId ?? null

      c.set('user', session.user)
      c.set('session', sessionWithOrg)
      c.set('organizationId', organizationId)
      c.set('organization', null)
    }

    const organizationId = c.get('organizationId')

    // Step 2: Require active organization
    if (!organizationId) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'You must have an active organization to access connections.',
        },
        403
      )
    }

    // Step 3: Get and validate connection ID from URL
    const connectionId = c.req.param('connectionId')

    if (!connectionId) {
      return c.json(
        {
          error: 'Missing connection ID',
          message:
            'Connection ID is required in the URL path. Use GET /api/connections to see available connections.',
        },
        400
      )
    }

    // Step 4: Validate connection belongs to organization
    const connection = await redisConnectionRepository.findById(connectionId, organizationId)

    if (!connection) {
      if (shouldUseEnvConnections()) {
        return c.json(
          {
            error: 'Invalid Redis connection',
            message: `Connection '${connectionId}' not found. Use GET /api/connections to see available connections.`,
          },
          404
        )
      }

      // Check if the connection exists at all (for better error messages)
      const connectionExists = await redisConnectionRepository.findByIdUnsafe(connectionId)

      if (connectionExists) {
        // Connection exists but doesn't belong to this organization
        return c.json(
          {
            error: 'Forbidden',
            message: 'You do not have access to this connection.',
          },
          403
        )
      }

      return c.json(
        {
          error: 'Invalid Redis connection',
          message: `Connection '${connectionId}' not found. Use GET /api/connections to see available connections.`,
        },
        404
      )
    }

    // Set connection info in context
    c.set('connectionId', connection.id)
    c.set('connectionUrl', connection.url)
    c.set('connectionName', connection.name)
    c.set('connectionPrefix', connection.prefix ?? 'bull')
    c.set('connectionAllowSelfSignedCerts', connection.allowSelfSignedCerts ?? false)
    c.set('connectionMode', connection.mode ?? 'standalone')

    await next()
  })
}
