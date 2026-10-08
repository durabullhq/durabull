import { authSchema, eq, getDb } from '@durabull/dal'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { tryGetServerAnalyticsOptions } from '@durabull/analytics/server'
import { extractBearerToken } from '@durabull/mcp/auth'
import { getSignedCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { getAuth } from '../../lib/auth'
import { resolveMcpSessionFromAccessToken } from '../auth/resolve-mcp-session'
import { resolveMcpPrincipal } from '../policy/principal-resolver'
import { recordMcpAnalytics, type McpAnalyticsIdentity } from './mcp-analytics'
import { mcpAnalyticsContext, mcpAnalyticsKey, mcpClientFamily } from './mcp-analytics-context'

const STAGES: Record<string, string> = {
  '/mcp/register': 'register',
  '/mcp/authorize': 'authorize',
  '/mcp/token': 'token',
  '/oauth2/consent': 'consent',
  '/mcp/get-session': 'session',
  '/mcp/userinfo': 'userinfo',
  '/mcp/jwks': 'jwks',
  '/.well-known/oauth-authorization-server': 'discovery',
  '/.well-known/oauth-protected-resource': 'discovery',
}

/** Read small OAuth envelopes without emitting credentials, codes, URLs, names, or scopes. */
async function readEnvelope(message: Request | Response): Promise<Record<string, unknown>> {
  const type = message.headers.get('content-type') ?? ''
  if (
    !message.body ||
    (!type.includes('json') && !type.includes('application/x-www-form-urlencoded'))
  )
    return {}
  const reader = message.clone().body!.getReader()
  let size = 0
  let text = ''
  const decoder = new TextDecoder()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), 1000)
  })
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), timeout])
      if (!chunk) return {}
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 16 * 1024) return {}
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    const value = type.includes('json')
      ? JSON.parse(text)
      : Object.fromEntries(new URLSearchParams(text))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  } finally {
    clearTimeout(timer)
    void reader.cancel().catch(() => {})
  }
}

interface OAuthAnalyticsResolvers {
  userId: (headers: Headers) => Promise<string | null>
  consentContext: (
    code: string,
    userId: string
  ) => Promise<{ clientId: string; scopeCount?: number } | null>
  cookieSecret?: () => Promise<string>
  tokenIdentity: (
    token: string
  ) => Promise<{ clientId: string; identity: McpAnalyticsIdentity } | null>
}

const defaultResolvers: OAuthAnalyticsResolvers = {
  userId: async (headers) => (await (await getAuth()).api.getSession({ headers }))?.user.id ?? null,
  cookieSecret: async () => (await (await getAuth()).$context).secret,
  consentContext: async (code, userId) => {
    const db = await getDb()
    const [verification] = await db
      .select({
        value: authSchema.authVerification.value,
        expiresAt: authSchema.authVerification.expiresAt,
      })
      .from(authSchema.authVerification)
      .where(eq(authSchema.authVerification.identifier, code))
      .limit(1)
    if (!verification || verification.expiresAt < new Date()) return null
    const pending = JSON.parse(verification.value)
    return pending.userId === userId && typeof pending.clientId === 'string'
      ? {
          clientId: pending.clientId,
          scopeCount: Array.isArray(pending.scope) ? pending.scope.length : undefined,
        }
      : null
  },
  tokenIdentity: async (token) => {
    const session = await resolveMcpSessionFromAccessToken(token)
    const principal =
      session && session.accessTokenExpiresAt > new Date()
        ? await resolveMcpPrincipal(session)
        : null
    return session && principal
      ? {
          clientId: session.clientId,
          identity: {
            principalType: principal.type,
            principalId: principal.principalId,
            userId: session.userId,
            organizationId: principal.organizationId,
          },
        }
      : null
  },
}

