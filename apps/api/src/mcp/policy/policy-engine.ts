import { mcpPolicyRepository } from '@durabull/dal'

import type { McpSession } from '../auth/mcp-session-middleware'
import type { McpPolicyDecision, McpPrincipal, McpToolCallRequest } from './types'

const TOOL_REQUIRED_SCOPES: Record<string, string[]> = {
  ping: ['mcp:discover'],
  list_connections: ['mcp:jobs:read'],
  list_queues: ['mcp:jobs:read'],
  get_queue: ['mcp:jobs:read'],
  list_jobs: ['mcp:jobs:read'],
  get_job: ['mcp:jobs:read'],
  get_job_logs: ['mcp:logs:read'],
  get_job_stacktraces: ['mcp:logs:read'],
  get_failure_events: ['mcp:failures:read'],
  resolve_alert_event: ['mcp:failures:read'],
  get_queue_metrics: ['mcp:diagnostics:read'],
  get_workers: ['mcp:jobs:read'],
  explain_job_failure: [
    'mcp:diagnostics:read',
    'mcp:jobs:read',
    'mcp:logs:read',
    'mcp:failures:read',
  ],
}

function parseScopes(scopeString: string): string[] {
  return scopeString
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
}

function missingScopes(grantedScopes: string[], requiredScopes: string[]): string[] {
  const grantedSet = new Set(grantedScopes)
  return requiredScopes.filter((scope) => !grantedSet.has(scope))
}

function getRequiredScopes(toolName: string): string[] | null {
  return TOOL_REQUIRED_SCOPES[toolName] ?? null
}

export async function evaluateMcpToolPolicy(input: {
  correlationId: string
  principal: McpPrincipal
  session: McpSession
  call: McpToolCallRequest
}): Promise<McpPolicyDecision> {
  const requiredScopes = getRequiredScopes(input.call.toolName)
  if (!requiredScopes) {
    return {
      correlationId: input.correlationId,
      principalType: input.principal.type,
      principalId: input.principal.principalId,
      organizationId: input.principal.organizationId,
      connectionId: input.call.connectionId,
      toolName: input.call.toolName,
      requiredScopes: [],
      granted: false,
      denialReason: 'policy_configuration_missing',
    }
  }

  const grantedScopes = parseScopes(input.session.scopes)
  const missing = missingScopes(grantedScopes, requiredScopes)

  if (missing.length > 0) {
    return {
      correlationId: input.correlationId,
      principalType: input.principal.type,
      principalId: input.principal.principalId,
      organizationId: input.principal.organizationId,
      connectionId: input.call.connectionId,
      toolName: input.call.toolName,
      requiredScopes,
      granted: false,
      denialReason: `missing_scopes:${missing.join(',')}`,
    }
  }

  if (input.call.connectionId && input.principal.type === 'delegated_user') {
    const canAccess = await mcpPolicyRepository.canDelegatedUserAccessConnection(
      input.principal.userId,
      input.call.connectionId
    )
    if (!canAccess) {
      return {
        correlationId: input.correlationId,
        principalType: input.principal.type,
        principalId: input.principal.principalId,
        organizationId: null,
        connectionId: input.call.connectionId,
        toolName: input.call.toolName,
        requiredScopes,
        granted: false,
        denialReason: 'connection_out_of_scope',
      }
    }
  }

  if (input.principal.type === 'service_account') {
    const policyBindings = await mcpPolicyRepository.listPolicyBindings('service_account', input.principal.serviceAccountId)
    const hasPolicyBinding = requiredScopes.every((scope) =>
      policyBindings.some(
        (binding) =>
          binding.scope === scope &&
          (binding.toolName === null || binding.toolName === input.call.toolName) &&
          (binding.organizationId === null || binding.organizationId === input.principal.organizationId)
      )
    )

    if (!hasPolicyBinding) {
      return {
        correlationId: input.correlationId,
        principalType: input.principal.type,
        principalId: input.principal.principalId,
        organizationId: input.principal.organizationId,
        connectionId: input.call.connectionId,
        toolName: input.call.toolName,
        requiredScopes,
        granted: false,
        denialReason: 'service_account_policy_denied',
      }
    }

    if (input.call.connectionId) {
      const belongsToOrg = await mcpPolicyRepository.doesConnectionBelongToOrganization(
        input.call.connectionId,
        input.principal.organizationId
      )
      if (!belongsToOrg) {
        return {
          correlationId: input.correlationId,
          principalType: input.principal.type,
          principalId: input.principal.principalId,
          organizationId: input.principal.organizationId,
          connectionId: input.call.connectionId,
          toolName: input.call.toolName,
          requiredScopes,
          granted: false,
          denialReason: 'connection_out_of_scope',
        }
      }
    }
  }

  return {
    correlationId: input.correlationId,
    principalType: input.principal.type,
    principalId: input.principal.principalId,
    organizationId: input.principal.organizationId,
    connectionId: input.call.connectionId,
    toolName: input.call.toolName,
    requiredScopes,
    granted: true,
    denialReason: null,
  }
}
