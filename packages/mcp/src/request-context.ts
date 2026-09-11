import { AsyncLocalStorage } from 'node:async_hooks'

export interface McpRequestPrincipal {
  type: 'delegated_user' | 'service_account'
  principalId: string
  userId?: string
  organizationId?: string
}

export interface McpResolvedConnection {
  id: string
  organizationId: string
  name: string
  environment: string | null
  url: string
  prefix: string
  allowSelfSignedCerts: boolean
}

export interface McpToolInvocationAuditInput {
  toolName: string
  arguments: Record<string, unknown>
  connectionId?: string | null
  responseClass: 'success' | 'tool_error'
  redactionCount?: number
}

export interface McpRequestContext {
  principal?: McpRequestPrincipal
  correlationId?: string
  /**
   * Effective scopes for this call: token scopes for delegated users; for service accounts,
   * token scopes that also have a matching policy binding. Handlers use these to decide which
   * optional sections to include.
   */
  grantedScopes?: readonly string[]
  resolvedConnection?: McpResolvedConnection
  onToolInvocationComplete?: (input: McpToolInvocationAuditInput) => void
  onRedactionApplied?: (redactionCount: number) => void
}

const store = new AsyncLocalStorage<McpRequestContext>()

export function runWithMcpRequestContext<T>(
  context: McpRequestContext | undefined,
  fn: () => Promise<T> | T
): Promise<T> | T {
  if (!context) {
    return fn()
  }
  return store.run(context, fn)
}

export function getMcpRequestContext(): McpRequestContext | undefined {
  return store.getStore()
}

/** True when the current request's effective scopes include `scope`. */
export function mcpRequestHasScope(scope: string): boolean {
  return getMcpRequestContext()?.grantedScopes?.includes(scope) ?? false
}
