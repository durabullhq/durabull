/**
 * Minimal Slack Web API client. Durabull talks to a handful of methods, so a
 * typed fetch wrapper is clearer (and smaller) than the official SDK, and it
 * classifies failures the same way the alert outbox does: retryable,
 * rate-limited with a reset time, or a permanent configuration error.
 */

const SLACK_API_BASE_URL = 'https://slack.com/api'
const REQUEST_TIMEOUT_MS = 10_000

/** Errors that mean the bot token no longer works for the workspace. */
const AUTH_ERROR_CODES = new Set([
  'invalid_auth',
  'not_authed',
  'account_inactive',
  'token_revoked',
  'token_expired',
  'team_access_not_granted',
  'org_login_required',
  'two_factor_setup_required',
])

const RETRYABLE_ERROR_CODES = new Set([
  'ratelimited',
  'rate_limited',
  'internal_error',
  'fatal_error',
  'service_unavailable',
  'request_timeout',
  'team_added_to_org',
])

const ERROR_MESSAGES: Record<string, string> = {
  channel_not_found:
    'Slack channel not found. It may have been deleted, or it is private: invite the app with /invite @Durabull in the channel.',
  not_in_channel: 'The Durabull app is not in this channel. Invite @Durabull to the channel.',
  is_archived: 'The Slack channel is archived.',
  missing_scope:
    'The Slack app is missing a required permission. Reconnect Slack to grant the current scopes.',
  invalid_auth: 'Slack rejected the bot token. Reconnect Slack.',
  token_revoked: 'The Slack bot token was revoked. Reconnect Slack.',
  account_inactive: 'The Slack app was removed from the workspace. Reconnect Slack.',
  restricted_action: 'A Slack workspace policy prevented this action.',
  msg_too_long: 'The Slack message was too long.',
  invalid_blocks: 'Slack rejected the message layout.',
  ratelimited: 'Slack rate limit reached.',
}

export class SlackApiError extends Error {
  readonly code: string
  readonly status: number
  readonly retryable: boolean
  readonly rateLimitResetAt: Date | null

  constructor(
    code: string,
    options: {
      status?: number
      retryable?: boolean
      retryAfterSeconds?: number | null
      message?: string
    } = {}
  ) {
    super(options.message ?? ERROR_MESSAGES[code] ?? `Slack API error: ${code}`)
    this.name = 'SlackApiError'
    this.code = code
    this.status = options.status ?? 400
    this.retryable = options.retryable ?? RETRYABLE_ERROR_CODES.has(code)
    this.rateLimitResetAt =
      options.retryAfterSeconds && options.retryAfterSeconds > 0
        ? new Date(Date.now() + options.retryAfterSeconds * 1000)
        : null
  }

  /** The token can no longer act for the workspace; the installation needs reconnecting. */
  get isAuthError(): boolean {
    return AUTH_ERROR_CODES.has(this.code)
  }
}

type SlackParams = Record<string, unknown>

interface SlackResponse {
  ok: boolean
  error?: string
  warning?: string
  response_metadata?: { next_cursor?: string; messages?: string[] }
  [key: string]: unknown
}

function encodeForm(params: SlackParams): URLSearchParams {
  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
  }
  return form
}

async function readSlackResponse(response: Response): Promise<SlackResponse> {
  if (response.status === 429) {
    const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10)
    throw new SlackApiError('ratelimited', {
      status: 429,
      retryable: true,
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 30,
    })
  }
  if (response.status >= 500) {
    throw new SlackApiError('service_unavailable', {
      status: response.status,
      retryable: true,
      message: `Slack returned HTTP ${response.status}.`,
    })
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  // Anything but a JSON object (including `null`) is unreadable, and so an
  // ambiguous outcome for writes.
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new SlackApiError('invalid_response', {
      status: response.status,
      retryable: response.status >= 500,
      message: `Slack returned an unreadable response (HTTP ${response.status}).`,
    })
  }
  return checkSlackBody(body as SlackResponse, response.status)
}

function checkSlackBody(body: SlackResponse, status: number): SlackResponse {
  if (!body.ok) {
    throw new SlackApiError(body.error ?? 'unknown_error', { status })
  }
  return body
}

