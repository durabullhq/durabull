import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { createHmac } from 'node:crypto'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { env } from '@durabull/env'

const captureMcpAnalyticsServerEvent = mock(async () => {})

mock.module('@durabull/analytics/server', () => ({
  captureMcpAnalyticsServerEvent,
  hashMcpAnalyticsSessionId: (value: string) => `session-${value}`,
  shouldDedupeIdentifiedPosthogEvents: () => false,
  resolveIdentifiedDistinctIds: ({
    userId,
    organizationId,
  }: {
    userId?: string
    organizationId?: string
  }) => {
    if (userId) {
      return { distinctId: `hashed-user:${userId}`, organizationGroup: null }
    }
    if (organizationId) {
      return {
        distinctId: `hashed-org:${organizationId}`,
        organizationGroup: `hashed-org:${organizationId}`,
      }
    }
    return { distinctId: null, organizationGroup: null }
  },
  tryGetServerAnalyticsOptions: () => ({
    enabled: true,
    hmacSecret: 'test-secret',
    resolveAnonymousInstanceId: async () => 'test-instance-id',
  }),
  configureServerAnalytics: () => undefined,
  resetServerAnalyticsForTests: () => undefined,
}))

const { recordMcpAnalytics, recordMcpTelemetryAnalytics } = await import('./mcp-analytics')
const { resetMcpAnalyticsQueueForTests } = await import('./mcp-analytics-queue')
const { resetMcpTelemetryForTests } = await import('./mcp-telemetry')

const mutableEnv = env as {
  BETTER_AUTH_SECRET?: string
  CI?: boolean
  NODE_ENV?: 'development' | 'test' | 'production'
}

const originalNodeEnv = mutableEnv.NODE_ENV
const originalCi = mutableEnv.CI
const originalSecret = mutableEnv.BETTER_AUTH_SECRET

describe('mcp analytics', () => {
  beforeEach(() => {
    mutableEnv.NODE_ENV = 'production'
    mutableEnv.CI = false
    mutableEnv.BETTER_AUTH_SECRET = 'test-secret'
    resetMcpTelemetryForTests()
    resetMcpAnalyticsQueueForTests()
    captureMcpAnalyticsServerEvent.mockClear()
  })

  afterEach(() => {
    mutableEnv.NODE_ENV = originalNodeEnv
    mutableEnv.CI = originalCi
    mutableEnv.BETTER_AUTH_SECRET = originalSecret
  })

  it('maps tool success telemetry to mcp_tool_called analytics', async () => {
    recordMcpTelemetryAnalytics('tool_success', {
      toolName: 'list_jobs',
      principalId: 'principal-1',
      principalType: 'delegated_user',
      userId: 'user-1',
      organizationId: null,
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(captureMcpAnalyticsServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AnalyticsEvents.MCP_TOOL_CALLED,
        identifiedDistinctId: 'hashed-user:user-1',
        includeAnonymous: true,
        properties: expect.objectContaining({
          tool_name: 'list_jobs',
          response_class: 'success',
        }),
      })
    )
  })

  it('records anonymous-only auth failures without identity', async () => {
    recordMcpTelemetryAnalytics('auth_missing_bearer', {})

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(captureMcpAnalyticsServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AnalyticsEvents.MCP_AUTH_FAILED,
        identifiedDistinctId: null,
        properties: expect.objectContaining({
          mcp_auth_failure: 'missing_bearer',
        }),
      })
    )
  })

  it('keeps service-account people separate and groups them by organization', async () => {
    recordMcpAnalytics({
      event: AnalyticsEvents.MCP_RPC_REQUESTED,
      properties: { mcp_method: 'tools/list' },
      identity: {
        principalType: 'service_account',
        principalId: 'sa-1',
        organizationId: 'org-1',
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(captureMcpAnalyticsServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        identifiedDistinctId: createHmac('sha256', 'test-secret')
          .update('mcp:principal:sa-1')
          .digest('hex'),
        // Raw org id is forwarded so capture hashes it exactly once (no double-hash).
        organizationId: 'org-1',
      })
    )
  })

  it('emits operational analytics for redaction-only signals', async () => {
    recordMcpTelemetryAnalytics('redaction_applied', {
      toolName: 'list_jobs',
      principalId: 'principal-1',
      principalType: 'delegated_user',
      userId: 'user-1',
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(captureMcpAnalyticsServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AnalyticsEvents.MCP_OPERATIONAL_SIGNAL,
        properties: expect.objectContaining({ telemetry_signal: 'redaction_applied' }),
      })
    )
  })
})

