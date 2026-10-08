import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { env } from '@durabull/env'
import { Hono } from 'hono'
import { apiRateLimiter, mcpRateLimiter, resetRateLimitStoreForTests } from './rate-limit'

const mutableEnv = env as {
  CI?: boolean
  DISABLE_RATE_LIMIT?: boolean
  DURABULL_CLOUD?: boolean
  NODE_ENV?: 'development' | 'test' | 'production'
  TRUST_PROXY?: boolean
}

const originalCi = mutableEnv.CI
const originalDisableRateLimit = mutableEnv.DISABLE_RATE_LIMIT
const originalDurabullCloud = mutableEnv.DURABULL_CLOUD
const originalNodeEnv = mutableEnv.NODE_ENV
const originalTrustProxy = mutableEnv.TRUST_PROXY

function createPingApp() {
  const app = new Hono()
  app.use('/api/*', apiRateLimiter)
  app.get('/api/ping', (c) => c.json({ ok: true }))
  return app
}

describe('apiRateLimiter', () => {
  beforeEach(() => {
    resetRateLimitStoreForTests()
    mutableEnv.CI = false
    mutableEnv.DISABLE_RATE_LIMIT = false
    mutableEnv.DURABULL_CLOUD = false
    mutableEnv.NODE_ENV = 'production'
    mutableEnv.TRUST_PROXY = undefined
  })

  afterEach(() => {
    mock.restore()
    mutableEnv.CI = originalCi
    mutableEnv.DISABLE_RATE_LIMIT = originalDisableRateLimit
    mutableEnv.DURABULL_CLOUD = originalDurabullCloud
    mutableEnv.NODE_ENV = originalNodeEnv
    mutableEnv.TRUST_PROXY = originalTrustProxy
  })

  it('allows a normal multi-tab app startup burst from one client behind trusted proxy', async () => {
    mutableEnv.DURABULL_CLOUD = true
    const app = createPingApp()

    const responses = await Promise.all(
      Array.from({ length: 150 }, () =>
        app.request('/api/ping', {
          headers: { 'x-forwarded-for': '203.0.113.10' },
        })
      )
    )

    expect(responses.every((response) => response.status === 200)).toBe(true)
    expect(responses[0]?.headers.get('X-RateLimit-Limit')).toBe('600')
  })

  it('does not treat spoofed x-forwarded-for values as separate clients when proxy is untrusted', async () => {
    const app = createPingApp()

    const responses = await Promise.all(
      Array.from({ length: 601 }, (_, index) =>
        app.request('/api/ping', {
          headers: { 'x-forwarded-for': `203.0.113.${index % 250}` },
        })
      )
    )

    expect(responses.some((response) => response.status === 429)).toBe(true)
    expect(responses.filter((response) => response.status === 429).length).toBeGreaterThan(0)
  })

  it('does not treat spoofed x-forwarded-for leftmost hops as separate clients when proxy is trusted', async () => {
    mutableEnv.TRUST_PROXY = true
    const app = createPingApp()

    const responses = await Promise.all(
      Array.from({ length: 601 }, (_, index) =>
        app.request('/api/ping', {
          headers: {
            'cf-connecting-ip': '198.51.100.42',
            'x-forwarded-for': `${index}.0.0.1, 198.51.100.42`,
          },
        })
      )
    )

    expect(responses.some((response) => response.status === 429)).toBe(true)
  })

  it('honors x-forwarded-for when TRUST_PROXY is enabled', async () => {
    mutableEnv.TRUST_PROXY = true
    const app = createPingApp()

    const responses = await Promise.all(
      Array.from({ length: 601 }, (_, index) =>
        app.request('/api/ping', {
          headers: { 'x-forwarded-for': `198.51.100.${index % 250}` },
        })
      )
    )

    expect(responses.every((response) => response.status === 200)).toBe(true)
  })
  it('allows plugin setup after an agent discovery burst at the real MCP mount paths', async () => {
    const app = new Hono()
    app.use('/mcp', mcpRateLimiter)
    app.use('/mcp/*', mcpRateLimiter)
    app.post('/mcp', (c) => c.json({ ok: true }))
    for (let i = 0; i < 80; i += 1) {
      const response = await app.request('/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer setup-test', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: i,
          method: i === 79 ? 'tools/call' : 'tools/list',
          params: i === 79 ? { name: 'ping', arguments: {} } : {},
        }),
      })
      expect(response.status).toBe(200)
    }
  })
  it('charges overlapping ingress registrations once and refills an exhausted burst', async () => {
    let now = 1000
    spyOn(Date, 'now').mockImplementation(() => now)
    const app = new Hono()
    app.use('/mcp', mcpRateLimiter)
    app.use('/mcp/*', mcpRateLimiter)
    app.post('/mcp', (c) => c.json({ ok: true }))
    const request = () =>
      app.request('/mcp', { method: 'POST', headers: { Authorization: 'Bearer burst-test' } })
    const first = await request()
    expect(first.headers.get('X-RateLimit-Remaining')).toBe('599')
    for (let i = 1; i < 600; i++) expect((await request()).status).toBe(200)
    const denied = await request()
    expect(denied.status).toBe(429)
    expect(denied.headers.get('Retry-After')).toBe('1')
    expect(await denied.json()).toMatchObject({ retryAfter: 1, bucket: 'ingress' })
    now += 1000
    expect((await request()).status).toBe(200)
  })
})
