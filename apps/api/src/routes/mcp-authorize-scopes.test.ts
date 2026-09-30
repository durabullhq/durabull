import { describe, expect, it } from 'bun:test'
import { MCP_PHASE1_SCOPES } from '@durabull/mcp/auth'

import { ensureMcpAuthorizeScopes } from './mcp-authorize-scopes'

const APP_BASE_URL = 'https://app.example.com'
const CANONICAL_RESOURCE = `${APP_BASE_URL}/mcp`

function authorizeUrl(scope?: string, extra?: Record<string, string>): URL {
  const url = new URL(`${APP_BASE_URL}/api/auth/mcp/authorize`)
  url.searchParams.set('client_id', 'client-1')
  url.searchParams.set('redirect_uri', 'https://linear.example/callback')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('resource', CANONICAL_RESOURCE)
  if (scope !== undefined) {
    url.searchParams.set('scope', scope)
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    url.searchParams.set(key, value)
  }
  return url
}

describe('ensureMcpAuthorizeScopes', () => {
  it('leaves non-authorize paths unchanged', () => {
    const url = new URL(`${APP_BASE_URL}/api/auth/session`)
    expect(ensureMcpAuthorizeScopes(url, APP_BASE_URL).toString()).toBe(url.toString())
  })

  it('leaves authorize without resource unchanged', () => {
    const url = authorizeUrl('openid')
    url.searchParams.delete('resource')
    expect(ensureMcpAuthorizeScopes(url, APP_BASE_URL).toString()).toBe(url.toString())
  })

  it('leaves authorize with non-canonical resource unchanged', () => {
    const url = authorizeUrl('openid')
    url.searchParams.set('resource', 'https://other.example/mcp')
    expect(ensureMcpAuthorizeScopes(url, APP_BASE_URL).toString()).toBe(url.toString())
  })

  it('adds phase-1 MCP scopes and openid when scope is omitted', () => {
    const url = authorizeUrl(undefined)
    url.searchParams.delete('scope')
    const rewritten = ensureMcpAuthorizeScopes(url, APP_BASE_URL)
    const scopes = new Set(rewritten.searchParams.get('scope')?.split(/\s+/) ?? [])
    expect(scopes.has('openid')).toBe(true)
    for (const scope of MCP_PHASE1_SCOPES) {
      expect(scopes.has(scope)).toBe(true)
    }
    expect(rewritten.searchParams.get('prompt')).toBe('consent')
  })

  it('expands minimal mcp:discover-only requests to full phase-1 scopes', () => {
    const rewritten = ensureMcpAuthorizeScopes(authorizeUrl('openid mcp:discover'), APP_BASE_URL)
    const scopes = rewritten.searchParams.get('scope')?.split(/\s+/) ?? []
    expect(scopes).toEqual(expect.arrayContaining(['openid', ...MCP_PHASE1_SCOPES]))
    expect(rewritten.searchParams.get('prompt')).toBe('consent')
  })

  it('forces prompt=consent when prompt is omitted', () => {
    const rewritten = ensureMcpAuthorizeScopes(
      authorizeUrl([...MCP_PHASE1_SCOPES, 'openid'].join(' ')),
      APP_BASE_URL
    )
    expect(rewritten.searchParams.get('prompt')).toBe('consent')
  })

  it('replaces prompt=none with consent', () => {
    const rewritten = ensureMcpAuthorizeScopes(
      authorizeUrl('openid mcp:discover', { prompt: 'none' }),
      APP_BASE_URL
    )
    expect(rewritten.searchParams.get('prompt')).toBe('consent')
  })

  it('preserves an explicit non-none prompt', () => {
    const rewritten = ensureMcpAuthorizeScopes(
      authorizeUrl([...MCP_PHASE1_SCOPES, 'openid'].join(' '), { prompt: 'login' }),
      APP_BASE_URL
    )
    expect(rewritten.searchParams.get('prompt')).toBe('login')
  })

  it('is a no-op when scopes and prompt are already complete', () => {
    const url = authorizeUrl([...MCP_PHASE1_SCOPES, 'openid'].join(' '), { prompt: 'consent' })
    expect(ensureMcpAuthorizeScopes(url, APP_BASE_URL).toString()).toBe(url.toString())
  })
})
