export {
  createMcpBearerAuthMiddleware,
  type McpBearerAuthMiddlewareOptions,
} from './bearer-middleware'
export {
  buildMcpInsufficientScopeResponse,
  buildMcpMissingBearerResponse,
  buildMcpUnauthorizedResponse,
} from './json-rpc-auth-response'
export { normalizeResourceUri } from './normalize-resource-uri'
export {
  getCanonicalMcpResourceUri,
  getMcpProtectedResourceMetadataUrl,
} from './resource-uri'
export type { McpPhase1Scope, McpScope, McpWriteScope } from './scopes'
export {
  isKnownMcpScope,
  isMcpWriteScope,
  MCP_ALL_SCOPES,
  MCP_OAUTH_SCOPES_SUPPORTED,
  MCP_PHASE1_SCOPES,
  MCP_READ_SCOPES,
  MCP_SCOPE_DIAGNOSTICS_READ,
  MCP_SCOPE_DISCOVER,
  MCP_SCOPE_FAILURES_READ,
  MCP_SCOPE_FAILURES_WRITE,
  MCP_SCOPE_JOBS_PROMOTE,
  MCP_SCOPE_JOBS_READ,
  MCP_SCOPE_JOBS_RETRY,
  MCP_SCOPE_LOGS_READ,
  MCP_SCOPE_QUEUES_PAUSE,
  MCP_TRANSPORT_REQUIRED_SCOPES,
  MCP_WRITE_SCOPES,
  missingScopes,
  OIDC_CORE_SCOPES,
  parseScopeString,
  tokenHasScopes,
} from './scopes'
export { isMcpAccessTokenExpired, toAccessTokenExpiry } from './session'
export { createMcpTokenValidationCache } from './token-cache'
export type { McpAccessTokenClaims, McpTokenValidationResult } from './types'
export { extractBearerToken, validateMcpAccessTokenClaims } from './validate-token'
export { buildWwwAuthenticateChallenge, mcpAuthResponseHeaders } from './www-authenticate'
