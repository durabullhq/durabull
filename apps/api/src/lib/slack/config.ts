import { env } from '@durabull/env'

/**
 * Bot scopes requested at install. The app manifest is generated from the same
 * list (see manifest.ts), so the two cannot drift.
 */
export const SLACK_BOT_SCOPES = [
  // Post and update alert messages; post to public channels without joining.
  'chat:write',
  'chat:write.public',
  // Channel picker for alert destinations.
  'channels:read',
  'groups:read',
  // The /durabull slash command.
  'commands',
  // Answer "@Durabull status" in channels and messages sent to the app directly.
  'app_mentions:read',
  'im:history',
  // Match Slack users to Durabull members by their verified email.
  'users:read',
  'users:read.email',
  // Mention on-call user groups on firing alerts.
  'usergroups:read',
  // Preview Durabull links pasted into Slack.
  'links:read',
  'links:write',
] as const

export const SLACK_BOT_EVENTS = [
  'app_home_opened',
  'app_mention',
  'message.im',
  'link_shared',
  'app_uninstalled',
  'tokens_revoked',
] as const

export const SLACK_SLASH_COMMAND = '/durabull'

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize'

export interface SlackConfig {
  clientId: string
  clientSecret: string
  signingSecret: string
  appId: string | null
  redirectUri: string
}

export function appBaseUrl(): string {
  return env.APP_BASE_URL.replace(/\/+$/, '')
}

/** Slack is available when the deployment has an app's credentials. */
export function isSlackConfigured(): boolean {
  return Boolean(
    env.SLACK_CLIENT_ID?.trim() &&
      env.SLACK_CLIENT_SECRET?.trim() &&
      env.SLACK_SIGNING_SECRET?.trim()
  )
}

export class SlackNotConfiguredError extends Error {
  constructor() {
    super(
      'Slack is not configured for this Durabull deployment. Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET and SLACK_SIGNING_SECRET.'
    )
    this.name = 'SlackNotConfiguredError'
  }
}

export function getSlackConfig(): SlackConfig {
  const clientId = env.SLACK_CLIENT_ID?.trim()
  const clientSecret = env.SLACK_CLIENT_SECRET?.trim()
  const signingSecret = env.SLACK_SIGNING_SECRET?.trim()
  if (!clientId || !clientSecret || !signingSecret) throw new SlackNotConfiguredError()
  return {
    clientId,
    clientSecret,
    signingSecret,
    appId: env.SLACK_APP_ID?.trim() || null,
    redirectUri:
      env.SLACK_OAUTH_REDIRECT_URI?.trim() || `${appBaseUrl()}/api/integrations/slack/callback`,
  }
}

export function buildSlackAuthorizeUrl(input: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    scope: SLACK_BOT_SCOPES.join(','),
    redirect_uri: input.redirectUri,
    state: input.state,
  })
  return `${SLACK_AUTHORIZE_URL}?${params.toString()}`
}
