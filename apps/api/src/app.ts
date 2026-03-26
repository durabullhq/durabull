import { getDatabaseMode, getDb, shouldUseEnvConnections, user } from '@durabull/dal'
import { env } from '@durabull/env'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'

import { getAuth } from './lib/auth'
import { isAuthlessMode } from './lib/authless'
import { RedisUnavailableError } from './lib/redis'
import { createSessionMiddleware } from './middleware/auth'
import { createConnectionMiddleware } from './middleware/connection'
import { apiRateLimiter, authRateLimiter } from './middleware/rate-limit'
import authRoutes from './routes/auth'
import alertsGlobalRoutes from './routes/alerts-global'
import alertsRoutes from './routes/alerts'
import connectionsRoutes from './routes/connections'
import invitationsRoutes from './routes/invitations'
import jobsRoutes from './routes/jobs'
import metricsRoutes from './routes/metrics'
import queuesRoutes from './routes/queues'
import redisKeysRoutes from './routes/redis-keys'
import scheduledJobsRoutes from './routes/scheduled-jobs'
import teamRoutes from './routes/team'
import userSettingsRoutes from './routes/user-settings'
import workersRoutes from './routes/workers'

const DEFAULT_POSTHOG_API_HOST = 'https://us.i.posthog.com'
const DEFAULT_POSTHOG_UI_HOST = 'https://us.posthog.com'
const REDIS_CONNECTION_ERROR_MESSAGE =
  'Unable to connect to Redis for this connection. Verify Redis URL, credentials, TLS settings, and IP allowlist, then retry.'

function getPosthogApiHost(): string {
  const rawHost = env.POSTHOG_HOST?.trim()
  if (!rawHost) return DEFAULT_POSTHOG_API_HOST

  const hostWithProtocol = /^https?:\/\//i.test(rawHost) ? rawHost : `https://${rawHost}`

  try {
    const parsedHost = new URL(hostWithProtocol)
    let appBaseUrl: URL | null = null
    if (env.APP_BASE_URL) {
      try {
        appBaseUrl = new URL(env.APP_BASE_URL)
      } catch {
        appBaseUrl = null
      }
    }
    const pointsToAppHost = appBaseUrl ? parsedHost.host === appBaseUrl.host : false
    const pointsToProxyPath =
      parsedHost.pathname === '/ingest' || parsedHost.pathname.startsWith('/ingest/')

    if (pointsToAppHost || pointsToProxyPath) {
      console.warn(
        `[PostHog] POSTHOG_HOST "${rawHost}" points to this app/proxy. Falling back to ${DEFAULT_POSTHOG_API_HOST}`
      )
      return DEFAULT_POSTHOG_API_HOST
    }

    return `${parsedHost.origin}${parsedHost.pathname.replace(/\/$/, '')}`
  } catch {
    console.warn(
      `[PostHog] Invalid POSTHOG_HOST "${rawHost}", falling back to ${DEFAULT_POSTHOG_API_HOST}`
    )
    return DEFAULT_POSTHOG_API_HOST
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string') return error
  return String(error)
}

function redactSensitiveErrorData(message: string): string {
  return message
    .replace(/(redis(?:s)?:\/\/)([^@/\s]+)@/gi, '$1[REDACTED]@')
    .replace(/(args:\s*\[[^\]]*?"[^"]*?",\s*")[^"]*(")/gi, '$1[REDACTED]$2')
}

function isRedisConnectionError(error: unknown): boolean {
  if (error instanceof RedisUnavailableError) {
    return true
  }

  const message = normalizeErrorMessage(error).toLowerCase()
  if (message.includes('failed to decrypt redis connection url')) {
    return false
  }

  return [
    'failed to connect to redis',
    'unable to connect to redis',
    'redis connection failed recently',
    'client ip address is not in the allowlist',
    'invalid username-password pair',
    'authentication failed',
    'wrongpass',
    'noauth',
    'econnrefused',
    'enotfound',
    'etimedout',
  ].some((indicator) => message.includes(indicator))
}

/**
 * Options for creating the API app
 */
export interface CreateApiAppOptions {
  /**
   * Whether to enable request logging (default: true)
   */
  enableLogging?: boolean
  /**
   * CORS origins to allow (default: common dev/prod origins)
   */
  corsOrigins?: string[]
}

function getAppConfig() {
  const persistence = getDatabaseMode()
  const posthogKey = env.POSTHOG_KEY ?? null

  return {
    authless: isAuthlessMode(),
    envConnections: shouldUseEnvConnections(),
    persistence,
    stateless: persistence === 'pglite',
    environment: env.NODE_ENV ?? 'development',
    posthog: {
      enabled: !!posthogKey,
      key: posthogKey,
      host: '/ingest',
      uiHost: DEFAULT_POSTHOG_UI_HOST,
    },
  }
}

