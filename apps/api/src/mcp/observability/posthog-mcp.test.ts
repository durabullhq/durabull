import { expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import {
  configureServerAnalytics,
  resetServerAnalyticsForTests,
  type ServerAnalyticsOptions,
  tryGetServerAnalyticsOptions,
} from '@durabull/analytics/server'
import { env } from '@durabull/env'
import { createMcpRoutes } from '@durabull/mcp'
import { mcpHeaders, readMcpJsonResponse } from '@durabull/mcp/testing'
import type { McpAnalyticsIdentity } from './mcp-analytics'
import { mcpAnalyticsContext } from './mcp-analytics-context'
import { instrumentMcpAnalytics, shutdownMcpAnalytics } from './posthog-mcp'

test('SDK v2 attributes concurrent tool calls to app users and organizations without capturing payloads', async () => {
  const original = {
    key: env.POSTHOG_KEY,
    host: env.POSTHOG_HOST,
    ci: env.CI,
    fetch: globalThis.fetch,
    analytics: tryGetServerAnalyticsOptions(),
  }
  const batches: Array<{
    batch: Array<{ event: string; distinct_id: string; properties: Record<string, unknown> }>
  }> = []
  const options: ServerAnalyticsOptions = {
    enabled: true,
    collectEnabled: true,
    dedupeIdentifiedPosthogEvents: true,
    disclosureUrl: 'https://durabull.io/privacy',
    collectSigningSecret: null,
    hmacSecret: null,
    durabullTelemetryPosthogKey: 'phc_test',
    durabullTelemetryPosthogHost: 'https://us.i.posthog.com',
    appPosthogKey: 'phc_test',
    appPosthogHost: 'https://us.i.posthog.com',
    cloudCollectUrl: 'https://app.durabull.io/api/telemetry/collect',
    getRuntimeContext: () => ({
      authless: false,
      env_connections: false,
      environment: 'production',
      persistence: 'postgres',
      stateless: false,
    }),
    resolveAnonymousInstanceId: async () => 'test-instance',
  }
  configureServerAnalytics(options)
  env.POSTHOG_KEY = 'phc_test'
  env.POSTHOG_HOST = 'https://us.i.posthog.com'
  env.CI = false
  globalThis.fetch = (async (_url, init) => {
    const body = init?.body
    batches.push(
      JSON.parse(
        typeof body === 'string'
          ? body
          : new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(body as Uint8Array)))
      )
    )
    return Response.json({ status: 1 })
  }) as typeof fetch
  try {
    const routes = createMcpRoutes({
      version: 'test',
      allowedHosts: new Set(['localhost:3000']),
      corsOrigins: [],
      configureServer: instrumentMcpAnalytics,
      toolHandlers: { listConnections: async () => ({ connections: [], nextCursor: null }) },
      requestContextResolver: () => ({
        principal: { type: 'service_account', principalId: 'test', organizationId: 'test' },
      }),
    })
    const callTool = async (identity: McpAnalyticsIdentity | null) => {
      const response = await mcpAnalyticsContext.run(
        { properties: {}, clientId: () => 'oauth-client', identity: () => identity },
        () =>
          routes.request('http://localhost:3000/', {
            method: 'POST',
            headers: {
              ...mcpHeaders(),
              'Mcp-Protocol-Version': '2026-07-28',
              'Mcp-Method': 'tools/call',
              'Mcp-Name': 'list_connections',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/call',
              params: {
                name: 'list_connections',
                arguments: {},
                _meta: {
                  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                  'io.modelcontextprotocol/clientCapabilities': {},
                },
              },
            }),
          })
      )
      const result = (await readMcpJsonResponse(response)) as {
        result?: { isError?: boolean }
        error?: unknown
      }
      expect(response.status).toBe(200)
      expect(result.error).toBeUndefined()
      expect(result.result?.isError).not.toBe(true)
    }
    // User attribution must work without the separate anonymous telemetry secret.
    await callTool({
      principalType: 'delegated_user',
      principalId: 'user-123',
      userId: 'user-123',
      organizationId: 'org-123',
    })
    configureServerAnalytics({ ...options, hmacSecret: 'test-secret' })
    await Promise.all([
      callTool({
        principalType: 'delegated_user',
        principalId: 'user-456',
        userId: 'user-456',
        organizationId: 'org-456',
      }),
      callTool({
        principalType: 'service_account',
        principalId: 'sa-123',
        organizationId: 'org-123',
      }),
      callTool(null),
    ])
    await shutdownMcpAnalytics()
    const events = batches
      .flatMap((batch) => batch.batch)
      .filter((event) => event.event === '$mcp_tool_call')
    expect(events).toHaveLength(4)
    for (const user of ['123', '456']) {
      const event = events.find((event) => event.distinct_id === `user-${user}`)
      expect(event).toBeDefined()
      expect(event?.properties.$groups).toEqual({ organization: `org-${user}` })
      expect(event?.properties.$process_person_profile).not.toBe(false)
    }
    const serviceAccount = events.find(
      (event) =>
        event.distinct_id ===
        createHmac('sha256', 'test-secret').update('mcp:principal:sa-123').digest('hex')
    )
    expect(serviceAccount?.properties.$groups).toEqual({ organization: 'org-123' })
    const anonymous = events.find((event) => event.distinct_id.startsWith('ses_'))
    expect(anonymous?.properties.$process_person_profile).toBe(false)
    expect(anonymous?.properties.$groups).toBeUndefined()
    for (const event of events) {
      expect(event.properties.$mcp_tool_name).toBe('list_connections')
      expect(event.properties.$mcp_server_name).toBe('durabull-mcp')
      expect(event.properties.mcp_server_instance).toBeString()
      expect(event.properties.$mcp_is_error).toBe(false)
      expect(event.properties.$mcp_parameters).toBeUndefined()
      expect(event.properties.$mcp_response).toBeUndefined()
    }
    expect(JSON.stringify(events)).not.toContain('sa-123')
    expect(JSON.stringify(events)).not.toContain('oauth-client')
  } finally {
    if (original.analytics) configureServerAnalytics(original.analytics)
    else resetServerAnalyticsForTests()
    env.POSTHOG_KEY = original.key
    env.POSTHOG_HOST = original.host
    env.CI = original.ci
    globalThis.fetch = original.fetch
  }
})
