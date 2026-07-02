const LINEAR_GRAPHQL_ENDPOINT = 'https://api.linear.app/graphql'
const LINEAR_TOKEN_ENDPOINT = 'https://api.linear.app/oauth/token'
const LINEAR_REVOKE_ENDPOINT = 'https://api.linear.app/oauth/revoke'
const LINEAR_REQUEST_TIMEOUT_MS = 30_000

interface LinearGraphQLError {
  message?: string
  extensions?: {
    code?: string
    type?: string
  }
}

interface LinearGraphQLResponse<T> {
  data?: T
  errors?: LinearGraphQLError[]
}

interface LinearOauthErrorResponse {
  error?: string
  error_description?: string
}

export interface LinearOauthTokenResponse {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
  scopes: string
  accessTokenExpiresAt: Date
}

export class LinearApiError extends Error {
  status: number
  retryable: boolean
  rateLimitResetAt: Date | null

  constructor(
    message: string,
    options: { status: number; retryable: boolean; rateLimitResetAt?: Date | null }
  ) {
    super(message)
    this.name = 'LinearApiError'
    this.status = options.status
    this.retryable = options.retryable
    this.rateLimitResetAt = options.rateLimitResetAt ?? null
  }
}

export interface LinearIssueInput {
  teamId: string
  title: string
  description: string
  projectId?: string | null
  labelIds?: string[]
  assigneeId?: string | null
  stateId?: string | null
  priority?: number | null
}

export interface LinearIssueResult {
  id: string
  identifier: string
  url: string
}

export interface LinearTeamSummary {
  id: string
  name: string
  key: string
}

export interface LinearMetadata {
  teams: LinearTeamSummary[]
  projects: Array<{ id: string; name: string }>
  labels: Array<{ id: string; name: string }>
  users: Array<{ id: string; name: string; email?: string | null }>
  states: Array<{ id: string; name: string; teamId: string }>
}

function parseRateLimitReset(headers: Headers): Date | null {
  const reset = headers.get('x-ratelimit-reset')
  if (!reset) return null
  const numeric = Number(reset)
  if (!Number.isFinite(numeric)) return null
  return new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000)
}

function redactLinearError(message: string): string {
  return message
    .replace(/lin_api_[A-Za-z0-9_-]+/g, '[REDACTED_LINEAR_TOKEN]')
    .replace(/([A-Za-z0-9_-]{32,})/g, '[REDACTED_LINEAR_TOKEN]')
}

function normalizeScope(scope: unknown): string {
  if (Array.isArray(scope)) {
    return scope.filter((item): item is string => typeof item === 'string').join(' ')
  }
  return typeof scope === 'string' ? scope : ''
}

function normalizeTokenPayload(payload: Record<string, unknown>): LinearOauthTokenResponse {
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : ''
  const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : ''
  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 86_399
  if (!accessToken || !refreshToken) {
    throw new LinearApiError('Linear OAuth token response was missing required tokens.', {
      status: 400,
      retryable: false,
    })
  }

  return {
    accessToken,
    refreshToken,
    tokenType: typeof payload.token_type === 'string' ? payload.token_type : 'Bearer',
    expiresIn,
    scopes: normalizeScope(payload.scope),
    accessTokenExpiresAt: new Date(Date.now() + Math.max(0, expiresIn - 60) * 1000),
  }
}

