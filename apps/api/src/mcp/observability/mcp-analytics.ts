import { AnalyticsEvents, AnalyticsProperties } from '@durabull/analytics/events'
import {
  PostHogMCPAnalyticsProperty as P,
  POSTHOG_MCP_ANALYTICS_SOURCE,
} from '@durabull/analytics/mcp'
import {
  captureMcpAnalyticsServerEvent,
  hashMcpAnalyticsSessionId,
  resolveIdentifiedDistinctIds,
  shouldDedupeIdentifiedPosthogEvents,
  tryGetServerAnalyticsOptions,
} from '@durabull/analytics/server'
import type { McpPrincipalType } from '@durabull/dal'
import { getMcpToolDefinition, MCP_SERVER_NAME } from '@durabull/mcp'
import { APP_VERSION } from '../../lib/build-info'
import {
  mcpAnalyticsContext,
  mcpAnalyticsKey,
  mcpClientFamily,
  mcpClientMetadata,
} from './mcp-analytics-context'
import { enqueueMcpAnalytics } from './mcp-analytics-queue'
import type { McpTelemetrySignal } from './mcp-telemetry-signals'

export interface McpAnalyticsIdentity {
  principalType: McpPrincipalType
  principalId: string
  userId?: string | null
  organizationId?: string | null
}

export interface McpAnalyticsInput {
  event: string
  properties?: Record<string, unknown>
  identity?: McpAnalyticsIdentity | null
  sessionKey?: string
  timestamp?: string
}

function categorizeDenialReason(reason: string | null | undefined): string {
  if (!reason) return 'unknown'
  const normalized = reason.toLowerCase()
  if (normalized.includes('missing_scopes') || normalized.includes('scope')) return 'scope'
  if (normalized.includes('connection')) return 'connection'
  if (normalized.includes('principal')) return 'principal'
  if (normalized.includes('org')) return 'organization'
  return 'policy'
}

function buildBaseProperties(properties: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [AnalyticsProperties.SERVER_VERSION]: APP_VERSION,
    [P.Source]: POSTHOG_MCP_ANALYTICS_SOURCE,
    [P.ServerName]: MCP_SERVER_NAME,
    [P.ServerVersion]: APP_VERSION,
    ...properties,
  }
}

async function processMcpAnalytics(input: McpAnalyticsInput): Promise<void> {
  const options = tryGetServerAnalyticsOptions()
  if (!options?.enabled) return

  const properties = buildBaseProperties(input.properties)
  const identity = input.identity ?? null
  const identified = identity
    ? resolveIdentifiedDistinctIds({
        userId: identity.userId,
        organizationId: identity.organizationId,
      })
    : { distinctId: null, organizationGroup: null }
  if (identity?.principalType === 'service_account' && !identity.userId) {
    identified.distinctId = mcpAnalyticsKey('principal', identity.principalId) ?? null
  }
  const hasIdentifiedIdentity = identified.distinctId != null
  const shouldSkipAnonymous = shouldDedupeIdentifiedPosthogEvents() && hasIdentifiedIdentity

  const includeAnonymous = !shouldSkipAnonymous
  const anonymousInstanceId = includeAnonymous
    ? await options.resolveAnonymousInstanceId()
    : undefined
  const secret = options.hmacSecret
  const sessionId =
    input.sessionKey ??
    (typeof properties[P.SessionId] === 'string'
      ? (properties[P.SessionId] as string)
      : undefined) ??
    (identity && secret ? hashMcpAnalyticsSessionId(identity.principalId, secret) : 'mcp-server')

  await captureMcpAnalyticsServerEvent({
    event: input.event,
    properties,
    includeAnonymous,
    anonymousInstanceId,
    sessionId,
    identifiedDistinctId: identified.distinctId,
    // Pass the raw org id; captureMcpAnalyticsServerEvent hashes it once for
    // the PostHog group. Passing identified.organizationGroup (already hashed)
    // would double-hash and break org correlation.
    organizationId: identity?.organizationId ?? null,
    timestamp: input.timestamp,
  })
}

