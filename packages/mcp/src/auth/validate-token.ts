import { missingScopes, tokenHasScopes } from './scopes'
import type { McpAccessTokenClaims, McpTokenValidationResult } from './types'
import { normalizeResourceUri } from './normalize-resource-uri'

export interface ValidateMcpAccessTokenOptions {
  canonicalResourceUri: string
  requiredScopes: readonly string[]
  /** When true, tokens must include a resource indicator matching the canonical URI. */
  requireResourceIndicator?: boolean
}

export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) return null
  const token = match[1].trim()
  return token.length > 0 ? token : null
}

export function validateMcpAccessTokenClaims(
  claims: McpAccessTokenClaims,
  options: ValidateMcpAccessTokenOptions
): McpTokenValidationResult {
  const now = Date.now()
  const expiry = claims.accessTokenExpiresAt
  if (!expiry || Number.isNaN(expiry.getTime()) || expiry.getTime() <= now) {
    return {
      ok: false,
      status: 401,
      error: 'invalid_token',
    }
  }

  const canonical = normalizeResourceUri(options.canonicalResourceUri)
  const requireResource = options.requireResourceIndicator ?? false

  if (requireResource && !claims.resource) {
    return {
      ok: false,
      status: 401,
      error: 'invalid_token',
    }
  }

  if (claims.resource) {
    const tokenResource = normalizeResourceUri(claims.resource)
    if (tokenResource !== canonical) {
      return {
        ok: false,
        status: 401,
        error: 'invalid_token',
      }
    }
  }

  if (!tokenHasScopes(claims.scopes, options.requiredScopes)) {
    return {
      ok: false,
      status: 403,
      error: 'insufficient_scope',
      missingScopes: missingScopes(claims.scopes, options.requiredScopes),
    }
  }

  return { ok: true, claims }
}
