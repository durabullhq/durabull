/**
 * MCP scope strings (duplicated here to avoid pulling the server MCP bundle into the web client).
 * Keep in sync with `packages/mcp/src/auth/scopes.ts`; `mcp-consent.test.ts` guards the pairing.
 */
export const MCP_SCOPE_DISCOVER = 'mcp:discover'
export const MCP_SCOPE_JOBS_READ = 'mcp:jobs:read'
export const MCP_SCOPE_LOGS_READ = 'mcp:logs:read'
export const MCP_SCOPE_FAILURES_READ = 'mcp:failures:read'
export const MCP_SCOPE_DIAGNOSTICS_READ = 'mcp:diagnostics:read'

export const MCP_SCOPE_JOBS_RETRY = 'mcp:jobs:retry'
export const MCP_SCOPE_JOBS_PROMOTE = 'mcp:jobs:promote'
export const MCP_SCOPE_QUEUES_PAUSE = 'mcp:queues:pause'
export const MCP_SCOPE_FAILURES_WRITE = 'mcp:failures:write'

/** Read-only bundle (phase 1). */
export const MCP_PHASE1_SCOPES = [
  MCP_SCOPE_DISCOVER,
  MCP_SCOPE_JOBS_READ,
  MCP_SCOPE_LOGS_READ,
  MCP_SCOPE_FAILURES_READ,
  MCP_SCOPE_DIAGNOSTICS_READ,
] as const

/** Write scopes (phase 2). Never injected automatically; must be requested and consented to. */
export const MCP_WRITE_SCOPES = [
  MCP_SCOPE_JOBS_RETRY,
  MCP_SCOPE_JOBS_PROMOTE,
  MCP_SCOPE_QUEUES_PAUSE,
  MCP_SCOPE_FAILURES_WRITE,
] as const

export const MCP_ALL_SCOPES = [...MCP_PHASE1_SCOPES, ...MCP_WRITE_SCOPES] as const

export type McpPhase1Scope = (typeof MCP_PHASE1_SCOPES)[number]
export type McpWriteScope = (typeof MCP_WRITE_SCOPES)[number]
export type McpScope = (typeof MCP_ALL_SCOPES)[number]

export function isKnownMcpPhase1Scope(scope: string): scope is McpPhase1Scope {
  return (MCP_PHASE1_SCOPES as readonly string[]).includes(scope)
}

export function isMcpWriteScope(scope: string): scope is McpWriteScope {
  return (MCP_WRITE_SCOPES as readonly string[]).includes(scope)
}

export function isKnownMcpScope(scope: string): scope is McpScope {
  return (MCP_ALL_SCOPES as readonly string[]).includes(scope)
}
