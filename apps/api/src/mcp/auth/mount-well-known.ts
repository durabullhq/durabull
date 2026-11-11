import { Hono } from 'hono'
import { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } from 'better-auth/plugins'
import { MCP_OAUTH_SCOPES_SUPPORTED } from '@durabull/mcp/auth'

import { getAuth } from '../../lib/auth'
import { isAuthlessMode } from '../../lib/authless'
import { buildAuthlessMcpProtectedResourceMetadata } from './authless-metadata'

const REQUIRED_AUTHORIZATION_SERVER_SCOPES = [...MCP_OAUTH_SCOPES_SUPPORTED] as const

function appendMissingScopes(
  scopesSupported: unknown,
  requiredScopes: readonly string[]
): string[] {
  const existing = Array.isArray(scopesSupported)
    ? scopesSupported.filter((scope): scope is string => typeof scope === 'string')
    : []
  const merged = new Set(existing)
  for (const scope of requiredScopes) {
    merged.add(scope)
  }
  return Array.from(merged)
}

/**
 * App-origin well-known routes for MCP clients that cannot parse `WWW-Authenticate`.
 * Better Auth also serves the same metadata under `/api/auth/.well-known/*`.
 *
 * @see https://better-auth.com/docs/plugins/mcp#oauth-protected-resource-metadata
 */
export function mountMcpWellKnownRoutes(appBaseUrl: string) {
  const routes = new Hono()

  routes.get('/.well-known/oauth-protected-resource', async (c) => {
    if (isAuthlessMode()) {
      c.header('Cache-Control', 'public, max-age=300')
      return c.json(buildAuthlessMcpProtectedResourceMetadata(appBaseUrl))
    }

    const auth = await getAuth()
    c.header('Cache-Control', 'public, max-age=300')
    return oAuthProtectedResourceMetadata(auth)(c.req.raw)
  })

  routes.get('/.well-known/oauth-authorization-server', async (c) => {
    if (isAuthlessMode()) {
      return c.notFound()
    }

    const auth = await getAuth()
    const response = await oAuthDiscoveryMetadata(auth)(c.req.raw)
    if (!response.ok) {
      return response
    }

    let body: Record<string, unknown>
    try {
      body = (await response.clone().json()) as Record<string, unknown>
    } catch {
      return response
    }

    body.scopes_supported = appendMissingScopes(
      body.scopes_supported,
      REQUIRED_AUTHORIZATION_SERVER_SCOPES
    )

    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'public, max-age=300')
    headers.set('Content-Type', 'application/json')
    return new Response(JSON.stringify(body), {
      status: response.status,
      headers,
    })
  })

  return routes
}
