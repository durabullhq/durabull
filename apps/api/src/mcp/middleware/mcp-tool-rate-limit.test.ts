import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { mcpPolicyRepository } from '@durabull/dal'
import { Hono } from 'hono'

import {
  createMcpToolRateLimitMiddleware,
  resetMcpToolRateLimitStoreForTests,
  setMcpToolRateLimitBypassForTests,
} from './mcp-tool-rate-limit'

describe('createMcpToolRateLimitMiddleware', () => {
  beforeEach(() => {
    // Rate limiting must not need a database or inherit another suite's repository mocks.
    spyOn(mcpPolicyRepository, 'createAuditEvent').mockImplementation(async (input) => ({
      ...input,
      id: 'audit-test',
      createdAt: new Date(0),
      updatedAt: new Date(0),
      organizationId: input.organizationId ?? null,
      connectionId: input.connectionId ?? null,
      denialReason: input.denialReason ?? null,
      inputHash: input.inputHash ?? null,
      responseClass: input.responseClass ?? null,
      requiredScopes: input.requiredScopes.join(' '),
    }))
    resetMcpToolRateLimitStoreForTests()
    setMcpToolRateLimitBypassForTests(true)
  })

  afterEach(() => {
    mock.restore()
    resetMcpToolRateLimitStoreForTests()
    setMcpToolRateLimitBypassForTests(false)
  })

  function appFor(userId = 'user-1', clientId = 'chatgpt') {
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('mcpSession', {
        userId,
        clientId,
        accessToken: 'unused',
        refreshToken: 'unused',
        accessTokenExpiresAt: new Date(0),
        refreshTokenExpiresAt: new Date(0),
        scopes: 'mcp:discover',
      })
      await next()
    })
    app.use('*', createMcpToolRateLimitMiddleware())
    app.post('/', (c) => c.json({ ok: true }))
    return app
  }

  function call(app: Hono, name: string, token = 'test-token') {
    return app.request('/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 42,
        method: 'tools/call',
        params: { name, arguments: { connectionId: 'conn-1' } },
      }),
    })
  }

  it('allows a detailed 50-job investigation without a one-minute lockout', async () => {
    const app = appFor()
    const responses = await Promise.all(Array.from({ length: 50 }, () => call(app, 'get_job_logs')))
    expect(responses.every((response) => response.status === 200)).toBe(true)
  })

  it('keeps setup usable when a diagnostic budget is exhausted', async () => {
    const app = appFor()
    for (let i = 0; i < 100; i++) await call(app, 'get_job_logs')
    expect((await call(app, 'get_job_logs')).status).toBe(429)
    expect((await call(app, 'ping')).status).toBe(200)
    expect((await call(app, 'list_connections')).status).toBe(200)
    expect((await call(app, 'get_job')).status).toBe(200)
  })

  it('returns a short accurate retry delay and refills without extending the penalty', async () => {
    let now = 1000
    spyOn(Date, 'now').mockImplementation(() => now)
    const app = appFor()
    for (let i = 0; i < 90; i++) expect((await call(app, 'get_job_logs')).status).toBe(200)
    const denied = await call(app, 'get_job_logs')
    expect(denied.status).toBe(429)
    expect(denied.headers.get('Retry-After')).toBe('1')
    expect(await denied.json()).toMatchObject({
      jsonrpc: '2.0',
      id: 42,
      error: { code: -32029, data: { retryAfter: 1, bucket: 'heavy' } },
    })
    expect(mcpPolicyRepository.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ responseClass: 'rate_limited', toolName: 'get_job_logs' })
    )
    now += 1000
    expect((await call(app, 'get_job_logs')).status).toBe(200)
  })

  it('shares costly work across tools and token refreshes but isolates users and clients', async () => {
    spyOn(Date, 'now').mockReturnValue(1000)
    const app = appFor()
    for (let i = 0; i < 90; i++) await call(app, 'get_job_logs')
    expect((await call(app, 'get_job_stacktraces', 'refreshed-token')).status).toBe(429)
    expect((await call(appFor('user-2'), 'get_job_logs')).status).toBe(200)
    expect((await call(appFor('user-1', 'claude'), 'get_job_logs')).status).toBe(200)
  })

  it('keeps mutations bounded and separate from read bursts', async () => {
    spyOn(Date, 'now').mockReturnValue(1000)
    const app = appFor()
    for (let i = 0; i < 30; i++) expect((await call(app, 'retry_job')).status).toBe(200)
    expect((await call(app, 'pause_queue')).status).toBe(429)
    expect((await call(app, 'get_job')).status).toBe(200)
  })
})