export function recordMcpAnalytics(input: McpAnalyticsInput): void {
  const context = mcpAnalyticsContext.getStore()
  const contextIdentity = context?.identity()
  const identity = input.identity
    ? {
        ...input.identity,
        principalId: input.identity.principalId,
        userId: input.identity.userId ?? contextIdentity?.userId,
        organizationId: input.identity.organizationId ?? contextIdentity?.organizationId,
      }
    : (contextIdentity ?? null)
  const family = mcpClientFamily(context?.clientName?.())
  const properties: Record<string, unknown> = {
    [P.ClientName]: mcpClientMetadata(context?.clientName?.()),
    ...context?.properties,
    ...input.properties,
  }
  if (
    typeof properties.tool_name === 'string' &&
    !properties.tool_name.startsWith('resource:') &&
    !getMcpToolDefinition(properties.tool_name)
  )
    properties.tool_name = 'unknown'
  if (input.event === AnalyticsEvents.MCP_TOOL_CALLED) {
    properties[P.ToolName] = properties.tool_name
    properties[P.ResourceName] = properties.tool_name
  }
  if (input.event.startsWith('$mcp_')) {
    if (typeof properties.success === 'boolean') properties[P.IsError] = !properties.success
    if (typeof properties.duration_ms === 'number')
      properties[P.DurationMs] = properties.duration_ms
    if (properties.success === false)
      properties[P.ErrorType] = properties.response_class ?? 'tool_error'
  }
  enqueueMcpAnalytics(
    {
      ...input,
      identity,
      timestamp: input.timestamp ?? new Date().toISOString(),
      properties: {
        ...properties,
        ...(family !== 'unknown' && family !== 'other' ? { mcp_client_family: family } : {}),
        mcp_client_key: mcpAnalyticsKey('client', context?.clientId()),
        mcp_connection_key: mcpAnalyticsKey('connection', context?.connectionId?.()),
        mcp_principal_key: mcpAnalyticsKey('principal', identity?.principalId),
        principal_type: identity?.principalType,
      },
    },
    processMcpAnalytics
  )
}

export function recordMcpRpcAnalytics(input: {
  mcpMethod: string
  identity?: McpAnalyticsIdentity | null
}): void {
  recordMcpAnalytics({
    event: AnalyticsEvents.MCP_RPC_REQUESTED,
    properties: {
      [AnalyticsProperties.MCP_METHOD]: input.mcpMethod,
      [AnalyticsProperties.PRINCIPAL_TYPE]: input.identity?.principalType,
    },
    identity: input.identity,
  })
}

export function recordMcpToolAnalytics(input: {
  toolName: string
  responseClass: 'success' | 'tool_error'
  principalType: McpPrincipalType
  identity: McpAnalyticsIdentity
  redactionCount?: number
}): void {
  recordMcpAnalytics({
    event: AnalyticsEvents.MCP_TOOL_CALLED,
    properties: {
      [AnalyticsProperties.TOOL_NAME]: input.toolName,
      [AnalyticsProperties.RESPONSE_CLASS]: input.responseClass,
      [AnalyticsProperties.PRINCIPAL_TYPE]: input.principalType,
      [AnalyticsProperties.SUCCESS]: input.responseClass === 'success',
      ...(input.redactionCount && input.redactionCount > 0
        ? { [AnalyticsProperties.REDACTION_COUNT]: input.redactionCount }
        : {}),
    },
    identity: input.identity,
  })
}

export function recordMcpToolDeniedAnalytics(input: {
  toolName: string
  principalType: McpPrincipalType
  denialReason?: string | null
  identity: McpAnalyticsIdentity
}): void {
  recordMcpAnalytics({
    event: AnalyticsEvents.MCP_TOOL_DENIED,
    properties: {
      [AnalyticsProperties.TOOL_NAME]: input.toolName,
      [AnalyticsProperties.PRINCIPAL_TYPE]: input.principalType,
      [AnalyticsProperties.RESPONSE_CLASS]: 'policy_denied',
      [AnalyticsProperties.DENIAL_REASON_CATEGORY]: categorizeDenialReason(input.denialReason),
      [AnalyticsProperties.SUCCESS]: false,
    },
    identity: input.identity,
  })
}