function getAppMode() {
  const config = getAppConfig()
  return {
    authless: config.authless,
    envConnections: config.envConnections,
    persistence: config.persistence,
  }
}

async function touchUserLastSignIn(userId: string | undefined) {
  if (!userId || isAuthlessMode()) return

  try {
    const db = await getDb()
    await db.update(user).set({ lastSignInAt: new Date() }).where(eq(user.id, userId))
  } catch (error) {
    console.error('[app/config] Failed to update last_sign_in_at:', error)
  }
}

/**
 * Define the API routes structure for type inference
 * This chains all routes to preserve types for Hono RPC
 */
const apiRoutes = new Hono()
  // Auth routes - Better Auth handles all /auth/* requests (no session middleware needed)
  .route('/auth', authRoutes)
  // Public invitations route - allows fetching invite details without auth
  .route('/invitations', invitationsRoutes)
  // Health check (no auth needed)
  .get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))
  // App bootstrap config for the web client
  .get('/app/config', (c) => c.json(getAppConfig()))
  // Backward-compatible app mode subset
  .get('/mode', (c) => c.json(getAppMode()))
  // Session endpoint - middleware applied at runtime, types inferred here
  .get('/session', (c) => {
    const user = c.get('user')
    const session = c.get('session')
    const organization = c.get('organization')
    return c.json({ user, session, organization })
  })
  // Connections endpoint
  .route('/connections', connectionsRoutes)
  .route('/team', teamRoutes)
  // User settings
  .route('/user-settings', userSettingsRoutes)
  .route('/alerts', alertsGlobalRoutes)
  // Connected routes under /c/:connectionId
  .route('/c/:connectionId/alerts', alertsRoutes)
  .route('/c/:connectionId/queues', queuesRoutes)
  .route('/c/:connectionId/queues', jobsRoutes)
  .route('/c/:connectionId/scheduled-jobs', scheduledJobsRoutes)
  .route('/c/:connectionId/metrics', metricsRoutes)
  .route('/c/:connectionId/workers', workersRoutes)
  .route('/c/:connectionId/redis-keys', redisKeysRoutes)

/**
 * Type export for Hono RPC client usage.
 * Use this type with hc() to get type-safe API calls:
 *
 * ```ts
 * import { hc } from 'hono/client'
 * import type { ApiType } from '@durabull/api-server/app'
 *
 * const client = hc<ApiType>('/api')
 * ```
 */
export type ApiType = typeof apiRoutes

/**
 * Creates and configures the Hono API app with all routes and middleware.
 * This function does NOT start a server - it only returns the configured app.
 *
 * Use this to:
 * - Run standalone with Bun.serve (see index.ts)
 * - Mount as middleware in another server (e.g., TanStack Start)
 * - Test API routes
 *
 * @returns Object containing the Hono app and API router
 */
// Default CORS origins based on environment
const getDefaultCorsOrigins = () => {
  return [env.APP_BASE_URL ?? 'http://localhost:5173']
}

