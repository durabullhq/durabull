import type { FeatureKey } from '@durabull/billing'
import { MCP_WRITE_TOOL_NAMES } from '@durabull/mcp'
import { recordBillingEvent } from '../../billing/analytics'
import { isBillingEnabled } from '../../billing/config'
import { getEntitlement, isMemberSuspended, isResourceSuspended } from '../../billing/entitlements'
import { FeatureNotEntitledError } from '../../billing/errors'
import type { McpPrincipal } from './types'

const WRITE_TOOLS = new Set(MCP_WRITE_TOOL_NAMES)

export type McpBillingDecision =
  | { allowed: true }
  | {
      allowed: false
      denialReason: string
      /** JSON-RPC error data. Only the caller's own organization is described. */
      data: Record<string, unknown>
    }

async function deniedFeature(
  organizationId: string,
  feature: FeatureKey
): Promise<McpBillingDecision | null> {
  const entitlement = await getEntitlement(organizationId)
  if (entitlement.features.includes(feature)) return null
  recordBillingEvent('feature_denied', organizationId, {
    feature,
    plan: entitlement.planCode,
    shadow: !entitlement.enforced,
  })
  if (!entitlement.enforced) return null
  const error = new FeatureNotEntitledError(feature)
  return {
    allowed: false,
    denialReason: `feature_not_entitled:${feature}`,
    data: {
      code: 'feature_not_entitled',
      feature,
      requiredPlan: error.requiredPlan,
      message: error.message,
    },
  }
}

/**
 * Billing policy for one MCP operation, evaluated after scope policy and
 * connection ownership. The billing organization comes from the authorized
 * connection (delegated users) or the bound organization (service accounts),
 * never from the user's selected browser organization. A plan can only narrow
 * what scope policy already allows; it never expands a token's consented
 * scopes or ADR-0001's opt-in write rules.
 */
export async function evaluateMcpBillingPolicy(input: {
  principal: McpPrincipal
  operationName: string
  connectionId: string | null
  connectionOrganizationId: string | null
}): Promise<McpBillingDecision> {
  if (!isBillingEnabled()) return { allowed: true }

  const organizationId =
    input.principal.type === 'service_account'
      ? input.principal.organizationId
      : input.connectionOrganizationId
  if (!organizationId) return { allowed: true }

  if (input.principal.type === 'delegated_user') {
    if (await isMemberSuspended(organizationId, input.principal.userId)) {
      return {
        allowed: false,
        denialReason: 'member_suspended',
        data: {
          code: 'member_suspended',
          message: 'Your seat in this organization is paused by its plan’s member limit.',
        },
      }
    }
  } else {
    const automationDenied = await deniedFeature(organizationId, 'automation.service_accounts')
    if (automationDenied) return automationDenied
    if (
      await isResourceSuspended(organizationId, 'service_account', input.principal.serviceAccountId)
    ) {
      return {
        allowed: false,
        denialReason: 'service_account_suspended',
        data: {
          code: 'service_account_suspended',
          message: 'This service account is paused by the organization’s plan limit.',
        },
      }
    }
  }

  if (
    input.connectionId &&
    (await isResourceSuspended(organizationId, 'connection', input.connectionId))
  ) {
    return {
      allowed: false,
      denialReason: 'connection_suspended',
      data: {
        code: 'connection_suspended',
        message: 'This connection is paused by the organization’s plan connection limit.',
      },
    }
  }

  if (WRITE_TOOLS.has(input.operationName)) {
    const writeDenied = await deniedFeature(organizationId, 'mcp.write')
    if (writeDenied) return writeDenied
  }

  return { allowed: true }
}