async function fetchLinear(
  url: string,
  init: RequestInit,
  failureLabel: string
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LINEAR_REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    throw new LinearApiError(
      aborted
        ? `${failureLabel} timed out after ${LINEAR_REQUEST_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : failureLabel,
      { status: 0, retryable: true }
    )
  } finally {
    clearTimeout(timeout)
  }
}

async function requestOauthToken(body: URLSearchParams): Promise<LinearOauthTokenResponse> {
  const response = await fetchLinear(
    LINEAR_TOKEN_ENDPOINT,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    },
    'Linear OAuth network error'
  )

  const payload = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & LinearOauthErrorResponse)
    | null

  if (!response.ok) {
    throw new LinearApiError(
      redactLinearError(
        payload?.error_description ?? payload?.error ?? `Linear OAuth failed (${response.status})`
      ),
      { status: response.status, retryable: response.status >= 500 || response.status === 429 }
    )
  }

  if (!payload) {
    throw new LinearApiError('Linear OAuth returned an empty response.', {
      status: response.status,
      retryable: true,
    })
  }

  return normalizeTokenPayload(payload)
}

export async function exchangeLinearOauthCode(input: {
  code: string
  redirectUri: string
  clientId: string
  clientSecret: string
}): Promise<LinearOauthTokenResponse> {
  const body = new URLSearchParams({
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: 'authorization_code',
  })

  return requestOauthToken(body)
}

export async function refreshLinearOauthToken(input: {
  refreshToken: string
  clientId: string
  clientSecret: string
}): Promise<LinearOauthTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: 'refresh_token',
  })

  return requestOauthToken(body)
}

export async function revokeLinearOauthToken(input: {
  token: string
  tokenTypeHint: 'access_token' | 'refresh_token'
  clientId: string
  clientSecret: string
}): Promise<void> {
  const body = new URLSearchParams({
    token: input.token,
    token_type_hint: input.tokenTypeHint,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  })

  const response = await fetchLinear(
    LINEAR_REVOKE_ENDPOINT,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    },
    'Linear OAuth revoke network error'
  )

  if (!response.ok && response.status !== 400) {
    throw new LinearApiError(`Linear OAuth revoke failed (${response.status})`, {
      status: response.status,
      retryable: response.status >= 500 || response.status === 429,
    })
  }
}

async function linearGraphql<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetchLinear(
    LINEAR_GRAPHQL_ENDPOINT,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    },
    'Linear network error'
  )

  const rateLimitResetAt = parseRateLimitReset(response.headers)
  const retryable =
    response.status === 429 ||
    response.status === 408 ||
    response.status >= 500 ||
    response.status === 0

  let payload: LinearGraphQLResponse<T> | null = null
  try {
    payload = (await response.json()) as LinearGraphQLResponse<T>
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new LinearApiError(
      redactLinearError(
        payload?.errors?.[0]?.message ?? `Linear request failed (${response.status})`
      ),
      { status: response.status, retryable, rateLimitResetAt }
    )
  }

  if (payload?.errors?.length) {
    const code = payload.errors[0]?.extensions?.code ?? payload.errors[0]?.extensions?.type
    const retryableGraphql = code === 'RATELIMITED' || code === 'INTERNAL_ERROR'
    throw new LinearApiError(
      redactLinearError(payload.errors[0]?.message ?? 'Linear GraphQL error'),
      {
        status: code === 'AUTHENTICATION_ERROR' ? 401 : 400,
        retryable: retryableGraphql,
        rateLimitResetAt,
      }
    )
  }

  if (!payload?.data) {
    throw new LinearApiError('Linear returned an empty response.', {
      status: response.status,
      retryable: true,
      rateLimitResetAt,
    })
  }

  return payload.data
}

export async function validateLinearAccessToken(
  accessToken: string
): Promise<{ organizationName: string }> {
  const data = await linearGraphql<{ organization: { name: string } }>(
    accessToken,
    'query DurabullValidateLinearToken { organization { name } }'
  )

  return { organizationName: data.organization.name }
}

export async function fetchLinearMetadata(accessToken: string): Promise<LinearMetadata> {
  const data = await linearGraphql<{
    teams: { nodes: LinearTeamSummary[] }
    projects: { nodes: Array<{ id: string; name: string }> }
    issueLabels: { nodes: Array<{ id: string; name: string }> }
    users: { nodes: Array<{ id: string; name: string; email?: string | null }> }
    workflowStates: { nodes: Array<{ id: string; name: string; team: { id: string } }> }
  }>(
    accessToken,
    `query DurabullLinearMetadata {
      teams(first: 100) { nodes { id name key } }
      projects(first: 100) { nodes { id name } }
      issueLabels(first: 100) { nodes { id name } }
      users(first: 100) { nodes { id name email } }
      workflowStates(first: 250) { nodes { id name team { id } } }
    }`
  )

  return {
    teams: data.teams.nodes,
    projects: data.projects.nodes,
    labels: data.issueLabels.nodes,
    users: data.users.nodes,
    states: data.workflowStates.nodes.map((state) => ({
      id: state.id,
      name: state.name,
      teamId: state.team.id,
    })),
  }
}

export async function createLinearIssue(
  accessToken: string,
  input: LinearIssueInput
): Promise<LinearIssueResult> {
  const data = await linearGraphql<{
    issueCreate: {
      success: boolean
      issue?: LinearIssueResult | null
    }
  }>(
    accessToken,
    `mutation DurabullCreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url }
      }
    }`,
    {
      input: {
        teamId: input.teamId,
        title: input.title,
        description: input.description,
        ...(input.projectId !== null && input.projectId !== undefined
          ? { projectId: input.projectId }
          : {}),
        ...(input.labelIds?.length ? { labelIds: input.labelIds } : {}),
        ...(input.assigneeId !== null && input.assigneeId !== undefined
          ? { assigneeId: input.assigneeId }
          : {}),
        ...(input.stateId !== null && input.stateId !== undefined
          ? { stateId: input.stateId }
          : {}),
        ...(input.priority !== null && input.priority !== undefined
          ? { priority: input.priority }
          : {}),
      },
    }
  )

  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new LinearApiError('Linear did not create an issue.', { status: 400, retryable: false })
  }

  return data.issueCreate.issue
}

export interface LinearWorkflowState {
  id: string
  name: string
  type: string
  position: number
}

export interface LinearIssueStatus {
  id: string
  identifier: string
  state: { id: string; name: string; type: string }
  teamStates: LinearWorkflowState[]
}

/**
 * Load an issue's current workflow state along with all states on its team, so
 * callers can pick the team's "completed" state without knowing team config.
 */
export async function fetchLinearIssueStatus(
  accessToken: string,
  issueId: string
): Promise<LinearIssueStatus> {
  const data = await linearGraphql<{
    issue: {
      id: string
      identifier: string
      state: { id: string; name: string; type: string }
      team: { states: { nodes: LinearWorkflowState[] } }
    }
  }>(
    accessToken,
    `query DurabullIssueStatus($issueId: String!) {
      issue(id: $issueId) {
        id
        identifier
        state { id name type }
        team { states(first: 50) { nodes { id name type position } } }
      }
    }`,
    { issueId }
  )

  return {
    id: data.issue.id,
    identifier: data.issue.identifier,
    state: data.issue.state,
    teamStates: data.issue.team.states.nodes,
  }
}

export async function updateLinearIssueState(
  accessToken: string,
  issueId: string,
  stateId: string
): Promise<void> {
  const data = await linearGraphql<{ issueUpdate: { success: boolean } }>(
    accessToken,
    `mutation DurabullCompleteIssue($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
      }
    }`,
    { issueId, stateId }
  )

  if (!data.issueUpdate.success) {
    throw new LinearApiError('Linear did not update the issue state.', {
      status: 400,
      retryable: false,
    })
  }
}

export async function createLinearComment(
  accessToken: string,
  issueId: string,
  body: string
): Promise<void> {
  const data = await linearGraphql<{ commentCreate: { success: boolean } }>(
    accessToken,
    `mutation DurabullCommentOnIssue($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
      }
    }`,
    { issueId, body }
  )

  if (!data.commentCreate.success) {
    throw new LinearApiError('Linear did not create the comment.', {
      status: 400,
      retryable: false,
    })
  }
}
