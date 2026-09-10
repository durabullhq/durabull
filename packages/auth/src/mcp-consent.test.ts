import { describe, expect, it } from 'bun:test'

import {
  buildMcpAuthorizeResumeUrl,
  labelConsentScopes,
  parseConsentScopeList,
  parseMcpOAuthConsentSearch,
} from './mcp-consent'

describe('mcp-consent helpers', () => {
  it('parses consent search params', () => {
    expect(
      parseMcpOAuthConsentSearch({
        consent_code: 'abc',
        client_id: 'client-1',
        scope: 'openid mcp:discover',
      })
    ).toEqual({
      consent_code: 'abc',
      client_id: 'client-1',
      scope: 'openid mcp:discover',
    })
  })

  it('labels MCP scopes for the consent screen', () => {
    const labels = labelConsentScopes(parseConsentScopeList('mcp:discover mcp:jobs:read'))
    expect(labels.map((entry) => entry.scope)).toEqual(['mcp:discover', 'mcp:jobs:read'])
    expect(labels[0]?.title).toBe('MCP discovery')
    expect(labels.every((entry) => entry.writeScope === false)).toBe(true)
  })

  it('labels write scopes distinctly and flags unknown scopes', () => {
    const labels = labelConsentScopes(
      parseConsentScopeList('mcp:jobs:retry mcp:queues:pause mcp:failures:write mcp:queues:purge')
    )
    expect(labels.map((entry) => [entry.scope, entry.writeScope, entry.unknownScope])).toEqual([
      ['mcp:jobs:retry', true, false],
      ['mcp:queues:pause', true, false],
      ['mcp:failures:write', true, false],
      ['mcp:queues:purge', false, true],
    ])
    expect(labels[0]?.title).toBe('Retry failed jobs')
  })

  it('stays in sync with the MCP package scope taxonomy', async () => {
    const server = await import('@durabull/mcp/auth')
    const { MCP_ALL_SCOPES } = await import('./mcp-scope-labels')
    expect([...MCP_ALL_SCOPES].sort()).toEqual([...server.MCP_ALL_SCOPES].sort())
  })

  it('builds authorize resume URLs with consent prompt', () => {
    const url = buildMcpAuthorizeResumeUrl({
      client_id: 'client',
      redirect_uri: 'http://127.0.0.1/callback',
      response_type: 'code',
      scope: 'openid mcp:discover',
    })
    expect(url).toContain('/api/auth/mcp/authorize')
    expect(url).toContain('prompt=consent')
  })
})
