import { StreamableHTTPTransport } from '@hono/mcp'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { MCP_JSON_RPC_VERSION } from '../constants'
import { runWithMcpRequestContext, type McpRequestContext } from '../request-context'
import { createMcpServer, type CreateMcpServerOptions } from '../server/create-mcp-server'

const MAX_ACTIVE_SESSIONS = 256

interface McpSessionEntry {
  transport: StreamableHTTPTransport
  server: McpServer
  connected: Promise<void>
}

export interface McpSessionRegistryOptions {
  version: string
  allowedHosts: ReadonlySet<string>
  serverOptions?: Omit<CreateMcpServerOptions, 'version'>
}

function getCachedJsonBody(c: Context): unknown {
  try {
    return c.get('mcpRequestJsonBody' as never)
  } catch {
    return undefined
  }
}

export function createMcpSessionRegistry(options: McpSessionRegistryOptions) {
  const sessions = new Map<string, McpSessionEntry>()
  const allowedHostList = [...options.allowedHosts]

  async function teardownSession(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId)
    if (!session) return

    sessions.delete(sessionId)
    try {
      await session.server.close()
    } catch {
      // Session already torn down.
    }
  }

  function createSessionEntry(): McpSessionEntry {
    const server = createMcpServer({ version: options.version, ...options.serverOptions })
    let entry: McpSessionEntry

    const transport = new StreamableHTTPTransport({
      sessionIdGenerator: () => {
        const sessionId = crypto.randomUUID()
        sessions.set(sessionId, entry)
        return sessionId
      },
      enableDnsRebindingProtection: true,
      allowedHosts: allowedHostList,
      onsessioninitialized: async () => {
        // Session registered synchronously in sessionIdGenerator.
      },
      onsessionclosed: async (sessionId) => {
        await teardownSession(sessionId)
      },
    })

    const connected = server.connect(transport)
    entry = { transport, server, connected }
    return entry
  }

  async function requestIsInitialize(c: Context): Promise<boolean> {
    if (c.req.method !== 'POST') {
      return false
    }

    const cachedBody = getCachedJsonBody(c)
    if (cachedBody && typeof cachedBody === 'object' && !Array.isArray(cachedBody)) {
      return (cachedBody as { method?: string }).method === 'initialize'
    }

    try {
      const body = (await c.req.raw.clone().json()) as { method?: string }
      return body.method === 'initialize'
    } catch {
      return false
    }
  }

  async function evictOldestSessionIfNeeded(): Promise<void> {
    if (sessions.size < MAX_ACTIVE_SESSIONS) {
      return
    }

    const oldestSessionId = sessions.keys().next().value
    if (oldestSessionId) {
      await teardownSession(oldestSessionId)
    }
  }

  async function handleRequest(
    c: Context,
    requestContext?: McpRequestContext
  ): Promise<Response | undefined> {
    const sessionId = c.req.header('mcp-session-id')

    try {
      if (sessionId) {
        const session = sessions.get(sessionId)
        if (!session) {
          return jsonRpcErrorResponse(404, 'Session not found')
        }

        await session.connected
        return runWithMcpRequestContext(requestContext, () => session.transport.handleRequest(c))
      }

      const isInitialize = await requestIsInitialize(c)
      if (!isInitialize) {
        return jsonRpcErrorResponse(
          -32_000,
          'Mcp-Session-Id header is required for non-initialize requests',
          400
        )
      }

      await evictOldestSessionIfNeeded()
      const session = createSessionEntry()
      await session.connected
      return runWithMcpRequestContext(requestContext, () => session.transport.handleRequest(c))
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('[mcp] Request failed:', error)
      return jsonRpcErrorResponse(-32603, 'Internal error')
    }
  }

  return { handleRequest }
}

function jsonRpcErrorResponse(code: number, message: string, httpStatus?: number): Response {
  const status = httpStatus ?? (code === 404 ? 404 : code === -32_000 ? 400 : code < 0 ? 500 : code)

  return Response.json(
    {
      jsonrpc: MCP_JSON_RPC_VERSION,
      error: { code, message },
      id: null,
    },
    { status }
  )
}
