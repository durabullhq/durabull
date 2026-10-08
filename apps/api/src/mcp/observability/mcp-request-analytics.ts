import { AnalyticsEvents } from '@durabull/analytics/events'
import { tryGetServerAnalyticsOptions } from '@durabull/analytics/server'
import { getMcpToolDefinition } from '@durabull/mcp'
import { createMiddleware } from 'hono/factory'
import { parseMcpJsonRpcMethod, parseMcpPolicyOperation } from '../json-rpc-tool-call'
import { recordMcpAnalytics, type McpAnalyticsIdentity } from './mcp-analytics'
import {
  mcpAnalyticsContext,
  mcpAnalyticsKey,
  mcpClientFamily,
  mcpClientVersion,
} from './mcp-analytics-context'

const METHODS = new Set([
  'initialize',
  'ping',
  'tools/list',
  'tools/call',
  'resources/list',
  'resources/templates/list',
  'resources/read',
  'resources/subscribe',
  'resources/unsubscribe',
  'prompts/list',
  'prompts/get',
  'completion/complete',
  'logging/setLevel',
  'notifications/initialized',
  'notifications/cancelled',
  'notifications/roots/list_changed',
  'notifications/progress',
  'notifications/message',
])

/** Inspect only bounded, finite POST responses. Never wait on an SSE subscription or delay a request. */
export async function readMcpResponseOutcome(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type') ?? ''
  if (
    !response.body ||
    (!contentType.includes('json') && !contentType.includes('text/event-stream'))
  )
    return {}
  const reader = response.clone().body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), 1000)
  })
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), timeout])
      if (!chunk) return { response_class: 'unobserved' }
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 64 * 1024) return { response_class: 'unobserved' }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    const payloads = contentType.includes('text/event-stream')
      ? text
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
      : [text]
    for (const payload of payloads.reverse()) {
      const value = JSON.parse(payload)
      if (value.error)
        return {
          response_class: 'rpc_error',
          success: false,
          rpc_error_code: typeof value.error.code === 'number' ? value.error.code : undefined,
        }
      if (value.result)
        return {
          response_class: value.result.isError ? 'tool_error' : 'success',
          success: !value.result.isError,
        }
    }
    return {}
  } catch {
    return { response_class: 'unobserved' }
  } finally {
    clearTimeout(timer)
    void reader.cancel().catch(() => {})
  }
}

