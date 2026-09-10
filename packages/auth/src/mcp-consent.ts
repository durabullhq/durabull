import {
  isKnownMcpScope,
  isMcpWriteScope,
  MCP_SCOPE_DIAGNOSTICS_READ,
  MCP_SCOPE_DISCOVER,
  MCP_SCOPE_FAILURES_READ,
  MCP_SCOPE_FAILURES_WRITE,
  MCP_SCOPE_JOBS_PROMOTE,
  MCP_SCOPE_JOBS_READ,
  MCP_SCOPE_JOBS_RETRY,
  MCP_SCOPE_LOGS_READ,
  MCP_SCOPE_QUEUES_PAUSE,
} from './mcp-scope-labels'

export {
  isKnownMcpPhase1Scope,
  isKnownMcpScope,
  isMcpWriteScope,
  MCP_ALL_SCOPES,
  MCP_PHASE1_SCOPES,
  MCP_WRITE_SCOPES,
} from './mcp-scope-labels'

export const MCP_OAUTH_CONSENT_PATH = '/consent'

/** Human-readable labels for scopes shown on the OAuth consent screen. */
export const MCP_SCOPE_LABELS: Record<string, { title: string; description: string }> = {
  openid: {
    title: 'Sign in',
    description: 'Verify your Durabull account identity.',
  },
  profile: {
    title: 'Profile',
    description: 'Read your name and profile information.',
  },
  email: {
    title: 'Email',
    description: 'Read your email address.',
  },
  offline_access: {
    title: 'Stay connected',
    description: 'Refresh access without signing in again until you revoke access.',
  },
  [MCP_SCOPE_DISCOVER]: {
    title: 'MCP discovery',
    description: 'Connect to the Durabull MCP server and run connectivity checks.',
  },
  [MCP_SCOPE_JOBS_READ]: {
    title: 'Read queues and jobs',
    description: 'List connections, queues, jobs, and workers.',
  },
  [MCP_SCOPE_LOGS_READ]: {
    title: 'Read job logs',
    description: 'View job logs and stack traces.',
  },
  [MCP_SCOPE_FAILURES_READ]: {
    title: 'Read failures',
    description: 'View alert and failure events.',
  },
  [MCP_SCOPE_DIAGNOSTICS_READ]: {
    title: 'Read diagnostics',
    description: 'View queue metrics, Redis health, and failure explanations.',
  },
  [MCP_SCOPE_JOBS_RETRY]: {
    title: 'Retry failed jobs',
    description: 'Re-enqueue failed jobs with their existing payload. Cannot change job data.',
  },
  [MCP_SCOPE_JOBS_PROMOTE]: {
    title: 'Promote delayed jobs',
    description: 'Run delayed jobs immediately.',
  },
  [MCP_SCOPE_QUEUES_PAUSE]: {
    title: 'Pause and resume queues',
    description: 'Stop and restart job processing on a queue. Cannot remove or purge jobs.',
  },
  [MCP_SCOPE_FAILURES_WRITE]: {
    title: 'Manage alerts',
    description: 'Resolve, acknowledge, and snooze alert incidents and rules.',
  },
}

export function parseConsentScopeList(scopeParam: string | undefined): string[] {
  if (!scopeParam?.trim()) {
    return []
  }
  return scopeParam
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0)
}

export type LabeledConsentScope = {
  scope: string
  title: string
  description: string
  unknownScope: boolean
  /** True for scopes that let the client change state (retry, pause, resolve, ...). */
  writeScope: boolean
}

export function labelConsentScopes(scopes: readonly string[]): LabeledConsentScope[] {
  return scopes.map((scope) => {
    const known = MCP_SCOPE_LABELS[scope]
    return {
      scope,
      title: known?.title ?? scope,
      description: known?.description ?? 'Access requested by the connecting application.',
      unknownScope: !known && !isKnownMcpScope(scope),
      writeScope: isMcpWriteScope(scope),
    }
  })
}

export interface McpOAuthConsentSearch {
  consent_code?: string
  client_id?: string
  scope?: string
}

export function parseMcpOAuthConsentSearch(search: Record<string, unknown>): McpOAuthConsentSearch {
  return {
    consent_code:
      typeof search.consent_code === 'string' && search.consent_code.length > 0
        ? search.consent_code
        : undefined,
    client_id:
      typeof search.client_id === 'string' && search.client_id.length > 0
        ? search.client_id
        : undefined,
    scope: typeof search.scope === 'string' && search.scope.length > 0 ? search.scope : undefined,
  }
}

/** Query keys preserved when resuming MCP authorize after login. */
export const MCP_AUTHORIZE_QUERY_KEYS = [
  'client_id',
  'redirect_uri',
  'response_type',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  'resource',
  'prompt',
  'nonce',
] as const

export function hasMcpAuthorizeQuery(search: Record<string, unknown>): boolean {
  return (
    typeof search.client_id === 'string' &&
    search.client_id.length > 0 &&
    typeof search.redirect_uri === 'string' &&
    search.redirect_uri.length > 0
  )
}

export function buildMcpAuthorizeResumeUrl(search: Record<string, unknown>): string | null {
  if (!hasMcpAuthorizeQuery(search)) {
    return null
  }

  const params = new URLSearchParams()
  for (const key of MCP_AUTHORIZE_QUERY_KEYS) {
    const value = search[key]
    if (typeof value === 'string' && value.length > 0) {
      params.set(key, value)
    }
  }

  if (!params.has('prompt')) {
    params.set('prompt', 'consent')
  }

  return `/api/auth/mcp/authorize?${params.toString()}`
}

export function buildLoginRedirectForConsent(consentPathWithSearch: string): string {
  const params = new URLSearchParams()
  params.set('redirect', consentPathWithSearch)
  return `/login?${params.toString()}`
}

export interface McpOAuthConsentContext {
  clientId: string
  name: string
  icon: string | null
  disabled: boolean
  scopes: string[]
}
