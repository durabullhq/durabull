import { organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export { submitOAuthConsent } from './submit-oauth-consent'
export type { SubmitOAuthConsentInput, SubmitOAuthConsentResult } from './submit-oauth-consent'
export {
  buildLoginRedirectForConsent,
  buildMcpAuthorizeResumeUrl,
  hasMcpAuthorizeQuery,
  labelConsentScopes,
  MCP_OAUTH_CONSENT_PATH,
  parseConsentScopeList,
  parseMcpOAuthConsentSearch,
} from './mcp-consent'
export type {
  LabeledConsentScope,
  McpOAuthConsentContext,
  McpOAuthConsentSearch,
} from './mcp-consent'
export { isSafeAppRedirectPath, resolveSafeAppRedirectPath } from './safe-redirect'

/**
 * Get the base URL for the auth client.
 * In order of priority:
 * 1. window.location.origin (client-side only, supports Vite fallback ports)
 * 2. VITE_PUBLIC_APP_URL from import.meta.env (Vite bundled code)
 * 3. VITE_PUBLIC_APP_URL from process.env (Node.js SSR)
 * 4. Fallback to localhost:3001 for local development
 */
function getBaseURL(): string {
  // Client-side: always prefer the current origin so auth follows whichever Vite
  // port is active (e.g. 5173 vs 5174) in local development.
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/auth`
  }

  // Check for Vite environment variable via import.meta.env (Vite bundled code)
  // This is statically replaced at build time for client bundles
  try {
    const viteEnvUrl = import.meta.env?.VITE_PUBLIC_APP_URL
    if (viteEnvUrl) {
      return `${viteEnvUrl}/api/auth`
    }
  } catch {
    // import.meta.env not available
  }

  // Check for environment variable via process.env (Node.js SSR runtime)
  try {
    const processEnvUrl = process.env.VITE_PUBLIC_APP_URL
    if (processEnvUrl) {
      return `${processEnvUrl}/api/auth`
    }
  } catch {
    // process.env not available
  }

  // Fallback for local development SSR
  return 'http://localhost:3001/api/auth'
}

/**
 * Auth client for use in the frontend
 * Provides React hooks for authentication and organization management
 */
export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [organizationClient()],
})

// Export commonly used hooks and utilities
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  organization,
  // Account linking functions
  linkSocial,
  unlinkAccount,
  listAccounts,
} = authClient
