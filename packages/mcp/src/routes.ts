import { createMcpHandler } from '@modelcontextprotocol/server'
import type { Context, MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { createHostValidationMiddleware } from './middleware/host-validation'
import { type McpRequestContext, runWithMcpRequestContext } from './request-context'
import { createMcpServer } from './server/create-mcp-server'
import type { RegisterToolsOptions } from './tools/register-tools'

export interface CreateMcpRoutesOptions {
  /** App version reported in MCP server metadata. */
  version: string
  /** Dedicated OpenAI widget origin. Standard ui.domain stays host-managed for Claude. */
  widgetDomain?: string
  /** Host allowlist (required — set at API ingress from APP_BASE_URL). */
  allowedHosts: ReadonlySet<string>
  /** CORS origins for /mcp. */
  corsOrigins: string[]
  /**
   * Middleware applied after host validation and body limit.
   * PR-03: bearer token validation goes here.
   */
  middleware?: MiddlewareHandler[]
  /** Observability boundary; must not parse bodies before host and size validation. */
  observabilityMiddleware?: MiddlewareHandler
  /** Domain handlers for catalog tools. Tools without a handler are not registered. */
  toolHandlers?: RegisterToolsOptions
  /** Optional request-scoped context resolver used by MCP tool handlers. */
  requestContextResolver?: (context: Context) => McpRequestContext | undefined
  /** When false, only exact host entries match (recommended for production). */
  allowHostnameWithoutPort?: boolean
}

/** Serve stateless MCP requests after Host, Origin, body-size, and optional bearer validation. */
export function createMcpRoutes(options: CreateMcpRoutesOptions): Hono {
  // A fresh server per request supports the 2026 protocol and stateless legacy clients.
  // No bearer token, principal or domain data is retained in a transport session.
  const handler = createMcpHandler(
    () =>
      createMcpServer({
        version: options.version,
        toolHandlers: options.toolHandlers,
        widgetDomain: options.widgetDomain,
      }),
    { legacy: 'stateless', maxRequestBodySize: 1024 * 1024, maxSubscriptions: 0 }
  )

  const routes = new Hono()
  if (options.observabilityMiddleware) routes.use('*', options.observabilityMiddleware)

  // CORS controls browser access to responses; it does not reject hostile origins.
  routes.use('*', async (c, next) => {
    const origin = c.req.header('origin')
    if (origin && !options.corsOrigins.includes(origin)) {
      return c.json({ error: 'Forbidden', message: 'Origin is not allowed' }, 403)
    }
    await next()
  })

  routes.use(
    '*',
    createHostValidationMiddleware(options.allowedHosts, {
      allowHostnameWithoutPort: options.allowHostnameWithoutPort,
    })
  )

  routes.use(
    '*',
    cors({
      origin: options.corsOrigins,
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'Accept',
        'mcp-session-id',
        'Mcp-Protocol-Version',
        'Mcp-Method',
        'Mcp-Name',
        'Mcp-Param-Uri',
        'Last-Event-ID',
      ],
      exposeHeaders: ['Mcp-Protocol-Version', 'WWW-Authenticate', 'Retry-After'],
    })
  )

  routes.use(
    '*',
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) =>
        c.json({ error: 'Payload Too Large', message: 'Request body exceeds 1MB limit' }, 413),
    })
  )

  for (const middleware of options.middleware ?? []) {
    routes.use('*', middleware)
  }

  routes.all('/', async (c) => {
    c.header('Cache-Control', 'no-store')
    c.header('X-Accel-Buffering', 'no')
    // The policy cache uses null for failed JSON parsing. Let the SDK reparse the
    // untouched raw request in that case so syntax errors keep JSON-RPC -32700.
    const parsedBody = c.get('mcpRequestJsonBody' as never) ?? undefined
    return runWithMcpRequestContext(options.requestContextResolver?.(c), () =>
      handler.fetch(c.req.raw, { parsedBody })
    )
  })

  return routes
}