export function createMcpRequestAnalyticsMiddleware() {
  return createMiddleware(async (c, next) => {
    if (!tryGetServerAnalyticsOptions()?.enabled) return next()
    // App-level coverage includes ingress limits; mount-level coverage supports standalone ingress.
    if (mcpAnalyticsContext.getStore()) return next()
    const started = performance.now()
    const requestedAt = new Date().toISOString()
    const requestKey = crypto.randomUUID()
    const context = {
      properties: {
        mcp_transport: 'streamable_http',
        mcp_request_key: mcpAnalyticsKey('request', requestKey),
        mcp_client_family: mcpClientFamily(c.req.header('user-agent')),
        mcp_protocol_version: /^\d{4}-\d{2}-\d{2}$/.test(c.req.header('mcp-protocol-version') ?? '')
          ? c.req.header('mcp-protocol-version')
          : 'unknown',
      } as Record<string, unknown>,
      clientId: () => c.get('mcpSession')?.clientId ?? c.get('mcpAnalyticsClientId'),
      clientName: () => c.get('mcpSession')?.clientName ?? c.get('mcpAnalyticsClientName'),
      connectionId: () => c.get('mcpPolicyDecision')?.connectionId ?? undefined,
      identity: (): McpAnalyticsIdentity | null => {
        const principal = c.get('mcpPrincipal')
        const session = c.get('mcpSession')
        if (!session) return null
        return {
          principalType: principal?.type ?? (session.userId ? 'delegated_user' : 'service_account'),
          principalId: principal?.principalId ?? session.clientId,
          userId: session.userId,
          organizationId: c.get('mcpPolicyDecision')?.organizationId ?? principal?.organizationId,
        }
      },
      toolOutcome: undefined as 'success' | 'tool_error' | undefined,
      redactionCount: undefined as number | undefined,
    }
    return mcpAnalyticsContext.run(context, async () => {
      try {
        await next()
      } finally {
        const status = c.error ? 500 : c.res.status
        const body = c.get('mcpRequestJsonBody')
        const method = parseMcpJsonRpcMethod(body) ?? c.req.header('mcp-method')
        const safeMethod = method && METHODS.has(method) ? method : 'unknown'
        const operation = parseMcpPolicyOperation(body)
        const name =
          operation?.name ?? (safeMethod === 'tools/call' ? c.req.header('mcp-name') : undefined)
        const toolName =
          name && (name.startsWith('resource:') || getMcpToolDefinition(name)) ? name : 'unknown'
        if (
          safeMethod === 'initialize' &&
          body &&
          typeof body === 'object' &&
          !Array.isArray(body)
        ) {
          const client = (
            body as {
              params?: {
                clientInfo?: { name?: unknown; version?: unknown }
                protocolVersion?: unknown
              }
            }
          ).params
          context.properties.mcp_client_family = mcpClientFamily(
            client?.clientInfo?.name ?? c.req.header('user-agent')
          )
          context.properties.mcp_client_version = mcpClientVersion(client?.clientInfo?.version)
          if (
            typeof client?.protocolVersion === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(client.protocolVersion)
          )
            context.properties.mcp_protocol_version = client.protocolVersion
        }
        const properties = {
          http_method: c.req.method,
          http_status: status,
          duration_ms: Math.round(performance.now() - started),
        }
        recordMcpAnalytics({ event: AnalyticsEvents.MCP_REQUEST_COMPLETED, properties })
        if (c.get('mcpSession')) {
          recordMcpAnalytics({
            event: AnalyticsEvents.MCP_AUTH_SUCCEEDED,
            properties: { auth_method: 'bearer', success: true },
          })
        }
        if (c.req.method === 'POST') {
          const rpcProperties = {
            ...properties,
            mcp_method: safeMethod,
            tool_name: operation || safeMethod === 'tools/call' ? toolName : undefined,
          }
          recordMcpAnalytics({
            event: AnalyticsEvents.MCP_RPC_REQUESTED,
            timestamp: requestedAt,
            properties: rpcProperties,
          })
          // Capture the identity now: response inspection runs asynchronously after middleware returns.
          const identity = context.identity()
          void (
            status >= 400
              ? Promise.resolve<Record<string, unknown>>({})
              : readMcpResponseOutcome(c.res)
          )
            .then((outcome) => {
              const result = {
                ...rpcProperties,
                response_class: status >= 400 ? 'http_error' : (context.toolOutcome ?? 'accepted'),
                success:
                  status >= 400
                    ? false
                    : context.toolOutcome
                      ? context.toolOutcome === 'success'
                      : undefined,
                ...(outcome.response_class === 'unobserved' && context.toolOutcome ? {} : outcome),
              }
              recordMcpAnalytics({
                event: AnalyticsEvents.MCP_RPC_COMPLETED,
                identity,
                properties: result,
              })
              if (safeMethod === 'initialize' && result.success === true) {
                recordMcpAnalytics({
                  event: AnalyticsEvents.MCP_CONNECTION_INITIALIZED,
                  identity,
                  properties: result,
                })
              }
              // SDK schema validation runs outside domain callbacks; use the final result for tool success.
              if (
                (safeMethod === 'tools/call' ||
                  (safeMethod === 'resources/read' && context.toolOutcome)) &&
                status < 400 &&
                result.success !== undefined
              ) {
                recordMcpAnalytics({
                  event: AnalyticsEvents.MCP_TOOL_CALLED,
                  identity,
                  properties: { ...result, redaction_count: context.redactionCount },
                })
              }
            })
            .catch(() => {})
        }
      }
    })
  })
}
