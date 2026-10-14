import { expect, test } from 'bun:test'
import { env } from '@durabull/env'
import { createMcpRoutes } from '@durabull/mcp'
import { mcpHeaders, readMcpJsonResponse } from '@durabull/mcp/testing'
import { instrumentMcpAnalytics, shutdownMcpAnalytics } from './posthog-mcp'

test('SDK v2 captures a read-only tool call and shutdown flushes metadata without payloads', async () => {
  const original = {
    key: env.POSTHOG_KEY,
    host: env.POSTHOG_HOST,
    ci: env.CI,
    fetch: globalThis.fetch,
  }
  const batches: Array<{ batch: Array<{ event: string; properties: Record<string, unknown> }> }> =
    []
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
    const response = await routes.request('http://localhost:3000/', {
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
    const result = (await readMcpJsonResponse(response)) as {
      result?: { isError?: boolean }
      error?: unknown
    }
    expect({ status: response.status, result }).toMatchObject({ status: 200 })
    expect(result.error).toBeUndefined()
    expect(result.result?.isError).not.toBe(true)
    await shutdownMcpAnalytics()
    const events = batches
      .flatMap((batch) => batch.batch)
      .filter((event) => event.event === '$mcp_tool_call')
    expect(events).toHaveLength(1)
    expect(events[0]?.properties.$mcp_tool_name).toBe('list_connections')
    expect(events[0]?.properties.$mcp_server_name).toBe('durabull-mcp')
    expect(events[0]?.properties.mcp_server_instance).toBeString()
    expect(events[0]?.properties.$mcp_is_error).toBe(false)
    expect(events[0]?.properties.$mcp_parameters).toBeUndefined()
    expect(events[0]?.properties.$mcp_response).toBeUndefined()
  } finally {
    env.POSTHOG_KEY = original.key
    env.POSTHOG_HOST = original.host
    env.CI = original.ci
    globalThis.fetch = original.fetch
  }
})
