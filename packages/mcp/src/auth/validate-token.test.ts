import { describe, expect, it } from 'bun:test'

import { MCP_SCOPE_DISCOVER } from './scopes'
import { extractBearerToken, validateMcpAccessTokenClaims } from './validate-token'
import type { McpAccessTokenClaims } from './types'

const canonicalResourceUri = 'https://app.example.com/mcp'

function baseClaims(overrides: Partial<McpAccessTokenClaims> = {}): McpAccessTokenClaims {
  return {
    accessToken: 'token',
    clientId: 'client',
    userId: 'user',
    scopes: [MCP_SCOPE_DISCOVER],
    accessTokenExpiresAt: new Date(Date.now() + 60_000),
    resource: null,
    ...overrides,
  }
}

describe('extractBearerToken', () => {
  it('parses Bearer tokens case-insensitively', () => {
    expect(extractBearerToken('Bearer abc.def')).toBe('abc.def')
    expect(extractBearerToken('bearer xyz')).toBe('xyz')
  })

  it('returns null when Authorization is missing or malformed', () => {
    expect(extractBearerToken(undefined)).toBeNull()
    expect(extractBearerToken('Basic abc')).toBeNull()
  })
})

describe('validateMcpAccessTokenClaims', () => {
  it('accepts valid scoped tokens for the canonical resource', () => {
    const result = validateMcpAccessTokenClaims(baseClaims({ resource: canonicalResourceUri }), {
      canonicalResourceUri,
      requiredScopes: [MCP_SCOPE_DISCOVER],
      requireResourceIndicator: true,
    })

    expect(result.ok).toBe(true)
  })

  it('returns 401 when resource indicator is required but missing', () => {
    const result = validateMcpAccessTokenClaims(baseClaims({ resource: null }), {
      canonicalResourceUri,
      requiredScopes: [MCP_SCOPE_DISCOVER],
      requireResourceIndicator: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
    }
  })

  it('returns 401 for expired tokens', () => {
    const result = validateMcpAccessTokenClaims(
      baseClaims({ accessTokenExpiresAt: new Date(Date.now() - 1_000) }),
      { canonicalResourceUri, requiredScopes: [MCP_SCOPE_DISCOVER] }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
    }
  })

  it('returns 401 when resource does not match canonical URI', () => {
    const result = validateMcpAccessTokenClaims(
      baseClaims({ resource: 'https://other.example.com/mcp' }),
      { canonicalResourceUri, requiredScopes: [MCP_SCOPE_DISCOVER] }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
    }
  })

  it('accepts equivalent resource URIs with trailing slash differences', () => {
    const result = validateMcpAccessTokenClaims(
      baseClaims({ resource: 'https://app.example.com/mcp/' }),
      {
        canonicalResourceUri: 'https://app.example.com/mcp',
        requiredScopes: [MCP_SCOPE_DISCOVER],
      }
    )

    expect(result.ok).toBe(true)
  })

  it('returns 403 with missing scopes when scope is insufficient', () => {
    const result = validateMcpAccessTokenClaims(baseClaims({ scopes: ['openid'] }), {
      canonicalResourceUri,
      requiredScopes: [MCP_SCOPE_DISCOVER],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.missingScopes).toEqual([MCP_SCOPE_DISCOVER])
    }
  })
})
