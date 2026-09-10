import { describe, expect, it } from 'bun:test'

import { createMcpBearerAuthMiddleware, MCP_SCOPE_DISCOVER } from './auth'
import { MCP_PROTOCOL_VERSION } from './constants'
import { createMcpRoutes } from './routes'
import { MCP_JSON_RPC_VERSION, postMcpJson, readMcpJsonResponse } from './testing/mcp-test-client'

const canonicalResourceUri = 'http://localhost:3000/mcp'
const resourceMetadataUrl = 'http://localhost:3000/.well-known/oauth-protected-resource'
const validAuthorization = 'Bearer valid'

function createTestAuthMiddleware() {
  return createMcpBearerAuthMiddleware({
    canonicalResourceUri,
    resourceMetadataUrl,
    requiredScopes: [MCP_SCOPE_DISCOVER],
    verifyAccessToken: async (token) => {
      if (token === 'valid') {
        return {
          accessToken: token,
          clientId: 'client',
          userId: 'user',
          scopes: [MCP_SCOPE_DISCOVER],
          accessTokenExpiresAt: new Date(Date.now() + 60_000),
          resource: canonicalResourceUri,
        }
      }
      return null
    },
  })
}

describe('createMcpRoutes', () => {
  const app = createMcpRoutes({
    version: 'test',
    allowedHosts: new Set(['localhost', '127.0.0.1', 'localhost:3000']),
    corsOrigins: ['http://localhost:3000'],
    middleware: [createTestAuthMiddleware()],
  })

  const postMcp = (
    body: Parameters<typeof postMcpJson>[2],
    options?: Parameters<typeof postMcpJson>[3]
  ) =>
    postMcpJson((path, init) => Promise.resolve(app.request(path, init)), '/', body, {
      authorization: validAuthorization,
      ...options,
    })

  it('returns 401 without bearer token', async () => {
    const response = await postMcp(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      },
      { authorization: undefined }
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain(resourceMetadataUrl)
  })

  it('rejects invalid Host header with 403', async () => {
    const response = await postMcp(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      },
      { host: 'evil.example.com' }
    )

    expect(response.status).toBe(403)
  })

  it('rejects host header with fake port suffix', async () => {
    const response = await postMcp(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      },
      { host: 'localhost:3000.evil' }
    )

    expect(response.status).toBe(403)
  })

  it('requires session id for non-initialize requests', async () => {
    const response = await postMcp({
      jsonrpc: MCP_JSON_RPC_VERSION,
      id: 2,
      method: 'tools/list',
      params: {},
    })

    expect(response.status).toBe(400)
  })

  it('initializes MCP session and lists ping tool', async () => {
    const initResponse = await postMcp({
      jsonrpc: MCP_JSON_RPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    })

    expect(initResponse.status).toBe(200)
    const initPayload = (await readMcpJsonResponse(initResponse)) as {
      result?: { protocolVersion?: string }
    }
    expect(initPayload.result?.protocolVersion).toBeTruthy()

    const sessionId = initResponse.headers.get('mcp-session-id')
    expect(sessionId).toBeTruthy()

    await postMcp(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        method: 'notifications/initialized',
      },
      { sessionId: sessionId ?? undefined }
    )

    const listResponse = await postMcp(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 2,
        method: 'tools/list',
        params: {},
      },
      { sessionId: sessionId ?? undefined }
    )

    expect(listResponse.status).toBe(200)
    const listPayload = (await readMcpJsonResponse(listResponse)) as {
      result?: { tools?: Array<{ name: string }> }
    }
    expect(listPayload.result?.tools?.map((tool) => tool.name)).toContain('ping')
  })

  it('calls ping and returns pong', async () => {
    const initResponse = await postMcp({
      jsonrpc: MCP_JSON_RPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    })

    const sessionId = initResponse.headers.get('mcp-session-id')
    expect(sessionId).toBeTruthy()

    await postMcp(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        method: 'notifications/initialized',
      },
      { sessionId: sessionId ?? undefined }
    )

    const callResponse = await postMcp(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 3,
        method: 'tools/call',
        params: {
          name: 'ping',
          arguments: {},
        },
      },
      { sessionId: sessionId ?? undefined }
    )

    expect(callResponse.status).toBe(200)
    const callPayload = (await readMcpJsonResponse(callResponse)) as {
      result?: { content?: Array<{ type: string; text?: string }> }
    }
    expect(callPayload.result?.content?.[0]?.text).toBe('pong')
  })

  it('returns isError envelope for typed tool not_found errors', async () => {
    class NotFoundToolError extends Error {
      readonly code = 'not_found'
    }

    const appWithReadTool = createMcpRoutes({
      version: 'test',
      allowedHosts: new Set(['localhost', '127.0.0.1', 'localhost:3000']),
      corsOrigins: ['http://localhost:3000'],
      middleware: [createTestAuthMiddleware()],
      requestContextResolver: () => ({
        principal: {
          type: 'delegated_user',
          principalId: 'principal-test',
          userId: 'user',
        },
        correlationId: 'corr-test',
      }),
      toolHandlers: {
        listConnections: async () => {
          throw new NotFoundToolError('Connection missing for test')
        },
      },
    })

    const postMcpReadTool = (
      body: Parameters<typeof postMcpJson>[2],
      options?: Parameters<typeof postMcpJson>[3]
    ) =>
      postMcpJson((path, init) => Promise.resolve(appWithReadTool.request(path, init)), '/', body, {
        authorization: validAuthorization,
        ...options,
      })

    const initResponse = await postMcpReadTool({
      jsonrpc: MCP_JSON_RPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    })

    const sessionId = initResponse.headers.get('mcp-session-id')
    expect(sessionId).toBeTruthy()

    await postMcpReadTool(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        method: 'notifications/initialized',
      },
      { sessionId: sessionId ?? undefined }
    )

    const callResponse = await postMcpReadTool(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 2,
        method: 'tools/call',
        params: {
          name: 'list_connections',
          arguments: {
            pageSize: 10,
          },
        },
      },
      { sessionId: sessionId ?? undefined }
    )

    expect(callResponse.status).toBe(200)
    const payload = (await readMcpJsonResponse(callResponse)) as {
      result?: {
        isError?: boolean
        content?: Array<{ type: string; text?: string }>
      }
    }
    expect(payload.result?.isError).toBe(true)
    const errorPayload = JSON.parse(payload.result?.content?.[0]?.text ?? '{}') as {
      error?: { code?: string; message?: string }
    }
    expect(errorPayload.error?.code).toBe('not_found')
    expect(errorPayload.error?.message).toBe('Connection missing for test')
  })
})