export function createMcpOAuthAnalyticsMiddleware(
  resolvers: OAuthAnalyticsResolvers = defaultResolvers
) {
  return createMiddleware(async (c, next) => {
    if (!tryGetServerAnalyticsOptions()?.enabled) return next()
    const stage = STAGES[c.req.path.replace(/^\/api\/auth/, '')]
    if (!stage) return next()
    const started = performance.now()
    const requestedAt = new Date().toISOString()
    const input = await readEnvelope(c.req.raw)
    let clientId = typeof input.client_id === 'string' ? input.client_id : c.req.query('client_id')
    let userId: string | null = null
    const scope = input.scope ?? c.req.query('scope')
    let scopeCount =
      typeof scope === 'string' ? scope.split(/\s+/).filter(Boolean).length : undefined
    if (stage === 'authorize' || stage === 'consent' || stage === 'register') {
      try {
        userId = await resolvers.userId(c.req.raw.headers)
        if (stage === 'consent' && userId) {
          const code =
            typeof input.consent_code === 'string'
              ? input.consent_code
              : c.req.header('cookie') && resolvers.cookieSecret
                ? await getSignedCookie(c, await resolvers.cookieSecret(), 'oidc_consent_prompt')
                : undefined
          if (code) {
            const pending = await resolvers.consentContext(code, userId)
            clientId = pending?.clientId
            scopeCount = pending?.scopeCount
          }
        }
      } catch {
        /* Analytics lookup must never change authentication behavior. */
      }
    }
    const context = {
      properties: {
        mcp_transport: 'oauth',
        mcp_client_family: mcpClientFamily(input.client_name ?? c.req.header('user-agent')),
        mcp_request_key: mcpAnalyticsKey('request', crypto.randomUUID()),
      },
      clientId: () => clientId,
      identity: () =>
        userId ? { principalType: 'delegated_user' as const, principalId: userId, userId } : null,
    }
    const properties = {
      oauth_stage: stage,
      scope_count: scopeCount,
      http_method: c.req.method,
      oauth_grant_type: ['authorization_code', 'refresh_token', 'client_credentials'].includes(
        String(input.grant_type)
      )
        ? String(input.grant_type)
        : undefined,
    }
    return mcpAnalyticsContext.run(context, async () => {
      recordMcpAnalytics({
        event: AnalyticsEvents.MCP_OAUTH_REQUESTED,
        timestamp: requestedAt,
        properties,
      })
      await next()
      const status = c.error ? 500 : c.res.status
      // Inspection runs outside the response path, including token identity lookup.
      void readEnvelope(c.res)
        .then(async (output) => {
          if (stage === 'register' && typeof output.client_id === 'string')
            clientId = output.client_id
          let identity: McpAnalyticsIdentity | null = context.identity()
          const bearer = extractBearerToken(c.req.header('authorization'))
          const issuedToken =
            stage === 'token' && typeof output.access_token === 'string'
              ? output.access_token
              : undefined
          const token =
            issuedToken ?? (stage === 'session' || stage === 'userinfo' ? bearer : undefined)
          if (token && status < 400) {
            try {
              const resolved = await resolvers.tokenIdentity(token)
              if (resolved) {
                clientId = resolved.clientId
                userId = resolved.identity.userId ?? null
                identity = resolved.identity
              }
            } catch {
              /* Keep the OAuth outcome even if identity enrichment is unavailable. */
            }
          }
          let redirectError = false
          const redirect = c.res.headers.get('location') ?? output.redirectURI
          if (typeof redirect === 'string') {
            try {
              redirectError = new URL(redirect).searchParams.has('error')
            } catch {
              /* Not a URL. */
            }
          }
          const success =
            status < 400 &&
            !output.error &&
            !redirectError &&
            (stage !== 'session' || typeof output.clientId === 'string')
          const result = {
            ...properties,
            http_status: status,
            success: Boolean(success),
            duration_ms: Math.round(performance.now() - started),
          }
          recordMcpAnalytics({
            event: AnalyticsEvents.MCP_OAUTH_COMPLETED,
            identity,
            properties: result,
          })
          if (stage === 'register' && success)
            recordMcpAnalytics({
              event: AnalyticsEvents.MCP_CLIENT_REGISTERED,
              identity,
              properties: result,
            })
          if (
            stage === 'consent' &&
            status < 400 &&
            (input.accept === true || input.accept === false)
          ) {
            const denied = input.accept === false
            if (denied || success)
              recordMcpAnalytics({
                event: denied
                  ? AnalyticsEvents.MCP_CONSENT_DENIED
                  : AnalyticsEvents.MCP_CONSENT_GRANTED,
                identity,
                properties: result,
              })
          }
        })
        .catch(() => {})
    })
  })
}
