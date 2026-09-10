/**
 * MCP scope taxonomy.
 *
 * Phase 1 (read bundle) is documented in `tasks/mcp-implementation-master-plan.md` §6.2 and
 * ADR-0001. Phase 2 adds narrowly scoped, non-destructive write scopes. Destructive operations
 * (remove, purge, obliterate, arbitrary Redis access) intentionally have no MCP scope.
 */
export const MCP_SCOPE_DISCOVER = 'mcp:discover'
export const MCP_SCOPE_JOBS_READ = 'mcp:jobs:read'
export const MCP_SCOPE_FAILURES_READ = 'mcp:failures:read'
export const MCP_SCOPE_LOGS_READ = 'mcp:logs:read'
export const MCP_SCOPE_DIAGNOSTICS_READ = 'mcp:diagnostics:read'

/** Retry a failed job (no payload mutation). */
export const MCP_SCOPE_JOBS_RETRY = 'mcp:jobs:retry'
/** Promote a delayed job so it runs immediately. */
export const MCP_SCOPE_JOBS_PROMOTE = 'mcp:jobs:promote'
/** Pause and resume queues. */
export const MCP_SCOPE_QUEUES_PAUSE = 'mcp:queues:pause'
/** Resolve, acknowledge, and snooze alert incidents and rules. */
export const MCP_SCOPE_FAILURES_WRITE = 'mcp:failures:write'

/** Read-only bundle (phase 1). Injected into authorize requests that omit `mcp:*` scopes. */
export const MCP_PHASE1_SCOPES = [
  MCP_SCOPE_DISCOVER,
  MCP_SCOPE_JOBS_READ,
  MCP_SCOPE_FAILURES_READ,
  MCP_SCOPE_LOGS_READ,
  MCP_SCOPE_DIAGNOSTICS_READ,
] as const

/** Alias that reads better at call sites that mean "the read bundle". */
export const MCP_READ_SCOPES = MCP_PHASE1_SCOPES

/**
 * Write scopes (phase 2). Never injected automatically — clients must request them
 * explicitly and users must approve them on the consent screen.
 */
export const MCP_WRITE_SCOPES = [
  MCP_SCOPE_JOBS_RETRY,
  MCP_SCOPE_JOBS_PROMOTE,
  MCP_SCOPE_QUEUES_PAUSE,
  MCP_SCOPE_FAILURES_WRITE,
] as const

export const MCP_ALL_SCOPES = [...MCP_PHASE1_SCOPES, ...MCP_WRITE_SCOPES] as const

export const OIDC_CORE_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const
export const MCP_OAUTH_SCOPES_SUPPORTED = [...OIDC_CORE_SCOPES, ...MCP_ALL_SCOPES] as const

export type McpPhase1Scope = (typeof MCP_PHASE1_SCOPES)[number]
export type McpWriteScope = (typeof MCP_WRITE_SCOPES)[number]
export type McpScope = (typeof MCP_ALL_SCOPES)[number]

/** Minimum scope required to use MCP transport (initialize, tools/list, ping). */
export const MCP_TRANSPORT_REQUIRED_SCOPES = [MCP_SCOPE_DISCOVER] as const

export function isMcpWriteScope(scope: string): scope is McpWriteScope {
  return (MCP_WRITE_SCOPES as readonly string[]).includes(scope)
}

export function isKnownMcpScope(scope: string): scope is McpScope {
  return (MCP_ALL_SCOPES as readonly string[]).includes(scope)
}

export function parseScopeString(scopes: string): string[] {
  return scopes
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0)
}

export function tokenHasScopes(
  tokenScopes: readonly string[],
  required: readonly string[]
): boolean {
  const granted = new Set(tokenScopes)
  return required.every((scope) => granted.has(scope))
}

export function missingScopes(
  tokenScopes: readonly string[],
  required: readonly string[]
): string[] {
  const granted = new Set(tokenScopes)
  return required.filter((scope) => !granted.has(scope))
}
