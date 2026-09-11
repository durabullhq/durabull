import { mcpPolicyRepository } from '@durabull/dal'
import { getMcpToolRequiredScopes } from '@durabull/mcp'

import type { McpSession } from '../auth/mcp-session-middleware'
import type { McpPolicyDecision, McpPrincipal, McpToolCallRequest } from './types'

function parseScopes(scopeString: string): string[] {
  return scopeString
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
}

function missingScopes(grantedScopes: string[], requiredScopes: readonly string[]): string[] {
  const grantedSet = new Set(grantedScopes)
  return requiredScopes.filter((scope) => !grantedSet.has(scope))
}

/** Required scopes for an operation: explicit for resources, catalog-driven for tools. */
function getRequiredScopes(call: McpToolCallRequest): readonly string[] | null {
  if (call.requiredScopes) return call.requiredScopes
  return getMcpToolRequiredScopes(call.toolName)
}

type PolicyBinding = Awaited<ReturnType<typeof mcpPolicyRepository.listPolicyBindings>>[number]

function bindingCovers(
  binding: PolicyBinding,
  scope: string,
  toolName: string,
  organizationId: string
): boolean {
  return (
    binding.scope === scope &&
    (binding.toolName === null || binding.toolName === toolName) &&
    (binding.organizationId === null || binding.organizationId === organizationId)
  )
}

function deny(
  base: Omit<McpPolicyDecision, 'granted' | 'denialReason' | 'effectiveScopes'>,
  denialReason: string
): McpPolicyDecision {
  return { ...base, effectiveScopes: [], granted: false, denialReason }
}

export async function evaluateMcpToolPolicy(input: {
  correlationId: string
  principal: McpPrincipal
  session: McpSession
  call: McpToolCallRequest
}): Promise<McpPolicyDecision> {
  const base = {
    correlationId: input.correlationId,
    principalType: input.principal.type,
    principalId: input.principal.principalId,
    organizationId: input.principal.organizationId,
    connectionId: input.call.connectionId,
    toolName: input.call.toolName,
    requiredScopes: [] as string[],
  }

  const requiredScopes = getRequiredScopes(input.call)
  if (!requiredScopes) {
    return deny(base, 'policy_configuration_missing')
  }
  base.requiredScopes = [...requiredScopes]

  const grantedScopes = parseScopes(input.session.scopes)
  const missing = missingScopes(grantedScopes, requiredScopes)
  if (missing.length > 0) {
    return deny(base, `missing_scopes:${missing.join(',')}`)
  }

  if (input.principal.type === 'delegated_user') {
    if (input.call.connectionId) {
      const canAccess = await mcpPolicyRepository.canDelegatedUserAccessConnection(
        input.principal.userId,
        input.call.connectionId
      )
      if (!canAccess) {
        return deny({ ...base, organizationId: null }, 'connection_out_of_scope')
      }
    }

    return {
      ...base,
      effectiveScopes: grantedScopes,
      granted: true,
      denialReason: null,
    }
  }

  const organizationId = input.principal.organizationId
  const policyBindings = await mcpPolicyRepository.listPolicyBindings(
    'service_account',
    input.principal.serviceAccountId
  )
  const hasPolicyBinding = requiredScopes.every((scope) =>
    policyBindings.some((binding) =>
      bindingCovers(binding, scope, input.call.toolName, organizationId)
    )
  )
  if (!hasPolicyBinding) {
    return deny(base, 'service_account_policy_denied')
  }

  if (input.call.connectionId) {
    const belongsToOrg = await mcpPolicyRepository.doesConnectionBelongToOrganization(
      input.call.connectionId,
      organizationId
    )
    if (!belongsToOrg) {
      return deny(base, 'connection_out_of_scope')
    }
  }

  // A service account may exercise optional scopes only when both the token and a binding for
  // this operation carry them.
  const effectiveScopes = grantedScopes.filter((scope) =>
    policyBindings.some((binding) =>
      bindingCovers(binding, scope, input.call.toolName, organizationId)
    )
  )

  return {
    ...base,
    effectiveScopes,
    granted: true,
    denialReason: null,
  }
}