/** Connection errors raised before a request reaches Slack (Node and Bun spellings). */
const CONNECT_FAILURE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ConnectionRefused',
  'FailedToOpenSocket',
])

function isConnectFailure(error: unknown): boolean {
  const codes = [
    (error as { code?: unknown } | null)?.code,
    (error as { cause?: { code?: unknown } } | null)?.cause?.code,
  ]
  return codes.some((code) => typeof code === 'string' && CONNECT_FAILURE_CODES.has(code))
}

/**
 * Failures after which Slack may or may not have acted on the request: it was
 * sent, but no definite answer came back. Rate limits and connection failures
 * are definite, so they are not in this set.
 */
const AMBIGUOUS_ERROR_CODES = new Set([
  'request_timeout',
  'network_error',
  'service_unavailable',
  'invalid_response',
  'internal_error',
  'fatal_error',
])

/** True when a write may have taken effect in Slack even though it reported failure. */
export function isAmbiguousSlackFailure(error: unknown): boolean {
  return error instanceof SlackApiError && AMBIGUOUS_ERROR_CODES.has(error.code)
}

async function sendRequest(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    if (!timedOut && isConnectFailure(error)) {
      throw new SlackApiError('connect_failed', {
        status: 503,
        retryable: true,
        message: `Could not reach Slack: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
    throw new SlackApiError(timedOut ? 'request_timeout' : 'network_error', {
      status: 503,
      retryable: true,
      message: timedOut
        ? 'Slack did not respond in time.'
        : `Could not reach Slack: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

/**
 * Calls a Slack Web API method. Methods carrying Block Kit payloads are sent as
 * JSON; read methods are sent form-encoded, which every method accepts.
 */
export async function callSlack<T extends SlackResponse = SlackResponse>(
  method: string,
  token: string,
  params: SlackParams = {},
  options: { json?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  let body: string | URLSearchParams
  if (options.json) {
    headers['Content-Type'] = 'application/json; charset=utf-8'
    body = JSON.stringify(params)
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = encodeForm(params)
  }
  const response = await sendRequest(`${SLACK_API_BASE_URL}/${method}`, {
    method: 'POST',
    headers,
    body,
  })
  return (await readSlackResponse(response)) as T
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export interface SlackOauthResult {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  scopes: string
  botUserId: string
  appId: string | null
  teamId: string
  teamName: string
  enterpriseId: string | null
  authedUserId: string | null
}

interface OauthV2AccessResponse extends SlackResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  bot_user_id?: string
  app_id?: string
  team?: { id?: string; name?: string } | null
  enterprise?: { id?: string } | null
  authed_user?: { id?: string } | null
}

async function oauthV2Access(
  params: Record<string, string>,
  clientId: string,
  clientSecret: string
) {
  const response = await sendRequest(`${SLACK_API_BASE_URL}/oauth.v2.access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams(params),
  })
  return (await readSlackResponse(response)) as OauthV2AccessResponse
}

function toOauthResult(body: OauthV2AccessResponse): SlackOauthResult {
  if (!body.access_token || !body.bot_user_id || !body.team?.id) {
    throw new SlackApiError('invalid_oauth_response', {
      message: 'Slack did not return a bot token for the workspace.',
    })
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt:
      typeof body.expires_in === 'number' ? new Date(Date.now() + body.expires_in * 1000) : null,
    scopes: body.scope ?? '',
    botUserId: body.bot_user_id,
    appId: body.app_id ?? null,
    teamId: body.team.id,
    teamName: body.team.name ?? body.team.id,
    enterpriseId: body.enterprise?.id ?? null,
    authedUserId: body.authed_user?.id ?? null,
  }
}

export async function exchangeSlackOauthCode(input: {
  code: string
  redirectUri: string
  clientId: string
  clientSecret: string
}): Promise<SlackOauthResult> {
  return toOauthResult(
    await oauthV2Access(
      { code: input.code, redirect_uri: input.redirectUri, grant_type: 'authorization_code' },
      input.clientId,
      input.clientSecret
    )
  )
}

/** Only used when the Slack app has token rotation enabled. */
export async function refreshSlackToken(input: {
  refreshToken: string
  clientId: string
  clientSecret: string
}): Promise<SlackOauthResult> {
  return toOauthResult(
    await oauthV2Access(
      { refresh_token: input.refreshToken, grant_type: 'refresh_token' },
      input.clientId,
      input.clientSecret
    )
  )
}

// ---------------------------------------------------------------------------
// Workspace, users and channels
// ---------------------------------------------------------------------------

export interface SlackAuthTest {
  teamId: string
  teamName: string
  url: string | null
  botUserId: string | null
}

export async function slackAuthTest(token: string): Promise<SlackAuthTest> {
  const body = await callSlack<
    SlackResponse & { team_id?: string; team?: string; url?: string; user_id?: string }
  >('auth.test', token)
  return {
    teamId: body.team_id ?? '',
    teamName: body.team ?? '',
    url: body.url ?? null,
    botUserId: body.user_id ?? null,
  }
}

export async function slackAuthRevoke(token: string): Promise<void> {
  await callSlack('auth.revoke', token)
}

/**
 * Removes the app from the workspace, revoking every token it holds there
 * (with token rotation, `auth.revoke` would only revoke the one passed).
 */
export async function slackAppsUninstall(input: {
  token: string
  clientId: string
  clientSecret: string
}): Promise<void> {
  await callSlack('apps.uninstall', input.token, {
    client_id: input.clientId,
    client_secret: input.clientSecret,
  })
}

export interface SlackChannel {
  id: string
  name: string
  isPrivate: boolean
  isMember: boolean
  isArchived: boolean
}

interface ConversationsListResponse extends SlackResponse {
  channels?: Array<{
    id: string
    name?: string
    is_private?: boolean
    is_member?: boolean
    is_archived?: boolean
  }>
}

/** Public channels, plus private channels the bot has been invited to. */
export async function listSlackChannels(
  token: string,
  options: { maxPages?: number } = {}
): Promise<{ channels: SlackChannel[]; truncated: boolean }> {
  const channels: SlackChannel[] = []
  let cursor: string | undefined
  const maxPages = options.maxPages ?? 10
  for (let page = 0; page < maxPages; page++) {
    const body = await callSlack<ConversationsListResponse>('conversations.list', token, {
      types: 'public_channel,private_channel',
      exclude_archived: true,
      // Slack requires a page size under 1000.
      limit: 999,
      cursor,
    })
    for (const channel of body.channels ?? []) {
      channels.push({
        id: channel.id,
        name: channel.name ?? channel.id,
        isPrivate: Boolean(channel.is_private),
        isMember: Boolean(channel.is_member),
        isArchived: Boolean(channel.is_archived),
      })
    }
    cursor = body.response_metadata?.next_cursor || undefined
    if (!cursor) return { channels, truncated: false }
  }
  return { channels, truncated: true }
}

export async function getSlackChannel(token: string, channelId: string): Promise<SlackChannel> {
  const body = await callSlack<
    SlackResponse & {
      channel?: {
        id: string
        name?: string
        is_private?: boolean
        is_member?: boolean
        is_archived?: boolean
        is_im?: boolean
        is_mpim?: boolean
      }
    }
  >('conversations.info', token, { channel: channelId })
  const channel = body.channel
  if (!channel) throw new SlackApiError('channel_not_found')
  if (channel.is_im || channel.is_mpim) {
    throw new SlackApiError('not_a_channel', {
      message: 'Choose a public or private channel; direct messages cannot receive alerts.',
    })
  }
  return {
    id: channel.id,
    name: channel.name ?? channel.id,
    isPrivate: Boolean(channel.is_private),
    isMember: Boolean(channel.is_member),
    isArchived: Boolean(channel.is_archived),
  }
}

export interface SlackUser {
  id: string
  /** Home workspace; differs from the installation for Slack Connect guests. */
  teamId: string | null
  enterpriseId: string | null
  name: string
  email: string | null
  isBot: boolean
  deleted: boolean
}

export async function getSlackUser(token: string, userId: string): Promise<SlackUser> {
  const body = await callSlack<
    SlackResponse & {
      user?: {
        id: string
        team_id?: string
        name?: string
        real_name?: string
        deleted?: boolean
        is_bot?: boolean
        enterprise_user?: { enterprise_id?: string }
        profile?: { email?: string; real_name?: string; display_name?: string }
      }
    }
  >('users.info', token, { user: userId })
  const user = body.user
  if (!user) throw new SlackApiError('user_not_found')
  return {
    id: user.id,
    teamId: user.team_id ?? null,
    enterpriseId: user.enterprise_user?.enterprise_id ?? null,
    name:
      user.profile?.display_name ||
      user.profile?.real_name ||
      user.real_name ||
      user.name ||
      user.id,
    email: user.profile?.email ?? null,
    isBot: Boolean(user.is_bot),
    deleted: Boolean(user.deleted),
  }
}

export interface SlackUserGroup {
  id: string
  handle: string
  name: string
}

/** Empty on Slack plans without user groups rather than an error. */
export async function listSlackUserGroups(token: string): Promise<SlackUserGroup[]> {
  try {
    const body = await callSlack<
      SlackResponse & { usergroups?: Array<{ id: string; handle?: string; name?: string }> }
    >('usergroups.list', token, { include_disabled: false })
    return (body.usergroups ?? []).map((group) => ({
      id: group.id,
      handle: group.handle ?? group.id,
      name: group.name ?? group.handle ?? group.id,
    }))
  } catch (error) {
    if (
      error instanceof SlackApiError &&
      [
        'paid_teams_only',
        'plan_upgrade_required',
        'not_allowed_token_type',
        'missing_scope',
      ].includes(error.code)
    ) {
      return []
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Messages, views and unfurls
// ---------------------------------------------------------------------------

export interface SlackMessagePayload {
  channel: string
  text: string
  blocks?: unknown[]
  attachments?: unknown[]
  thread_ts?: string
  unfurl_links?: boolean
  unfurl_media?: boolean
}

export async function postSlackMessage(
  token: string,
  message: SlackMessagePayload
): Promise<{ channel: string; ts: string }> {
  const body = await callSlack<SlackResponse & { channel?: string; ts?: string }>(
    'chat.postMessage',
    token,
    { unfurl_links: false, unfurl_media: false, ...message },
    { json: true }
  )
  if (!body.ts) throw new SlackApiError('invalid_response', { message: 'Slack returned no ts.' })
  return { channel: body.channel ?? message.channel, ts: body.ts }
}

export async function updateSlackMessage(
  token: string,
  message: Omit<SlackMessagePayload, 'thread_ts' | 'unfurl_links' | 'unfurl_media'> & {
    ts: string
  }
): Promise<void> {
  await callSlack('chat.update', token, message, { json: true })
}

export async function postSlackEphemeral(
  token: string,
  message: { channel: string; user: string; text: string; blocks?: unknown[]; thread_ts?: string }
): Promise<void> {
  await callSlack('chat.postEphemeral', token, message, { json: true })
}

export async function getSlackPermalink(
  token: string,
  channel: string,
  ts: string
): Promise<string | null> {
  try {
    const body = await callSlack<SlackResponse & { permalink?: string }>(
      'chat.getPermalink',
      token,
      { channel, message_ts: ts }
    )
    return body.permalink ?? null
  } catch {
    return null
  }
}

export async function publishSlackHomeView(
  token: string,
  userId: string,
  view: unknown
): Promise<void> {
  await callSlack('views.publish', token, { user_id: userId, view }, { json: true })
}

export async function unfurlSlackLinks(
  token: string,
  input:
    | { channel: string; ts: string; unfurls: Record<string, unknown> }
    | { unfurl_id: string; source: string; unfurls: Record<string, unknown> }
): Promise<void> {
  await callSlack('chat.unfurl', token, input, { json: true })
}

/** Response URLs from commands and interactions accept delayed replies for 30 minutes. */
export function isSlackResponseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'slack.com' || url.hostname.endsWith('.slack.com'))
    )
  } catch {
    return false
  }
}

export async function postToSlackResponseUrl(
  responseUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!isSlackResponseUrl(responseUrl)) {
    throw new SlackApiError('invalid_response_url', {
      message: 'Refusing a non-Slack response URL.',
    })
  }
  const response = await sendRequest(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new SlackApiError('response_url_failed', {
      status: response.status,
      retryable: response.status >= 500,
      message: `Slack response URL returned HTTP ${response.status}.`,
    })
  }
}