describe('createMcpRoutes catalog surface', () => {
  const app = createMcpRoutes({
    version: 'test',
    allowedHosts: new Set(['localhost', '127.0.0.1', 'localhost:3000']),
    corsOrigins: ['http://localhost:3000'],
    middleware: [createTestAuthMiddleware()],
    requestContextResolver: () => ({
      principal: {
        type: 'delegated_user',
        principalId: 'principal-test',
        userId: 'user',
      },
      correlationId: 'corr-test',
      grantedScopes: ['mcp:discover', 'mcp:jobs:read'],
    }),
    toolHandlers: {
      listConnections: async () => ({
        connections: [
          {
            id: 'conn-1',
            name: 'Primary',
            environment: 'production',
            prefix: 'bull',
            isDefault: true,
            organizationId: 'org-1',
          },
        ],
        nextCursor: null,
      }),
      getQueue: async (input) => ({
        connectionId: input.connectionId,
        name: input.queueName,
        status: 'active',
        isPaused: false,
        scheduledJobsCount: 0,
        jobCounts: {
          waiting: 1,
          active: 0,
          delayed: 0,
          completed: 5,
          failed: 2,
          paused: 0,
          prioritized: 0,
        },
        workers: [],
      }),
      pauseQueue: async (input) => ({
        connectionId: input.connectionId,
        queueName: input.queueName,
        isPaused: true,
        changed: true,
      }),
    },
  })

  const post = (
    body: Parameters<typeof postMcpJson>[2],
    options?: Parameters<typeof postMcpJson>[3]
  ) =>
    postMcpJson((path, init) => Promise.resolve(app.request(path, init)), '/', body, {
      authorization: validAuthorization,
      ...options,
    })

  async function initialize(): Promise<string> {
    const initResponse = await post({
      jsonrpc: MCP_JSON_RPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    })
    const sessionId = initResponse.headers.get('mcp-session-id')
    expect(sessionId).toBeTruthy()
    await post(
      { jsonrpc: MCP_JSON_RPC_VERSION, method: 'notifications/initialized' },
      { sessionId: sessionId ?? undefined }
    )
    return sessionId as string
  }

  it('lists tools with descriptions, annotations, and schemas', async () => {
    const sessionId = await initialize()
    const response = await post(
      { jsonrpc: MCP_JSON_RPC_VERSION, id: 2, method: 'tools/list', params: {} },
      { sessionId }
    )
    const payload = (await readMcpJsonResponse(response)) as {
      result?: {
        tools?: Array<{
          name: string
          title?: string
          description?: string
          inputSchema?: { properties?: Record<string, { description?: string }> }
          outputSchema?: unknown
          annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
        }>
      }
    }
    const tools = payload.result?.tools ?? []
    const names = tools.map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining(['ping', 'list_connections', 'get_queue', 'pause_queue'])
    )
    // Tools without handlers are not advertised.
    expect(names).not.toContain('list_jobs')

    const getQueue = tools.find((tool) => tool.name === 'get_queue')
    expect(getQueue?.title).toBe('Get queue')
    expect(getQueue?.description).toContain('Requires scope: mcp:jobs:read')
    expect(getQueue?.annotations?.readOnlyHint).toBe(true)
    expect(getQueue?.annotations?.destructiveHint).toBe(false)
    expect(getQueue?.inputSchema?.properties?.connectionId?.description).toContain(
      'list_connections'
    )
    expect(getQueue?.outputSchema).toBeDefined()

    const pauseQueue = tools.find((tool) => tool.name === 'pause_queue')
    expect(pauseQueue?.annotations?.readOnlyHint).toBe(false)
    expect(pauseQueue?.description).toContain('mcp:queues:pause')
  })

  it('returns structuredContent alongside text for catalog tools', async () => {
    const sessionId = await initialize()
    const response = await post(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 3,
        method: 'tools/call',
        params: { name: 'get_queue', arguments: { connectionId: 'conn-1', queueName: 'email' } },
      },
      { sessionId }
    )
    expect(response.status).toBe(200)
    const payload = (await readMcpJsonResponse(response)) as {
      result?: {
        isError?: boolean
        content?: Array<{ text?: string }>
        structuredContent?: { name?: string; jobCounts?: { failed?: number } }
      }
      error?: unknown
    }
    expect(payload.error).toBeUndefined()
    expect(payload.result?.isError).toBeUndefined()
    expect(payload.result?.structuredContent?.name).toBe('email')
    expect(payload.result?.structuredContent?.jobCounts?.failed).toBe(2)
    expect(JSON.parse(payload.result?.content?.[0]?.text ?? '{}').name).toBe('email')
  })

  it('rejects invalid arguments before invoking the handler', async () => {
    const sessionId = await initialize()
    const response = await post(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 4,
        method: 'tools/call',
        params: { name: 'get_queue', arguments: { connectionId: 'conn-1' } },
      },
      { sessionId }
    )
    const payload = (await readMcpJsonResponse(response)) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> }
      error?: { code?: number }
    }
    const rejected = payload.error !== undefined || payload.result?.isError === true
    expect(rejected).toBe(true)
  })

  it('serves resources and prompts from the catalog', async () => {
    const sessionId = await initialize()

    const listResponse = await post(
      { jsonrpc: MCP_JSON_RPC_VERSION, id: 5, method: 'resources/list', params: {} },
      { sessionId }
    )
    const listPayload = (await readMcpJsonResponse(listResponse)) as {
      result?: { resources?: Array<{ uri: string; name: string }> }
    }
    expect(listPayload.result?.resources?.map((resource) => resource.uri)).toEqual(
      expect.arrayContaining(['durabull://server', 'durabull://connections'])
    )

    const templatesResponse = await post(
      { jsonrpc: MCP_JSON_RPC_VERSION, id: 6, method: 'resources/templates/list', params: {} },
      { sessionId }
    )
    const templatesPayload = (await readMcpJsonResponse(templatesResponse)) as {
      result?: { resourceTemplates?: Array<{ uriTemplate: string }> }
    }
    expect(
      templatesPayload.result?.resourceTemplates?.map((template) => template.uriTemplate)
    ).toContain('durabull://connections/{connectionId}/queues/{queueName}')

    const serverResponse = await post(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 7,
        method: 'resources/read',
        params: { uri: 'durabull://server' },
      },
      { sessionId }
    )
    const serverPayload = (await readMcpJsonResponse(serverResponse)) as {
      result?: { contents?: Array<{ uri: string; mimeType?: string; text?: string }> }
    }
    const serverInfo = JSON.parse(serverPayload.result?.contents?.[0]?.text ?? '{}') as {
      grantedScopes?: string[]
      tools?: Array<{ name: string }>
      prompts?: Array<{ name: string }>
    }
    expect(serverPayload.result?.contents?.[0]?.mimeType).toBe('application/json')
    expect(serverInfo.grantedScopes).toEqual(['mcp:discover', 'mcp:jobs:read'])
    expect(serverInfo.tools?.map((tool) => tool.name)).toContain('explain_job_failure')
    expect(serverInfo.prompts?.map((prompt) => prompt.name)).toContain('triage_failed_jobs')

    const queueResponse = await post(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 8,
        method: 'resources/read',
        params: { uri: 'durabull://connections/conn-1/queues/email' },
      },
      { sessionId }
    )
    const queuePayload = (await readMcpJsonResponse(queueResponse)) as {
      result?: { contents?: Array<{ text?: string }> }
    }
    expect(JSON.parse(queuePayload.result?.contents?.[0]?.text ?? '{}').name).toBe('email')

    const promptsResponse = await post(
      { jsonrpc: MCP_JSON_RPC_VERSION, id: 9, method: 'prompts/list', params: {} },
      { sessionId }
    )
    const promptsPayload = (await readMcpJsonResponse(promptsResponse)) as {
      result?: {
        prompts?: Array<{ name: string; arguments?: Array<{ name: string; required?: boolean }> }>
      }
    }
    const triage = promptsPayload.result?.prompts?.find(
      (prompt) => prompt.name === 'triage_failed_jobs'
    )
    expect(triage?.arguments?.find((argument) => argument.name === 'connectionId')?.required).toBe(
      true
    )

    const promptResponse = await post(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 10,
        method: 'prompts/get',
        params: {
          name: 'investigate_queue_backlog',
          arguments: { connectionId: 'conn-1', queueName: 'email' },
        },
      },
      { sessionId }
    )
    const promptPayload = (await readMcpJsonResponse(promptResponse)) as {
      result?: { messages?: Array<{ role: string; content: { text?: string } }> }
    }
    expect(promptPayload.result?.messages?.[0]?.content.text).toContain('get_queue_metrics')
  })
})
