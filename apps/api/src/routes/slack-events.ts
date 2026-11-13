import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { SLACK_ACTIONS } from '../lib/slack/alert-message'
import { finishOrContinueInBackground, runInBackground } from '../lib/slack/background'
import { getSlackConfig, isSlackConfigured } from '../lib/slack/config'
import {
  handleAppUninstalled,
  handleBlockActions,
  handleConversationMessage,
  handleLinkShared,
  handleSlashCommand,
  parseCommandText,
  publishHomeTab,
  type SlackBlockActionsPayload,
  type SlackLinkSharedEvent,
} from '../lib/slack/handlers'
import { verifySlackSignature } from '../lib/slack/verify'
import { helpBlocks } from '../lib/slack/views'

declare module 'hono' {
  interface ContextVariableMap {
    slackRawBody: string
  }
}

const EVENT_DEDUPE_TTL_MS = 10 * 60_000
const seenEventIds = new Map<string, number>()

/** Slack retries events it did not see acknowledged; handle each id once per process. */
function firstDelivery(eventId: string | undefined): boolean {
  if (!eventId) return true
  const now = Date.now()
  for (const [id, expiresAt] of seenEventIds) {
    if (expiresAt > now) break
    seenEventIds.delete(id)
  }
  if (seenEventIds.has(eventId)) return false
  seenEventIds.set(eventId, now + EVENT_DEDUPE_TTL_MS)
  return true
}

export function clearSlackEventDedupe(): void {
  seenEventIds.clear()
}

/**
 * Every request must carry a valid Slack signature over the raw body. Requests
 * for another Slack app are dropped when SLACK_APP_ID is configured.
 */
const verifySlackRequest = createMiddleware(async (c, next) => {
  if (!isSlackConfigured()) {
    return c.json({ error: 'Slack is not configured for this deployment.' }, 503)
  }
  const { signingSecret } = getSlackConfig()
  const rawBody = await c.req.text()
  const result = verifySlackSignature({
    signingSecret,
    timestamp: c.req.header('x-slack-request-timestamp'),
    signature: c.req.header('x-slack-signature'),
    rawBody,
  })
  if (!result.ok) {
    return c.json({ error: 'Invalid Slack signature', reason: result.reason }, 401)
  }
  c.set('slackRawBody', rawBody)
  await next()
})

function appIdMismatch(apiAppId: unknown): boolean {
  const { appId } = getSlackConfig()
  return Boolean(appId && typeof apiAppId === 'string' && apiAppId !== appId)
}

interface SlackEventEnvelope {
  /** When the event happened, in Unix seconds. */
  event_time?: number
  type: string
  challenge?: string
  team_id?: string
  api_app_id?: string
  event_id?: string
  event?: {
    type: string
    user?: string
    tab?: string
    text?: string
    ts?: string
    thread_ts?: string
    channel_type?: string
    subtype?: string
    bot_id?: string
    tokens?: { bot?: string[] }
  } & Partial<SlackLinkSharedEvent>
}

const app = new Hono()
  .use('*', verifySlackRequest)
  .post('/events', async (c) => {
    let envelope: SlackEventEnvelope
    try {
      envelope = JSON.parse(c.get('slackRawBody')) as SlackEventEnvelope
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }
    if (envelope.type === 'url_verification') {
      return c.json({ challenge: envelope.challenge ?? '' })
    }
    if (
      envelope.type !== 'event_callback' ||
      !envelope.event ||
      appIdMismatch(envelope.api_app_id)
    ) {
      return c.body(null, 200)
    }
    const teamId = envelope.team_id ?? ''
    const event = envelope.event

    if (event.type === 'app_uninstalled' || event.type === 'tokens_revoked') {
      if (event.type === 'tokens_revoked' && (event.tokens?.bot?.length ?? 0) === 0) {
        return c.body(null, 200)
      }
      // Not de-duplicated: recording a revocation is safe to repeat, so every
      // delivery (including a retry that arrives while the first is still
      // being recorded) waits for its own result, and a failure returns 500
      // so Slack retries.
      try {
        await handleAppUninstalled(
          teamId,
          event.type,
          typeof envelope.event_time === 'number' ? new Date(envelope.event_time * 1000) : undefined
        )
      } catch (error) {
        console.error('[slack] Recording workspace revocation failed:', error)
        return c.json({ error: 'Could not record the revocation.' }, 500)
      }
      return c.body(null, 200)
    }

    if (!firstDelivery(envelope.event_id)) return c.body(null, 200)
    switch (event.type) {
      case 'app_home_opened':
        if (event.tab === 'home' && event.user) {
          const userId = event.user
          runInBackground('home tab', () => publishHomeTab(teamId, userId))
        }
        break
      case 'app_mention':
      case 'message': {
        // Never answer bots (including Durabull's own replies) or edits/joins.
        if (event.bot_id || event.subtype || !event.user || !event.channel || !event.ts) break
        const direct = event.type === 'message'
        // Plain channel messages arrive only for DMs; mentions inside a DM come as messages.
        if (direct && event.channel_type !== 'im') break
        if (!direct && event.channel.startsWith('D')) break
        const message = {
          teamId,
          userId: event.user,
          channel: event.channel,
          ts: event.ts,
          threadTs: event.thread_ts,
          text: event.text ?? '',
          direct,
        }
        runInBackground('conversation message', () => handleConversationMessage(message))
        break
      }
      case 'link_shared':
        if (event.user && Array.isArray(event.links)) {
          const linkEvent = event as SlackLinkSharedEvent
          runInBackground('link unfurl', () => handleLinkShared(teamId, linkEvent))
        }
        break
    }
    return c.body(null, 200)
  })
  .post('/commands', async (c) => {
    const form = new URLSearchParams(c.get('slackRawBody'))
    if (appIdMismatch(form.get('api_app_id'))) return c.body(null, 200)
    const text = form.get('text') ?? ''
    const teamId = form.get('team_id') ?? ''
    const userId = form.get('user_id') ?? ''
    const responseUrl = form.get('response_url') ?? ''

    if (parseCommandText(text).command === 'help') {
      return c.json({ response_type: 'ephemeral', text: 'Durabull commands', blocks: helpBlocks() })
    }
    runInBackground('slash command', () =>
      handleSlashCommand({
        teamId,
        userId,
        text,
        responseUrl,
        channelId: form.get('channel_id') ?? undefined,
      })
    )
    return c.json({
      response_type: 'ephemeral',
      text: ':hourglass_flowing_sand: Checking Durabull…',
    })
  })
  .post('/interactions', async (c) => {
    const form = new URLSearchParams(c.get('slackRawBody'))
    let payload: { type?: string; api_app_id?: string; actions?: Array<{ action_id?: string }> }
    try {
      payload = JSON.parse(form.get('payload') ?? '{}')
    } catch {
      return c.json({ error: 'Invalid payload' }, 400)
    }
    if (appIdMismatch(payload.api_app_id)) return c.body(null, 200)
    if (payload.type === 'block_actions' && Array.isArray(payload.actions)) {
      const onlyLinks = payload.actions.every((action) =>
        action.action_id?.startsWith(SLACK_ACTIONS.openLink)
      )
      if (!onlyLinks) {
        const actions = payload as SlackBlockActionsPayload
        // Slack does not retry interactions, so give the action most of the
        // three-second window to finish (and persist) before acknowledging;
        // slower work, such as re-rendering many messages, finishes after.
        await finishOrContinueInBackground('interaction', () => handleBlockActions(actions))
      }
    }
    return c.body(null, 200)
  })

export default app
