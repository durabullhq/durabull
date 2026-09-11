import type { McpPrincipalType } from '@durabull/dal'

export type McpPrincipal =
  | {
      type: 'delegated_user'
      principalId: string
      userId: string
      organizationId: null
    }
  | {
      type: 'service_account'
      principalId: string
      serviceAccountId: string
      organizationId: string
    }

export interface McpPolicyDecision {
  correlationId: string
  principalType: McpPrincipalType
  principalId: string
  organizationId: string | null
  connectionId: string | null
  /** Tool name for `tools/call`; `resource:<name>` for `resources/read`. */
  toolName: string
  requiredScopes: string[]
  /**
   * Scopes the caller may exercise on this operation. Token scopes for delegated users; for
   * service accounts, token scopes that also carry a policy binding for this operation.
   * Handlers use these to include or omit optional evidence.
   */
  effectiveScopes: string[]
  granted: boolean
  denialReason: string | null
}

export interface McpToolCallRequest {
  /** Tool name for `tools/call`; `resource:<name>` for `resources/read`. */
  toolName: string
  arguments: Record<string, unknown>
  connectionId: string | null
  /**
   * Explicit scope requirement for non-tool operations (resources). When omitted the catalog
   * mapping for `toolName` is used, and unknown tools are denied.
   */
  requiredScopes?: readonly string[]
}
