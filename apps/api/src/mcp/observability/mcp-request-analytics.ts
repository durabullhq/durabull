import { AnalyticsEvents } from '@durabull/analytics/events'
import {
  PostHogMCPAnalyticsEvent as E,
  PostHogMCPAnalyticsProperty as P,
} from '@durabull/analytics/mcp'
import { tryGetServerAnalyticsOptions } from '@durabull/analytics/server'
import { getMcpToolDefinition, MCP_PROMPT_NAMES, parseMcpResourceUri } from '@durabull/mcp'
import { createMiddleware } from 'hono/factory'
import { parseMcpJsonRpcMethod, parseMcpPolicyOperation } from '../json-rpc-tool-call'
import { type McpAnalyticsIdentity, recordMcpAnalytics } from './mcp-analytics'
import {
  mcpAnalyticsContext,
  mcpAnalyticsKey,
  mcpClientFamily,
  mcpClientMetadata,
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
          ...(typeof value.result.protocolVersion === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(value.result.protocolVersion)
            ? { [P.ProtocolVersion]: value.result.protocolVersion }
            : {}),
          [P.ListedToolNames]: Array.isArray(value.result.tools)
            ? value.result.tools
                .slice(0, 100)
                .map((tool: { name?: unknown }) => tool.name)
                .filter((name: unknown) => typeof name === 'string' && !!getMcpToolDefinition(name))
            : undefined,
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
        [P.SessionId]: `ses_${(mcpAnalyticsKey('session', c.req.header('mcp-session-id') ?? requestKey) ?? requestKey.replaceAll('-', '')).slice(0, 32)}`,
        [P.ClientUserAgent]: mcpClientMetadata(c.req.header('user-agent')),
        [P.VendorClient]: mcpClientMetadata(c.req.header('x-anthropic-client')),
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
        const params =
          body && typeof body === 'object' && !Array.isArray(body)
            ? (body as { params?: Record<string, unknown> }).params
            : undefined
        const meta = params?._meta as Record<string, unknown> | undefined
        const envelope =
          body && typeof body === 'object'
            ? (body as { _meta?: Record<string, unknown> })._meta
            : undefined
        const envelopeClient = envelope?.['io.modelcontextprotocol/clientInfo'] as
          | { name?: unknown; version?: unknown }
          | undefined
        const metaClient = meta?.['io.modelcontextprotocol/clientInfo'] as
          | { name?: unknown; version?: unknown }
          | undefined
        const clientInfo = {
          name: envelopeClient?.name ?? metaClient?.name,
          version: envelopeClient?.version ?? metaClient?.version,
        }
        const revision =
          envelope?.['io.modelcontextprotocol/protocolVersion'] ??
          meta?.['io.modelcontextprotocol/protocolVersion']
        if (typeof revision === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(revision))
          context.properties.mcp_protocol_version = revision
        context.properties[P.ClientName] = mcpClientMetadata(
          clientInfo?.name ?? context.clientName()
        )
        context.properties[P.ClientVersion] = mcpClientVersion(clientInfo?.version)
        const codex = meta?.['x-codex-turn-metadata'] as { model?: unknown } | undefined
        if (
          typeof codex?.model === 'string' &&
          /^[a-zA-Z0-9._-]{1,128}$/.test(codex.model) &&
          codex.model !== 'unknown'
        ) {
          context.properties[P.LlmModel] = codex.model
          context.properties[P.LlmModelSource] = 'client_metadata'
        }
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
          context.properties[P.ClientName] = mcpClientMetadata(client?.clientInfo?.name)
          context.properties[P.ClientVersion] = mcpClientVersion(client?.clientInfo?.version)
          if (
            typeof client?.protocolVersion === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(client.protocolVersion)
          )
            context.properties.mcp_protocol_version = client.protocolVersion
        }
        context.properties[P.ProtocolVersion] = context.properties.mcp_protocol_version
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
              if (safeMethod === 'initialize') {
                recordMcpAnalytics({
                  event: AnalyticsEvents.MCP_CONNECTION_INITIALIZED,
                  identity,
                  properties: result,
                })
              }
              // Canonical events cover requests rejected before a handler and final SDK errors.
              const event = (
                {
                  'tools/call': E.ToolCall,
                  'tools/list': E.ToolsList,
                  'resources/read': E.ResourceRead,
                  'resources/list': E.ResourcesList,
                  'resources/templates/list': E.ResourcesList,
                  'prompts/list': E.PromptsList,
                  'prompts/get': E.PromptGet,
                } as Record<string, string>
              )[safeMethod]
              if (event) {
                const resource = parseMcpResourceUri(params?.uri)
                const canonical = {
                  ...result,
                  [P.ListedToolNames]:
                    safeMethod === 'tools/list' ? outcome[P.ListedToolNames] : undefined,
                  [P.DurationMs]: properties.duration_ms,
                  [P.IsError]: typeof result.success === 'boolean' ? !result.success : undefined,
                  [P.ErrorType]: result.success === false ? result.response_class : undefined,
                  [P.ResourceName]:
                    safeMethod === 'resources/read'
                      ? (resource?.definition.uriTemplate ?? 'unknown')
                      : safeMethod === 'prompts/get'
                        ? typeof params?.name === 'string' &&
                          (MCP_PROMPT_NAMES as readonly string[]).includes(params.name)
                          ? params.name
                          : 'unknown'
                        : undefined,
                  redaction_count: context.redactionCount,
                }
                recordMcpAnalytics({ event, identity, properties: canonical })
              }
            })
            .catch(() => {})
        }
      }
    })
  })
}

/** Install after Host/Origin/body limits and before authentication to attribute rejected calls. */
export function createMcpRequestBodyAnalyticsMiddleware() {
  return createMiddleware(async (c, next) => {
    if (tryGetServerAnalyticsOptions()?.enabled && c.req.method === 'POST') {
      if (!c.req.raw.body) {
        c.set('mcpRequestJsonBody', null)
        return next()
      }
      const [handlerBody, analyticsBody] = c.req.raw.body.tee()
      c.req.raw = new Request(c.req.raw, { body: handlerBody })
      const reader = analyticsBody.getReader()
      const timedOut = Symbol('mcp-request-body-timeout')
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(() => resolve(timedOut), 1000)
      })
      let rejected = false
      try {
        const decoder = new TextDecoder()
        let bytes = 0
        let text = ''
        while (true) {
          const chunk = await Promise.race([reader.read(), timeout])
          if (chunk === timedOut) {
            rejected = true
            return c.json({ error: 'Request Timeout', message: 'Request body read timed out' }, 408)
          }
          if (chunk.done) break
          bytes += chunk.value.byteLength
          if (bytes > 1024 * 1024) {
            rejected = true
            return c.json(
              { error: 'Payload Too Large', message: 'Request body exceeds 1MB limit' },
              413
            )
          }
          text += decoder.decode(chunk.value, { stream: true })
        }
        c.set('mcpRequestJsonBody', JSON.parse(text + decoder.decode()))
      } catch (error) {
        if (error instanceof Error && error.name === 'BodyLimitError') {
          rejected = true
          return c.json(
            { error: 'Payload Too Large', message: 'Request body exceeds 1MB limit' },
            413
          )
        }
        // The untouched handler branch preserves SDK syntax-error handling.
        c.set('mcpRequestJsonBody', null)
      } finally {
        clearTimeout(timer)
        void reader.cancel().catch(() => {})
        // Cancelling both explicit tee branches releases a rejected upload's source.
        if (rejected) void handlerBody.cancel().catch(() => {})
      }
    }
    await next()
  })
}