const { Hono } = await import('hono')
const { MCP_TOOL_NAMES } = await import('@durabull/mcp')
const { sanitizeTelemetryEvent } = await import('../../../../../packages/analytics/src/sanitizer')
const { createMcpRequestAnalyticsMiddleware, readMcpResponseOutcome } = await import(
  './mcp-request-analytics'
)
const { createMcpOAuthAnalyticsMiddleware } = await import('./mcp-oauth-analytics')

async function settleAnalytics() {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

function capturedEvents() {
  return captureMcpAnalyticsServerEvent.mock.calls.map(
    (call) =>
      (
        call as unknown as [
          {
            event: string
            properties: Record<string, unknown>
            identifiedDistinctId?: string
            organizationId?: string
          },
        ]
      )[0]
  )
}

function rpcFixture(status = 200, result: unknown = { result: {} }, withIdentity = true) {
  const app = new Hono()
  app.use('*', createMcpRequestAnalyticsMiddleware())
  // Nested mounts must not count a request twice.
  app.use('*', createMcpRequestAnalyticsMiddleware())
  app.post('/', async (c) => {
    c.set('mcpRequestJsonBody', await c.req.json())
    if (withIdentity)
      c.set('mcpSession', {
        accessToken: 'secret-bearer',
        refreshToken: 'secret-refresh',
        clientId: 'client-123',
        clientName: 'Codex',
        userId: 'user-123',
        scopes: 'mcp:discover',
        accessTokenExpiresAt: new Date(),
        refreshTokenExpiresAt: new Date(),
      })
    return c.json(result, status as 200)
  })
  return app
}

function rpcRequest(method: string, params?: unknown) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Codex/1.2' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }
}

