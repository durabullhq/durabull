import { getCanonicalMcpResourceUri } from '@durabull/mcp/auth'
import { env } from '@durabull/env'

/** Default dev-only bearer when `MCP_AUTHLESS_BEARER_TOKEN` is unset (non-production). */
export const DEFAULT_AUTHLESS_MCP_BEARER_TOKEN = 'durabull-authless-mcp'

export function getAuthlessMcpBearerToken(): string {
  const configured = env.MCP_AUTHLESS_BEARER_TOKEN?.trim()
  if (configured) {
    return configured
  }

  if (env.DURABULL_CLOUD === true) {
    throw new Error(
      'MCP_AUTHLESS_BEARER_TOKEN must be set when DURABULL_AUTHLESS=true on Durabull Cloud'
    )
  }

  return DEFAULT_AUTHLESS_MCP_BEARER_TOKEN
}

/** @deprecated Use `getAuthlessMcpBearerToken()` — resolves env override. */
export const AUTHLESS_MCP_BEARER_TOKEN = DEFAULT_AUTHLESS_MCP_BEARER_TOKEN

export function getMcpAuthConfig(appBaseUrl: string) {
  const canonicalResourceUri = getCanonicalMcpResourceUri(appBaseUrl)
  const appOrigin = new URL(appBaseUrl).origin
  return {
    canonicalResourceUri,
    /** Matches Better Auth `withMcpAuth` challenge URL (auth base path). */
    resourceMetadataUrl: `${appOrigin}/api/auth/.well-known/oauth-protected-resource`,
    /** App-origin fallback for clients that ignore `WWW-Authenticate` (RFC 9728). */
    rootResourceMetadataUrl: `${appOrigin}/.well-known/oauth-protected-resource`,
    authorizationServerUrl: `${appOrigin}/api/auth`,
  }
}

export function assertMcpAuthConfiguration(): void {
  if (env.DURABULL_AUTHLESS === true && env.DURABULL_CLOUD === true) {
    throw new Error('DURABULL_AUTHLESS cannot be enabled for Durabull Cloud deployments')
  }

  if (
    env.DURABULL_AUTHLESS === true &&
    env.NODE_ENV === 'production' &&
    !env.MCP_AUTHLESS_BEARER_TOKEN?.trim()
  ) {
    throw new Error(
      'MCP_AUTHLESS_BEARER_TOKEN is required when DURABULL_AUTHLESS=true in production'
    )
  }
}
