import { SLACK_BOT_EVENTS, SLACK_BOT_SCOPES, SLACK_SLASH_COMMAND } from './config'

/**
 * Slack app manifest for a Durabull deployment. Paste the output into
 * https://api.slack.com/apps → Create New App → From a manifest. Every URL is
 * derived from the deployment's public origin, and the scopes are the ones the
 * OAuth flow requests.
 */
export function buildSlackAppManifest(input: {
  baseUrl: string
  appName?: string
  /** OAuth callback when it differs from {baseUrl}/api/integrations/slack/callback. */
  redirectUri?: string
  /**
   * Leave out Event Subscriptions (and link unfurling, which depends on them).
   * Slack verifies the events URL when a manifest is saved, so an app created
   * before Durabull is reachable is created without them; save the full
   * manifest once Durabull is deployed.
   */
  skipEvents?: boolean
}) {
  const baseUrl = input.baseUrl.replace(/\/+$/, '')
  const { hostname } = new URL(baseUrl)
  const appName = input.appName?.trim() || 'Durabull'

  return {
    _metadata: { major_version: 1, minor_version: 1 },
    display_information: {
      name: appName,
      description: 'BullMQ alerts, incident actions and queue lookups from Durabull.',
      background_color: '#141414',
      long_description:
        'Durabull watches your BullMQ queues on Redis. The Slack app delivers alert incidents to the channels you choose, lets your team acknowledge, resolve, snooze and retry right from the message, answers status, alerts, queue and job lookups through /durabull, @Durabull mentions or direct messages, and previews Durabull links pasted into Slack. Messages update themselves when an incident changes anywhere in Durabull.',
    },
    features: {
      app_home: {
        home_tab_enabled: true,
        // People can message the app directly with the same commands as /durabull.
        messages_tab_enabled: true,
        messages_tab_read_only_enabled: false,
      },
      bot_user: { display_name: appName, always_online: true },
      slash_commands: [
        {
          command: SLACK_SLASH_COMMAND,
          url: `${baseUrl}/api/slack/commands`,
          description: 'Check queues, incidents and jobs in Durabull',
          usage_hint: 'status | alerts | queue <name> | job <id> | help',
          should_escape: false,
        },
      ],
      // Slack only accepts unfurl domains alongside an Events API subscription.
      ...(input.skipEvents ? {} : { unfurl_domains: [hostname] }),
    },
    oauth_config: {
      redirect_urls: [input.redirectUri ?? `${baseUrl}/api/integrations/slack/callback`],
      scopes: { bot: [...SLACK_BOT_SCOPES] },
    },
    settings: {
      ...(input.skipEvents
        ? {}
        : {
            event_subscriptions: {
              request_url: `${baseUrl}/api/slack/events`,
              bot_events: [...SLACK_BOT_EVENTS],
            },
          }),
      interactivity: {
        is_enabled: true,
        request_url: `${baseUrl}/api/slack/interactions`,
      },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  }
}
