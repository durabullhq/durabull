import type { SlackDestinationConfig } from '@/hooks/use-alerts'

/** Settings a new Slack destination starts with. */
export const DEFAULT_SLACK_DESTINATION_CONFIG: Partial<SlackDestinationConfig> = {
  mention: 'none',
  threadUpdates: true,
}

/** Default destination name for a channel, e.g. "Slack #alerts". */
export function slackDestinationName(config: Partial<SlackDestinationConfig>): string {
  return `Slack #${config.channelName ?? config.channelId ?? 'alerts'}`
}

/** Slack conversation ids for public (C…) and private (G…) channels. */
export const SLACK_CHANNEL_ID_PATTERN = /^[CG][A-Z0-9]{2,}$/

/** A channel id typed or pasted by hand, normalized; null if it is not one. */
export function parseSlackChannelId(value: string): string | null {
  const id = value.trim().toUpperCase()
  return SLACK_CHANNEL_ID_PATTERN.test(id) ? id : null
}