export function recordMcpAuthFailedAnalytics(input: {
  failure: 'missing_bearer' | 'unauthorized' | 'insufficient_scope'
  identity?: McpAnalyticsIdentity | null
}): void {
  recordMcpAnalytics({
    event: AnalyticsEvents.MCP_AUTH_FAILED,
    properties: {
      [AnalyticsProperties.MCP_AUTH_FAILURE]: input.failure,
      [AnalyticsProperties.SUCCESS]: false,
      [AnalyticsProperties.PRINCIPAL_TYPE]: input.identity?.principalType,
    },
    identity: input.identity,
  })
}

export function recordMcpRateLimitedAnalytics(input: {
  scope: 'ingress' | 'tool'
  toolName?: string
  identity?: McpAnalyticsIdentity | null
}): void {
  recordMcpAnalytics({
    event: AnalyticsEvents.MCP_RATE_LIMITED,
    properties: {
      [AnalyticsProperties.MCP_RATE_LIMIT_SCOPE]: input.scope,
      [AnalyticsProperties.TOOL_NAME]: input.toolName,
      [AnalyticsProperties.SUCCESS]: false,
      [AnalyticsProperties.PRINCIPAL_TYPE]: input.identity?.principalType,
    },
    identity: input.identity,
  })
}

export function recordMcpTelemetryAnalytics(
  signal: McpTelemetrySignal,
  context: {
    toolName?: string
    principalId?: string
    principalType?: McpPrincipalType
    userId?: string | null
    organizationId?: string | null
    denialReason?: string | null
    redactionCount?: number
    count?: number
  }
): void {
  const identity =
    context.principalId && context.principalType
      ? {
          principalType: context.principalType,
          principalId: context.principalId,
          userId: context.userId,
          organizationId: context.organizationId,
        }
      : null

  switch (signal) {
    case 'tool_success':
      {
        const request = mcpAnalyticsContext.getStore()
        if (request) {
          request.toolOutcome = 'success'
          request.redactionCount = context.redactionCount
          return // The request boundary captures the final SDK outcome exactly once.
        }
      }
      if (!context.toolName || !identity) return
      recordMcpToolAnalytics({
        toolName: context.toolName,
        responseClass: 'success',
        principalType: identity.principalType,
        identity,
        redactionCount: context.redactionCount,
      })
      return
    case 'tool_error':
      {
        const request = mcpAnalyticsContext.getStore()
        if (request) {
          request.toolOutcome = 'tool_error'
          return
        }
      }
      if (!context.toolName || !identity) return
      recordMcpToolAnalytics({
        toolName: context.toolName,
        responseClass: 'tool_error',
        principalType: identity.principalType,
        identity,
      })
      return
    case 'policy_denied':
      if (!context.toolName || !identity) return
      recordMcpToolDeniedAnalytics({
        toolName: context.toolName,
        principalType: identity.principalType,
        denialReason: context.denialReason,
        identity,
      })
      return
    case 'rate_limited_ingress':
      recordMcpRateLimitedAnalytics({ scope: 'ingress', identity })
      return
    case 'rate_limited_tool':
      recordMcpRateLimitedAnalytics({
        scope: 'tool',
        toolName: context.toolName,
        identity,
      })
      return
    case 'auth_missing_bearer':
      recordMcpAuthFailedAnalytics({ failure: 'missing_bearer', identity })
      return
    case 'auth_unauthorized':
      recordMcpAuthFailedAnalytics({ failure: 'unauthorized', identity })
      return
    case 'auth_forbidden':
      recordMcpAuthFailedAnalytics({ failure: 'insufficient_scope', identity })
      return
    case 'redaction_applied':
    case 'audit_dropped':
    case 'audit_write_failed':
      recordMcpAnalytics({
        event: AnalyticsEvents.MCP_OPERATIONAL_SIGNAL,
        identity,
        properties: {
          telemetry_signal: signal,
          tool_name: context.toolName,
          signal_count: context.count ?? context.redactionCount ?? 1,
        },
      })
      return
    default:
      return
  }
}