export async function createApiApp(options: CreateApiAppOptions = {}) {
  const { enableLogging = true, corsOrigins = getDefaultCorsOrigins() } = options

  const app = new Hono()

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse()
    }

    if (isRedisConnectionError(error)) {
      const detail = redactSensitiveErrorData(normalizeErrorMessage(error))
      console.error(`[redis] ${detail}`)
      return c.json(
        {
          error: 'Redis connection unavailable',
          message: REDIS_CONNECTION_ERROR_MESSAGE,
          detail: env.NODE_ENV === 'production' ? undefined : detail,
        },
        503
      )
    }

    console.error('[api] Unhandled error:', error)
    return c.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred while processing this request.',
      },
      500
    )
  })

  // Middleware
  if (enableLogging) {
    const requestLogger = logger()
    app.use('*', async (c, next) => {
      if (c.req.path === '/api/health') {
        await next()
        return
      }

      await requestLogger(c, next)
    })
  }

  // Security headers
  app.use(
    '*',
    secureHeaders({
      strictTransportSecurity: 'max-age=31536000; includeSubDomains',
      xContentTypeOptions: 'nosniff',
      xFrameOptions: 'DENY',
    })
  )

  app.use(
    '/api/*',
    cors({
      origin: corsOrigins,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true, // Required for auth cookies
    })
  )

  // Rate limiting
  // Skip rate limiting for session checks - these are read-only and shouldn't break user sessions
  // Only rate limit actual auth actions (sign-in, sign-up, etc.)
  app.use('/api/auth/*', async (c, next) => {
    const path = c.req.path
    // Don't rate limit session checks - they're read-only
    if (path.includes('/get-session') || path.includes('/session')) {
      return next()
    }
    return authRateLimiter(c, next)
  })

  // General rate limiting for non-auth API endpoints
  app.use('/api/*', async (c, next) => {
    // Skip auth routes (handled above)
    if (c.req.path.startsWith('/api/auth')) {
      return next()
    }
    return apiRateLimiter(c, next)
  })

  // Body size limit to prevent payload-based attacks (1MB max)
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 1024 * 1024, // 1MB
      onError: (c) =>
        c.json({ error: 'Payload Too Large', message: 'Request body exceeds 1MB limit' }, 413),
    })
  )

  // Initialize auth and create middleware
  const auth = isAuthlessMode() ? undefined : await getAuth()
  const sessionMiddleware = createSessionMiddleware(auth)
  const connectionMiddleware = createConnectionMiddleware(auth)

  // Create the runtime API with middleware applied
  const api = new Hono()
    // Public routes (no auth needed)
    .route('/auth', authRoutes)
    .route('/invitations', invitationsRoutes)
    .get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))
    .get('/mode', (c) => c.json(getAppMode()))

  // Apply session middleware to routes that need it
  api.use('/session', sessionMiddleware)
  api.use('/app/config', sessionMiddleware)
  api.use('/connections/*', sessionMiddleware)
  api.use('/team/*', sessionMiddleware)
  api.use('/user-settings/*', sessionMiddleware)
  api.use('/alerts/*', sessionMiddleware)
  // Connection middleware includes session handling - no need for both
  api.use('/c/:connectionId/*', connectionMiddleware)

  // Mount routes with middleware applied
  api
    .get('/app/config', async (c) => {
      await touchUserLastSignIn(c.get('user')?.id)
      return c.json(getAppConfig())
    })
    .get('/session', (c) => {
      const user = c.get('user')
      const session = c.get('session')
      const organization = c.get('organization')
      return c.json({ user, session, organization })
    })
    .route('/connections', connectionsRoutes)
    .route('/team', teamRoutes)
    .route('/user-settings', userSettingsRoutes)
    .route('/alerts', alertsGlobalRoutes)
    .route('/c/:connectionId/alerts', alertsRoutes)
    .route('/c/:connectionId/queues', queuesRoutes)
    .route('/c/:connectionId/queues', jobsRoutes)
    .route('/c/:connectionId/scheduled-jobs', scheduledJobsRoutes)
    .route('/c/:connectionId/metrics', metricsRoutes)
    .route('/c/:connectionId/workers', workersRoutes)
    .route('/c/:connectionId/redis-keys', redisKeysRoutes)

  // Mount API under /api prefix
  app.route('/api', api)

  // PostHog reverse proxy to bypass ad blockers
  // See: https://posthog.com/docs/advanced/proxy
  // Uses env.POSTHOG_HOST for the API host, defaults to US region.
  const posthogApiHost = getPosthogApiHost()
  const posthogAssetsHost = posthogApiHost.replace('.i.posthog.com', '-assets.i.posthog.com')

  // CORS for PostHog proxy - allows cross-origin requests from docs site
  app.use(
    '/ingest/*',
    cors({
      origin:
        env.NODE_ENV === 'production'
          ? ['https://durabull.io', 'https://www.durabull.io', 'https://app.durabull.io']
          : ['http://localhost:3002', 'https://durabull.io'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    })
  )

  app.all('/ingest/*', async (c) => {
    const url = new URL(c.req.url)
    const pathname = url.pathname

    // Static assets (like the JS SDK) come from the assets host
    const isStaticAsset = pathname.startsWith('/ingest/static/')
    const targetHost = isStaticAsset ? posthogAssetsHost : posthogApiHost

    // Remove the /ingest prefix to get the actual PostHog path
    const posthogPath = pathname.replace(/^\/ingest/, '')
    const targetUrl = `${targetHost}${posthogPath}${url.search}`

    // Clone headers, removing host-specific ones
    const headers = new Headers(c.req.raw.headers)
    headers.delete('host')
    headers.delete('connection')
    headers.set('x-forwarded-host', url.host)

    try {
      const response = await fetch(targetUrl, {
        method: c.req.method,
        headers,
        body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
        duplex: 'half',
      } as RequestInit)

      // Clone response headers
      const responseHeaders = new Headers(response.headers)
      responseHeaders.delete('content-encoding')
      responseHeaders.delete('transfer-encoding')

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      })
    } catch (error) {
      console.error(`PostHog proxy error: ${String(error)}`)
      return c.text('Proxy Error', 502)
    }
  })

  return { app, api }
}
