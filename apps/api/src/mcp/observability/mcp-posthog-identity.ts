import type { McpAnalyticsIdentity } from './mcp-analytics'
import { mcpAnalyticsKey } from './mcp-analytics-context'

/** App-project identity must match browser identifyUser/identifyOrganization. */
export function resolveMcpPosthogIdentity(identity: McpAnalyticsIdentity | null | undefined): {
  distinctId: string
  groups?: { organization: string }
} | null {
  if (!identity) return null
  const distinctId =
    identity.principalType === 'delegated_user'
      ? identity.userId
      : mcpAnalyticsKey('principal', identity.principalId)
  if (!distinctId) return null
  return {
    distinctId,
    ...(identity.organizationId ? { groups: { organization: identity.organizationId } } : {}),
  }
}
