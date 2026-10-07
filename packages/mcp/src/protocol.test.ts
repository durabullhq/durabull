import { describe, expect, it } from 'bun:test'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { MCP_APP_MIME_TYPE, MCP_APP_URI } from './apps/app-metadata'
import { createMcpBearerAuthMiddleware } from './auth'
import { MCP_LEGACY_PROTOCOL_VERSION, MCP_PROTOCOL_VERSION } from './constants'
import { getMcpRequestContext } from './request-context'
import { createMcpRoutes } from './routes'
import { parseSseJson } from './testing/mcp-test-client'

const origin = 'http://localhost:3000'
function fixture() {
  return createMcpRoutes({
    version: '2.0.0-test',
    widgetDomain: origin,
    allowedHosts: new Set(['localhost:3000']),
    corsOrigins: [origin],
    middleware: [
      createMcpBearerAuthMiddleware({
        canonicalResourceUri: `${origin}/mcp`,
        resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource`,
        requiredScopes: ['mcp:discover'],
        verifyAccessToken: async (token) =>
          token.startsWith('user-')
            ? {
                accessToken: token,
                clientId: 'test-client',
                userId: token,
                scopes: ['mcp:discover', 'mcp:jobs:read'],
                accessTokenExpiresAt: new Date(Date.now() + 60_000),
                resource: `${origin}/mcp`,
              }
            : null,
      }),
      async (c, next) => {
        // Match the API policy layer's parsed-body cache, including malformed input.
        const body = await c.req.raw
          .clone()
          .json()
          .catch(() => null)
        c.set('mcpRequestJsonBody' as never, body as never)
        await next()
      },
    ],
    requestContextResolver: (c) => ({
      principal: {
        type: 'delegated_user',
        principalId: c.req.header('authorization')!.replace('Bearer ', ''),
        userId: c.req.header('authorization')!,
      },
    }),
    toolHandlers: {
      listConnections: async () => {
        await new Promise((resolve) => setTimeout(resolve, 2))
        return {
          connections: [
            {
              id: 'one',
              name: getMcpRequestContext()?.principal?.principalId ?? 'missing',
              environment: null,
              prefix: 'bull',
              isDefault: true,
              organizationId: 'org',
            },
          ],
          nextCursor: null,
        }
      },
      pauseQueue: async ({ connectionId, queueName }) => ({
        connectionId,
        queueName,
        isPaused: true,
        changed: true,
      }),
    },
  })
}

async function connect(mode: 'auto' | 'legacy' | { pin: string }, token = 'user-one') {
  const app = fixture()
  const requests: Request[] = []
  const client = new Client(
    { name: 'durabull-conformance-test', version: '1.0.0' },
    { versionNegotiation: { mode } }
  )
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/`), {
    fetch: async (url, init) => {
      const request = new Request(url, init)
      request.headers.set('host', 'localhost:3000')
      request.headers.set('authorization', `Bearer ${token}`)
      requests.push(request.clone())
      return app.fetch(request)
    },
  })
  await client.connect(transport)
  return { client, requests, app }
}

describe('MCP protocol interoperability', () => {
  it('distinguishes malformed JSON from a JSON null request after policy inspection', async () => {
    for (const [body, code] of [
      ['{broken', -32700],
      ['null', -32600],
    ] as const) {
      const response = await fixture().request('/', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          authorization: 'Bearer user-one',
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body,
      })
      expect(response.status).toBe(400)
      const payload = parseSseJson(await response.text()) as { error: { code: number } }
      expect(payload.error.code).toBe(code)
    }
  })
  it('publishes OpenAI security schemes on the raw wire, including transport scope', async () => {
    const response = await fixture().request('/', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        authorization: 'Bearer user-one',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    const payload = parseSseJson(await response.text()) as {
      result: {
        tools: Array<{
          name: string
          securitySchemes: unknown
          _meta: { securitySchemes: unknown }
        }>
      }
    }
    const tool = payload.result.tools.find((tool) => tool.name === 'list_connections')!
    expect(tool.securitySchemes).toEqual([
      { type: 'oauth2', scopes: ['mcp:discover', 'mcp:jobs:read'] },
    ])
    expect(tool._meta.securitySchemes).toEqual(tool.securitySchemes)
  })
  for (const mode of ['legacy', 'auto', { pin: MCP_PROTOCOL_VERSION }] as const) {
    it(`serves discovery, tools, resources and prompts with ${JSON.stringify(mode)}`, async () => {
      const { client, requests } = await connect(mode)
      try {
        expect(client.getProtocolEra()).toBe(mode === 'legacy' ? 'legacy' : 'modern')
        const tools = await client.listTools()
        const opener = tools.tools.find((tool) => tool.name === 'list_connections')!
        expect(opener._meta?.ui).toEqual({ resourceUri: MCP_APP_URI, visibility: ['model', 'app'] })
        expect(opener._meta?.['openai/ui']).toEqual({
          entrypoints: [{ type: 'global' }, { type: 'thread' }],
        })
        expect(tools.tools.find((tool) => tool.name === 'pause_queue')?._meta?.ui).toMatchObject({
          visibility: ['model'],
        })
        const result = await client.callTool({ name: 'list_connections', arguments: {} })
        expect(result.isError).not.toBe(true)
        expect(result.structuredContent).toMatchObject({ connections: [{ name: 'user-one' }] })
        expect(result._meta?.['durabull/view']).toEqual({
          toolName: 'list_connections',
          arguments: {},
        })
        const resources = await client.listResources()
        expect(resources.resources.find((resource) => resource.uri === MCP_APP_URI)?.mimeType).toBe(
          MCP_APP_MIME_TYPE
        )
        const resource = await client.readResource({ uri: MCP_APP_URI })
        const html = resource.contents[0]
        expect(html.mimeType).toBe(MCP_APP_MIME_TYPE)
        expect(html._meta?.['openai/widgetDomain']).toBe(origin)
        expect(html._meta?.ui).toMatchObject({ csp: { connectDomains: [], resourceDomains: [] } })
        expect((html._meta?.ui as { domain?: string } | undefined)?.domain).toBeUndefined()
        expect('text' in html && html.text).toContain('<!doctype html>')
        const prompts = await client.listPrompts()
        expect(prompts.prompts.length).toBe(4)
        expect(
          (
            await client.getPrompt({
              name: 'connection_health_check',
              arguments: { connectionId: 'one' },
            })
          ).messages.length
        ).toBeGreaterThan(0)
        expect(requests.every((request) => !request.headers.has('mcp-session-id'))).toBe(true)
        if (mode !== 'legacy')
          expect(
            requests.some((request) => request.headers.get('Mcp-Method') === 'tools/call')
          ).toBe(true)
      } finally {
        await client.close()
      }
    })
  }

  it('keeps concurrent caller context isolated without sessions', async () => {
    const app = fixture()
    const responses = await Promise.all(
      ['user-one', 'user-two'].map(async (token) => {
        const response = await app.request('/', {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            authorization: `Bearer ${token}`,
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json',
            'mcp-protocol-version': MCP_LEGACY_PROTOCOL_VERSION,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: token,
            method: 'tools/call',
            params: { name: 'list_connections', arguments: {} },
          }),
        })
        return parseSseJson(await response.text()) as {
          result: { structuredContent: { connections: { name: string }[] } }
        }
      })
    )
    expect(
      responses.map((response) => response.result.structuredContent.connections[0].name)
    ).toEqual(['user-one', 'user-two'])
  })

  it('rejects hostile Origins and challenges unauthenticated modern discovery', async () => {
    const app = fixture()
    const response = await app.request('/', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: '{}',
    })
    expect(response.status).toBe(403)
    const unauthenticated = await app.request('/', {
      method: 'POST',
      headers: { host: 'localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover' }),
    })
    expect(unauthenticated.status).toBe(401)
    expect(unauthenticated.headers.get('www-authenticate')).toContain('resource_metadata=')
  })

  it('permits modern browser headers and rejects contradictory modern method headers', async () => {
    const app = fixture()
    const preflight = await app.request('/', {
      method: 'OPTIONS',
      headers: {
        host: 'localhost:3000',
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'mcp-method,mcp-name,mcp-protocol-version',
      },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'mcp-name'
    )
    const response = await app.request('/', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        authorization: 'Bearer user-one',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'Mcp-Protocol-Version': MCP_PROTOCOL_VERSION,
        'Mcp-Method': 'tools/call',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION,
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: { code: number } }).error.code).toBe(-32020)
  })
})