describe('MCP lifecycle analytics coverage', () => {
  beforeEach(() => {
    resetMcpAnalyticsQueueForTests()
    captureMcpAnalyticsServerEvent.mockClear()
  })

  it('tracks authentication and successful initialization with safe client identity', async () => {
    const response = await rpcFixture().request(
      '/',
      rpcRequest('initialize', {
        protocolVersion: '2026-07-28',
        clientInfo: { name: 'Codex', version: '1.2.3' },
      })
    )
    expect(response.status).toBe(200)
    await settleAnalytics()
    const events = capturedEvents()
    expect(events.map((e) => e.event).sort()).toEqual(
      [
        AnalyticsEvents.MCP_AUTH_SUCCEEDED,
        AnalyticsEvents.MCP_CONNECTION_INITIALIZED,
        AnalyticsEvents.MCP_REQUEST_COMPLETED,
        AnalyticsEvents.MCP_RPC_COMPLETED,
        AnalyticsEvents.MCP_RPC_REQUESTED,
      ].sort()
    )
    for (const event of events) {
      expect(event.identifiedDistinctId).toBe('hashed-user:user-123')
      expect(event.properties.mcp_client_family).toBe('codex')
      expect(event.properties.mcp_client_key).toMatch(/^[a-f0-9]{64}$/)
      expect(event.properties.mcp_request_key).toMatch(/^[a-f0-9]{64}$/)
      expect(sanitizeTelemetryEvent(event.event, event.properties).droppedProperties).toEqual([])
      expect(JSON.stringify(event)).not.toContain('secret-bearer')
      expect(JSON.stringify(event.properties)).not.toContain('client-123')
    }
  })

  it('covers every catalog tool including ping and SDK errors that bypass handler callbacks', async () => {
    for (const name of MCP_TOOL_NAMES) {
      await rpcFixture().request('/', rpcRequest('tools/call', { name, arguments: {} }))
    }
    await settleAnalytics()
    const tools = capturedEvents().filter((e) => e.event === AnalyticsEvents.MCP_TOOL_CALLED)
    expect(tools.map((e) => e.properties.tool_name).sort()).toEqual([...MCP_TOOL_NAMES].sort())
    captureMcpAnalyticsServerEvent.mockClear()
    await rpcFixture(200, { error: { code: -32602, message: 'SECRET validation detail' } }).request(
      '/',
      rpcRequest('tools/call', { name: 'get_job', arguments: {} })
    )
    await settleAnalytics()
    expect(
      capturedEvents().find((e) => e.event === AnalyticsEvents.MCP_RPC_COMPLETED)?.properties
    ).toMatchObject({ response_class: 'rpc_error', success: false, rpc_error_code: -32602 })
    expect(JSON.stringify(capturedEvents())).not.toContain('SECRET')
  })

  it('records one final tool outcome even when SDK validation fails after handler success', async () => {
    const app = new Hono()
    app.use('*', createMcpRequestAnalyticsMiddleware())
    app.post('/', async (c) => {
      c.set('mcpRequestJsonBody', await c.req.json())
      c.set('mcpSession', {
        accessToken: 'secret',
        refreshToken: 'secret',
        clientId: 'client',
        userId: 'user',
        scopes: '',
        accessTokenExpiresAt: new Date(),
        refreshTokenExpiresAt: new Date(),
      })
      recordMcpTelemetryAnalytics('tool_success', {
        toolName: 'get_job',
        principalType: 'delegated_user',
        principalId: 'user',
        userId: 'user',
      })
      return c.json({ error: { code: -32603, message: 'Output validation failed' } })
    })
    await app.request('/', rpcRequest('tools/call', { name: 'get_job', arguments: {} }))
    await settleAnalytics()
    const tools = capturedEvents().filter(
      (event) => event.event === AnalyticsEvents.MCP_TOOL_CALLED
    )
    expect(tools).toHaveLength(1)
    expect(tools[0].properties).toMatchObject({ response_class: 'rpc_error', success: false })
  })

  it('tracks GET and OPTIONS without changing HTTP outcomes', async () => {
    const app = new Hono()
    app.use('*', createMcpRequestAnalyticsMiddleware())
    app.get('/', (c) => c.json({ error: 'Method not supported' }, 405))
    app.options('/', (c) => c.body(null, 204))
    expect((await app.request('/')).status).toBe(405)
    expect((await app.request('/', { method: 'OPTIONS' })).status).toBe(204)
    await settleAnalytics()
    expect(
      capturedEvents()
        .filter((event) => event.event === AnalyticsEvents.MCP_REQUEST_COMPLETED)
        .map((event) => event.properties.http_status)
    ).toEqual([405, 204])
    expect(
      capturedEvents().some((event) => event.event === AnalyticsEvents.MCP_RPC_REQUESTED)
    ).toBe(false)
  })

  it('covers resources, notifications, unsupported methods, malformed requests and HTTP rejection', async () => {
    for (const method of [
      'resources/read',
      'notifications/initialized',
      'completion/complete',
      'private-secret-method',
    ]) {
      await rpcFixture(403, { error: { message: 'denied' } }, false).request(
        '/',
        rpcRequest(method)
      )
    }
    await rpcFixture(400, {}, false).request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    await settleAnalytics()
    expect(
      capturedEvents()
        .filter((e) => e.event === AnalyticsEvents.MCP_RPC_REQUESTED)
        .map((e) => e.properties.mcp_method)
    ).toEqual([
      'resources/read',
      'notifications/initialized',
      'completion/complete',
      'unknown',
      'unknown',
    ])
    expect(
      capturedEvents()
        .filter((e) => e.event === AnalyticsEvents.MCP_RPC_COMPLETED)
        .every((e) => e.properties.success === false)
    ).toBe(true)
    expect(capturedEvents().some((e) => e.event === AnalyticsEvents.MCP_AUTH_SUCCEEDED)).toBe(false)
  })

  it('parses legacy SSE outcomes and bounds response inspection', async () => {
    expect(
      await readMcpResponseOutcome(
        new Response(
          'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"isError":true}}\n\n',
          { headers: { 'content-type': 'text/event-stream' } }
        )
      )
    ).toMatchObject({ response_class: 'tool_error', success: false })
    expect(
      await readMcpResponseOutcome(Response.json({ result: { payload: 'x'.repeat(70_000) } }))
    ).toEqual({ response_class: 'unobserved' })
  })

  it('isolates simultaneous user and client identities', async () => {
    const app = new Hono()
    app.use('*', createMcpRequestAnalyticsMiddleware())
    app.post('/', async (c) => {
      const user = c.req.header('x-test-user')!
      c.set('mcpSession', {
        accessToken: 'secret',
        refreshToken: 'secret',
        clientId: user,
        userId: user,
        scopes: '',
        accessTokenExpiresAt: new Date(),
        refreshTokenExpiresAt: new Date(),
      })
      c.set('mcpRequestJsonBody', await c.req.json())
      await new Promise((resolve) => setTimeout(resolve, user === 'alice' ? 10 : 1))
      recordMcpTelemetryAnalytics('rate_limited_tool', {
        toolName: 'get_job',
        principalType: 'delegated_user',
        principalId: user,
      })
      return c.json({ result: {} })
    })
    await Promise.all(
      ['alice', 'bob'].map((user) =>
        app.request('/', {
          ...rpcRequest('ping'),
          headers: { 'content-type': 'application/json', 'x-test-user': user },
        })
      )
    )
    await settleAnalytics()
    const limits = capturedEvents().filter((e) => e.event === AnalyticsEvents.MCP_RATE_LIMITED)
    expect(limits.map((e) => e.identifiedDistinctId).sort()).toEqual([
      'hashed-user:alice',
      'hashed-user:bob',
    ])
    expect(limits[0].properties.mcp_client_key).not.toBe(limits[1].properties.mcp_client_key)
  })

  it('tracks OAuth registration, exchange, refresh, consent and failures without credentials', async () => {
    const app = new Hono()
    app.use(
      '*',
      createMcpOAuthAnalyticsMiddleware({
        userId: async () => 'oauth-user',
        consentContext: async () => ({ clientId: 'oauth-client', scopeCount: 3 }),
        cookieSecret: async () => 'cookie-secret',
        tokenIdentity: async () => ({
          clientId: 'oauth-client',
          identity: {
            principalType: 'delegated_user',
            principalId: 'oauth-user',
            userId: 'oauth-user',
          },
        }),
      })
    )
    app.post('/api/auth/mcp/register', (c) =>
      c.json({ client_id: 'oauth-client', client_secret: 'SECRET-client' }, 201)
    )
    app.post('/api/auth/mcp/token', async (c) => {
      const input = await c.req.json()
      return input.grant_type === 'invalid'
        ? c.json({ error: 'invalid_grant' }, 400)
        : c.json({ access_token: 'SECRET-access', refresh_token: 'SECRET-refresh' })
    })
    app.get('/api/auth/mcp/authorize', (c) => c.redirect('https://example.com/consent?code=SECRET'))
    app.post('/api/auth/oauth2/consent', async (c) => {
      const body = await c.req.json()
      return c.json({
        redirectURI: body.accept
          ? 'https://example.com/?code=SECRET'
          : 'https://example.com/?error=access_denied',
      })
    })
    const post = (path: string, body: unknown) =>
      app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    await post('/api/auth/mcp/register', {
      client_name: 'Claude',
      redirect_uris: ['https://private.example.com'],
    })
    await post('/api/auth/mcp/token', { grant_type: 'authorization_code', code: 'SECRET-code' })
    await post('/api/auth/mcp/token', {
      grant_type: 'refresh_token',
      refresh_token: 'SECRET-refresh',
    })
    await post('/api/auth/mcp/token', { grant_type: 'invalid', client_id: 'oauth-client' })
    await app.request('/api/auth/mcp/authorize?client_id=oauth-client')
    await post('/api/auth/oauth2/consent', { accept: true, consent_code: 'SECRET-consent' })
    await post('/api/auth/oauth2/consent', { accept: false, consent_code: 'SECRET-consent' })
    const cookieCode = 'COOKIE-CODE'
    const signature = createHmac('sha256', 'cookie-secret').update(cookieCode).digest('base64')
    await app.request('/api/auth/oauth2/consent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `oidc_consent_prompt=${encodeURIComponent(`${cookieCode}.${signature}`)}`,
      },
      body: JSON.stringify({ accept: true }),
    })
    await settleAnalytics()
    const events = capturedEvents()
    expect(events.filter((e) => e.event === AnalyticsEvents.MCP_OAUTH_COMPLETED)).toHaveLength(8)
    for (const event of [
      AnalyticsEvents.MCP_CLIENT_REGISTERED,
      AnalyticsEvents.MCP_CONSENT_GRANTED,
      AnalyticsEvents.MCP_CONSENT_DENIED,
    ])
      expect(events.filter((e) => e.event === event)).toHaveLength(
        event === AnalyticsEvents.MCP_CONSENT_GRANTED ? 2 : 1
      )
    expect(
      events
        .filter(
          (e) =>
            e.event === AnalyticsEvents.MCP_OAUTH_COMPLETED &&
            e.properties.oauth_stage === 'token' &&
            e.properties.success === true
        )
        .map((e) => e.properties.oauth_grant_type)
    ).toEqual(['authorization_code', 'refresh_token'])
    expect(
      events
        .filter((e) => e.event === AnalyticsEvents.MCP_OAUTH_COMPLETED)
        .filter((e) => e.properties.success === true || e.properties.oauth_stage === 'consent')
        .every((e) => e.identifiedDistinctId === 'hashed-user:oauth-user')
    ).toBe(true)
    for (const event of events)
      expect(sanitizeTelemetryEvent(event.event, event.properties).droppedProperties).toEqual([])
    expect(
      events.find(
        (e) => e.event === AnalyticsEvents.MCP_OAUTH_COMPLETED && e.properties.http_status === 400
      )?.properties.success
    ).toBe(false)
    expect(JSON.stringify(events)).not.toContain('SECRET')
    expect(JSON.stringify(events)).not.toContain('private.example.com')
  })
})
