/**
 * Generic bearer middleware for `@durabull/mcp` package tests and non–Better Auth hosts.
 * Production Durabull API ingress uses Better Auth `getMcpSession` / `withMcpAuth` instead
 * (`apps/api/src/mcp/auth/mcp-session-middleware.ts`).
 *
 * @see https://better-auth.com/docs/plugins/mcp
 */
import type { MiddlewareHandler } from 'hono'
import { createMiddleware } from 'hono/factory'

import {
  buildMcpInsufficientScopeResponse,
  buildMcpMissingBearerResponse,
  buildMcpUnauthorizedResponse,
} from './json-rpc-auth-response'
import { extractBearerToken, validateMcpAccessTokenClaims } from './validate-token'
import type { McpAccessTokenClaims } from './types'

export interface McpBearerAuthMiddlewareOptions {
  canonicalResourceUri: string
  resourceMetadataUrl: string
  requiredScopes: readonly string[]
  requireResourceIndicator?: boolean
  verifyAccessToken: (accessToken: string) => Promise<McpAccessTokenClaims | null>
}

export function createMcpBearerAuthMiddleware(
  options: McpBearerAuthMiddlewareOptions
): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const bearerToken = extractBearerToken(c.req.header('Authorization'))
    if (!bearerToken) {
      return buildMcpMissingBearerResponse(options.resourceMetadataUrl)
    }

    let claims: McpAccessTokenClaims | null = null
    try {
      claims = await options.verifyAccessToken(bearerToken)
    } catch (error) {
      console.error('[mcp] verifyAccessToken failed:', error)
      return buildMcpUnauthorizedResponse(options.resourceMetadataUrl)
    }

    if (!claims) {
      return buildMcpUnauthorizedResponse(options.resourceMetadataUrl)
    }

    const validation = validateMcpAccessTokenClaims(claims, {
      canonicalResourceUri: options.canonicalResourceUri,
      requiredScopes: options.requiredScopes,
      requireResourceIndicator: options.requireResourceIndicator,
    })

    if (!validation.ok) {
      if (validation.status === 403) {
        return buildMcpInsufficientScopeResponse(
          options.resourceMetadataUrl,
          validation.missingScopes ?? [...options.requiredScopes]
        )
      }

      return buildMcpUnauthorizedResponse(options.resourceMetadataUrl)
    }

    c.set('mcpAccessToken', validation.claims)
    return next()
  })
}

declare module 'hono' {
  interface ContextVariableMap {
    mcpAccessToken: McpAccessTokenClaims
  }
}
