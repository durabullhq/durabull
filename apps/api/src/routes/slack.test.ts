import { afterEach, beforeEach, describe, expect, it, type Mock, spyOn } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  alertDeliveryRepository,
  alertDestinationRepository,
  alertEventRepository,
  alertRuleRepository,
  closeDb,
  encryptRedisUrl,
  getDb,
  member,
  organization,
  redisConnection,
  slackAlertMessageRepository,
  slackInstallationRepository,
  user,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { Hono } from 'hono'
import { invalidateEntitlementCache } from '../billing/entitlements'
import { toBillingHttpError } from '../billing/errors'
import { setBillingConfigForTests } from '../billing/config'
import { dispatchAlertNotification } from '../lib/alert-notifier'
import { SLACK_ACTIONS } from '../lib/slack/alert-message'
import { syncSlackAlertMessages } from '../lib/slack/alerts'
import { flushSlackBackgroundWork } from '../lib/slack/background'
import { SLACK_BOT_SCOPES } from '../lib/slack/config'
import { clearSlackProfileCache } from '../lib/slack/identity'
import { signSlackRequest } from '../lib/slack/verify'
import { clearSlackEventDedupe } from './slack-events'
import { clearSlackChannelCache } from './slack-integration'

const ORG_ID = 'slack-org'
const CONNECTION_ID = '66666666-6666-4666-8666-666666666666'
const SIGNING_SECRET = 'slack-signing-secret'
const BASE_URL = 'https://app.durabull.test'

const mutableEnv = env as Record<string, unknown>
const original = { ...mutableEnv }
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR
let tempDir = ''

interface SlackCall {
  method: string
  body: Record<string, unknown>
}

/** A stand-in for slack.com: records every Web API call and response URL post. */
class FakeSlack {
  calls: SlackCall[] = []
  responseUrlPosts: Array<Record<string, unknown>> = []
  emails: Record<string, string> = { UADA: 'ada@example.com', UEVE: 'eve@elsewhere.test' }
  channels: Record<string, { name: string; is_private: boolean; is_member: boolean }> = {
    C0ALERTS: { name: 'alerts', is_private: false, is_member: false },
    G0SECRET: { name: 'secret', is_private: true, is_member: false },
  }
  failures: Record<string, string> = {}
  private ts = 1_700_000_000
  spy: Mock<typeof fetch>

  constructor() {
    this.spy = spyOn(globalThis, 'fetch').mockImplementation((async (
      input: string | URL | Request,
      init?: RequestInit
    ) => this.handle(String(input instanceof Request ? input.url : input), init)) as typeof fetch)
  }

  restore() {
    this.spy.mockRestore()
  }

  callsTo(method: string) {
    return this.calls.filter((call) => call.method === method)
  }

  private async handle(url: string, init?: RequestInit): Promise<Response> {
    const raw = typeof init?.body === 'string' ? init.body : String(init?.body ?? '')
    if (url.startsWith('https://hooks.slack.com/')) {
      this.responseUrlPosts.push(JSON.parse(raw))
      return new Response('ok')
    }
    const method = url.replace('https://slack.com/api/', '')
    const contentType = new Headers(init?.headers).get('content-type') ?? ''
    const body: Record<string, unknown> = contentType.includes('json')
      ? JSON.parse(raw)
      : Object.fromEntries(new URLSearchParams(raw))
    this.calls.push({ method, body })
    if (this.failures[method]) return Response.json({ ok: false, error: this.failures[method] })

    switch (method) {
      case 'oauth.v2.access':
        return Response.json({
          ok: true,
          access_token: 'xoxb-test-token',
          scope: SLACK_BOT_SCOPES.join(','),
          bot_user_id: 'UBOT',
          app_id: 'A0DURABULL',
          team: { id: 'T0ACME', name: 'Acme' },
          authed_user: { id: 'UADA' },
        })
      case 'auth.test':
        return Response.json({
          ok: true,
          team_id: 'T0ACME',
          team: 'Acme',
          url: 'https://acme.slack.com/',
          user_id: 'UBOT',
        })
      case 'auth.revoke':
        return Response.json({ ok: true, revoked: true })
      case 'users.info': {
        const id = String(body.user)
        return Response.json({
          ok: true,
          user: { id, team_id: 'T0ACME', name: id, profile: { email: this.emails[id] } },
        })
      }
      case 'conversations.info': {
        const channel = this.channels[String(body.channel)]
        if (!channel) return Response.json({ ok: false, error: 'channel_not_found' })
        return Response.json({ ok: true, channel: { id: body.channel, ...channel } })
      }
      case 'conversations.list':
        return Response.json({
          ok: true,
          channels: Object.entries(this.channels).map(([id, channel]) => ({ id, ...channel })),
          response_metadata: { next_cursor: '' },
        })
      case 'usergroups.list':
        return Response.json({
          ok: true,
          usergroups: [{ id: 'S0ONCALL', handle: 'oncall', name: 'On-call' }],
        })
      case 'chat.postMessage':
        this.ts += 1
        return Response.json({ ok: true, channel: body.channel, ts: `${this.ts}.000100` })
      case 'chat.getPermalink':
        return Response.json({
          ok: true,
          permalink: `https://acme.slack.com/archives/${body.channel}/p${String(body.message_ts).replace('.', '')}`,
        })
      default:
        return Response.json({ ok: true })
    }
  }
}

async function seed() {
  const db = await getDb()
  const now = new Date()
  await db
    .insert(organization)
    .values({ id: ORG_ID, name: 'Acme', slug: 'acme', createdAt: now, updatedAt: now })
  await db.insert(user).values({
    id: 'user-ada',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: now,
    updatedAt: now,
  })
  await db
    .insert(member)
    .values({
      id: 'm-ada',
      organizationId: ORG_ID,
      userId: 'user-ada',
      role: 'owner',
      createdAt: now,
    })
  await db.insert(redisConnection).values({
    id: CONNECTION_ID,
    name: 'Production Redis',
    url: encryptRedisUrl('redis://localhost:6390/0'),
    environment: 'production',
    isDefault: true,
    organizationId: ORG_ID,
    createdAt: now,
    updatedAt: now,
  })
  const rule = await alertRuleRepository.create({
    organizationId: ORG_ID,
    connectionId: CONNECTION_ID,
    queueName: 'email-send',
    name: 'Email failures',
    type: 'job_failed',
    config: { maxIssuesPerPoll: 10 },
    cooldownMinutes: 30,
  })
  const event = await alertEventRepository.create({
    alertRuleId: rule.id,
    organizationId: ORG_ID,
    connectionId: CONNECTION_ID,
    queueName: 'email-send',
    type: 'job_failed',
    status: 'firing',
    summary: 'Job 42 failed in email-send',
    context: {
      jobId: '42',
      jobName: 'send-welcome',
      attemptsMade: 3,
      attempts: 3,
      failedReason: 'SMTP timeout',
    },
    firedAt: new Date(Date.now() - 5 * 60_000),
  })
  return { rule, event }
}

async function createApp() {
  const { default: integrationRoutes } = await import('./slack-integration')
  const { default: destinationRoutes } = await import('./alert-destinations')
  const { default: eventRoutes } = await import('./slack-events')
  const app = new Hono()
  app.onError((error, c) => {
    const billing = toBillingHttpError(error)
    if (billing) return c.json(billing.body, billing.status)
    throw error
  })
  const session = new Hono()
  session.use('*', async (c, next) => {
    c.set('organizationId', ORG_ID)
    c.set('user', {
      id: 'user-ada',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await next()
  })
  session.route('/integrations/slack', integrationRoutes)
  session.route('/alerts/destinations', destinationRoutes)
  app.route('/api/slack', eventRoutes)
  app.route('/api', session)
  return app
}

function signed(path: string, rawBody: string, contentType: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'X-Slack-Request-Timestamp': String(timestamp),
      'X-Slack-Signature': signSlackRequest({ signingSecret: SIGNING_SECRET, timestamp, rawBody }),
    },
    body: rawBody,
  })
}

function interaction(payload: Record<string, unknown>) {
  const raw = new URLSearchParams({ payload: JSON.stringify(payload) }).toString()
  return signed('/api/slack/interactions', raw, 'application/x-www-form-urlencoded')
}

async function install(app: Hono) {
  const connect = await app.request('/api/integrations/slack/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnTo: 'destinations' }),
  })
  expect(connect.status).toBe(200)
  const { authorizationUrl } = (await connect.json()) as { authorizationUrl: string }
  const state = new URL(authorizationUrl).searchParams.get('state') ?? ''
  return app.request(
    `/api/integrations/slack/callback?code=code-1&state=${encodeURIComponent(state)}`
  )
}

async function createSlackDestination(app: Hono) {
  const response = await app.request('/api/alerts/destinations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'slack',
      name: 'Ops channel',
      config: {
        channelId: 'C0ALERTS',
        channelName: 'alerts',
        mention: 'here',
        userGroupIds: ['S0ONCALL'],
      },
    }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { destination: { id: string } }).destination
}

describe('Slack integration', () => {
  let slack: FakeSlack

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'durabull-slack-routes-'))
    process.env.DURABULL_PGLITE_DIR = tempDir
    delete process.env.DATABASE_URL
    Object.assign(mutableEnv, {
      DATABASE_URL: undefined,
      DURABULL_ENV_CONNECTIONS: false,
      DURABULL_SECRET_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      DURABULL_REDIS_URL_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      APP_BASE_URL: BASE_URL,
      SLACK_CLIENT_ID: 'slack-client-id',
      SLACK_CLIENT_SECRET: 'slack-client-secret',
      SLACK_SIGNING_SECRET: SIGNING_SECRET,
      SLACK_APP_ID: 'A0DURABULL',
      SLACK_OAUTH_REDIRECT_URI: undefined,
    })
    clearSlackProfileCache()
    clearSlackChannelCache()
    clearSlackEventDedupe()
    invalidateEntitlementCache()
    await closeDb()
    slack = new FakeSlack()
  })

  afterEach(async () => {
    await flushSlackBackgroundWork()
    slack.restore()
    setBillingConfigForTests(null)
    invalidateEntitlementCache()
    await closeDb()
    Object.assign(mutableEnv, original)
    if (originalPgliteDir) process.env.DURABULL_PGLITE_DIR = originalPgliteDir
    else delete process.env.DURABULL_PGLITE_DIR
    if (tempDir) await rm(tempDir, { recursive: true, force: true })
  })

  it('reports whether Slack is configured before anything is installed', async () => {
    await seed()
    const app = await createApp()
    const response = await app.request('/api/integrations/slack')
    expect(await response.json()).toEqual({ configured: true, entitled: true, installation: null })

    mutableEnv.SLACK_SIGNING_SECRET = undefined
    const unconfigured = await app.request('/api/integrations/slack/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(unconfigured.status).toBe(503)
  })

  it('installs through OAuth and returns to the page that started it', async () => {
    await seed()
    const app = await createApp()
    const callback = await install(app)
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe(
      `${BASE_URL}/acme/settings/destinations?slack=connected`
    )

    const exchange = slack.callsTo('oauth.v2.access')[0]
    expect(exchange?.body).toMatchObject({
      code: 'code-1',
      redirect_uri: `${BASE_URL}/api/integrations/slack/callback`,
    })

    const installation = await slackInstallationRepository.findByOrganization(ORG_ID)
    expect(installation).toMatchObject({
      slackTeamId: 'T0ACME',
      slackTeamName: 'Acme',
      slackTeamUrl: 'https://acme.slack.com/',
      botUserId: 'UBOT',
      installedByUserId: 'user-ada',
      status: 'active',
    })
    expect(installation?.encryptedBotToken).not.toContain('xoxb-test-token')

    const overview = (await (await app.request('/api/integrations/slack')).json()) as {
      installation: { missingScopes: string[]; slackTeamName: string }
    }
    expect(overview.installation).toMatchObject({ slackTeamName: 'Acme', missingScopes: [] })

    // State is single use.
    const replay = await app.request(`/api/integrations/slack/callback?code=code-1&state=used`)
    expect(replay.headers.get('location')).toContain('slack=error')
  })

  it('reports a cancelled consent screen without installing', async () => {
    await seed()
    const app = await createApp()
    const response = await app.request('/api/integrations/slack/callback?error=access_denied')
    expect(response.headers.get('location')).toContain('slack=cancelled')
    expect(await slackInstallationRepository.findByOrganization(ORG_ID)).toBeNull()
  })

  it('validates Slack destinations and sends a real test message', async () => {
    await seed()
    const app = await createApp()
    await install(app)

    const privateChannel = await app.request('/api/alerts/destinations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'slack', name: 'Secret', config: { channelId: 'G0SECRET' } }),
    })
    expect(privateChannel.status).toBe(400)
    expect(((await privateChannel.json()) as { error: string }).error).toContain(
      '/invite @Durabull'
    )

    const destination = await createSlackDestination(app)
    const channels = (await (await app.request('/api/integrations/slack/channels')).json()) as {
      channels: Array<{ id: string }>
    }
    expect(channels.channels.map((channel) => channel.id)).toEqual(['C0ALERTS', 'G0SECRET'])

    const test = await app.request(`/api/alerts/destinations/${destination.id}/test`, {
      method: 'POST',
    })
    expect(await test.json()).toMatchObject({ success: true, channelName: 'alerts' })
    expect(slack.callsTo('chat.postMessage').at(-1)?.body.channel).toBe('C0ALERTS')

    const tooSoon = await app.request(`/api/alerts/destinations/${destination.id}/test`, {
      method: 'POST',
    })
    expect(tooSoon.status).toBe(429)
  })

  it('delivers incidents with actions and mirrors state changes back into Slack', async () => {
    const { rule, event } = await seed()
    const app = await createApp()
    await install(app)
    const destination = await createSlackDestination(app)

    await dispatchAlertNotification(
      event,
      [{ type: 'destination', destinationId: destination.id }],
      { id: CONNECTION_ID, name: 'Production Redis' },
      rule.name
    )

    const post = slack.callsTo('chat.postMessage').at(-1)
    expect(post?.body.channel).toBe('C0ALERTS')
    expect(String(post?.body.text)).toStartWith(
      '<!here> <!subteam^S0ONCALL> [Firing] Email failures'
    )
    expect(JSON.stringify(post?.body.attachments)).toContain(SLACK_ACTIONS.retryJob)

    const [delivery] = await alertDeliveryRepository.listByEvent(event.id)
    expect(delivery).toMatchObject({ status: 'delivered', externalIdentifier: '#alerts' })
    expect(delivery?.externalUrl).toStartWith('https://acme.slack.com/archives/C0ALERTS/')
    const [message] = await slackAlertMessageRepository.listByEvent(event.id)
    expect(message).toMatchObject({ channelId: 'C0ALERTS', renderedState: 'firing' })

    // Acknowledge from the Slack message as Ada (matched by email).
    const ack = await app.request(
      interaction({
        type: 'block_actions',
        api_app_id: 'A0DURABULL',
        team: { id: 'T0ACME' },
        user: { id: 'UADA', team_id: 'T0ACME' },
        container: { type: 'message', channel_id: 'C0ALERTS', message_ts: message?.messageTs },
        response_url: 'https://hooks.slack.com/actions/T0ACME/1/abc',
        actions: [{ action_id: SLACK_ACTIONS.acknowledge, value: event.id }],
      })
    )
    expect(ack.status).toBe(200)
    await flushSlackBackgroundWork()

    const acknowledged = await alertEventRepository.findById(event.id, ORG_ID)
    expect(acknowledged?.acknowledgedBy).toBe('user-ada')
    const update = slack.callsTo('chat.update').at(-1)
    expect(update?.body).toMatchObject({ channel: 'C0ALERTS', ts: message?.messageTs })
    expect(JSON.stringify(update?.body.attachments)).toContain('Acknowledged by *Ada Lovelace*')
    expect(slack.callsTo('chat.postMessage').at(-1)?.body).toMatchObject({
      thread_ts: message?.messageTs,
      text: ':eyes: Acknowledged by *Ada Lovelace*.',
    })
    // Successful actions on shared messages need no ephemeral confirmation.
    expect(slack.responseUrlPosts).toEqual([])

    // Resolving in Durabull (web, MCP or auto-resolve) converges through the sweep.
    await alertEventRepository.resolve(event.id, ORG_ID, 'manual', 'user-ada')
    expect(await syncSlackAlertMessages()).toEqual({ synced: 1, failed: 0 })
    expect(JSON.stringify(slack.callsTo('chat.update').at(-1)?.body.attachments)).toContain(
      'Resolved by *Ada Lovelace*'
    )
    expect(String(slack.callsTo('chat.postMessage').at(-1)?.body.text)).toStartWith(
      ':white_check_mark: Resolved by *Ada Lovelace*.'
    )
    expect(await syncSlackAlertMessages()).toEqual({ synced: 0, failed: 0 })
  })

  it('snoozes the rule from Slack and refuses people who are not members', async () => {
    const { rule, event } = await seed()
    const app = await createApp()
    await install(app)
    const destination = await createSlackDestination(app)
    await dispatchAlertNotification(
      event,
      [{ type: 'destination', destinationId: destination.id }],
      { id: CONNECTION_ID, name: 'Production Redis' },
      rule.name
    )

    await app.request(
      interaction({
        type: 'block_actions',
        team: { id: 'T0ACME' },
        user: { id: 'UEVE', team_id: 'T0ACME' },
        container: { type: 'message' },
        response_url: 'https://hooks.slack.com/actions/T0ACME/2/def',
        actions: [{ action_id: SLACK_ACTIONS.resolve, value: event.id }],
      })
    )
    await flushSlackBackgroundWork()
    expect((await alertEventRepository.findById(event.id, ORG_ID))?.status).toBe('firing')
    expect(String(slack.responseUrlPosts.at(-1)?.text)).toContain('does not belong to a member')

    await app.request(
      interaction({
        type: 'block_actions',
        team: { id: 'T0ACME' },
        user: { id: 'UADA', team_id: 'T0ACME' },
        container: { type: 'message' },
        actions: [
          { action_id: SLACK_ACTIONS.snooze, selected_option: { value: `${event.id}|240` } },
        ],
      })
    )
    await flushSlackBackgroundWork()
    const snoozed = await alertRuleRepository.findById(rule.id, ORG_ID)
    expect(snoozed?.mutedUntil?.getTime()).toBeGreaterThan(Date.now() + 3 * 3_600_000)
    expect(String(slack.callsTo('chat.postMessage').at(-1)?.body.text)).toContain(
      'snoozed *Email failures* for 4 hours'
    )
  })

  it('turns off Slack actions when the organization disables them', async () => {
    const { event } = await seed()
    const app = await createApp()
    await install(app)
    const patch = await app.request('/api/integrations/slack', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionsEnabled: false }),
    })
    expect(
      ((await patch.json()) as { installation: { actionsEnabled: boolean } }).installation
        .actionsEnabled
    ).toBe(false)

    await app.request(
      interaction({
        type: 'block_actions',
        team: { id: 'T0ACME' },
        user: { id: 'UADA' },
        container: { type: 'message' },
        response_url: 'https://hooks.slack.com/actions/T0ACME/3/ghi',
        actions: [{ action_id: SLACK_ACTIONS.acknowledge, value: event.id }],
      })
    )
    await flushSlackBackgroundWork()
    expect((await alertEventRepository.findById(event.id, ORG_ID))?.acknowledgedAt).toBeNull()
    expect(String(slack.responseUrlPosts.at(-1)?.text)).toContain('turned off')
  })

  it('answers slash commands through the response URL', async () => {
    const { event } = await seed()
    const app = await createApp()
    await install(app)

    const form = (text: string) =>
      new URLSearchParams({
        command: '/durabull',
        text,
        team_id: 'T0ACME',
        user_id: 'UADA',
        api_app_id: 'A0DURABULL',
        response_url: 'https://hooks.slack.com/commands/T0ACME/1/xyz',
      }).toString()

    const help = await app.request(
      signed('/api/slack/commands', form('help'), 'application/x-www-form-urlencoded')
    )
    expect(JSON.stringify(await help.json())).toContain('/durabull queue')

    const alerts = await app.request(
      signed('/api/slack/commands', form('alerts'), 'application/x-www-form-urlencoded')
    )
    expect(((await alerts.json()) as { text: string }).text).toContain('Checking Durabull')
    await flushSlackBackgroundWork()
    const reply = slack.responseUrlPosts.at(-1)
    expect(reply).toMatchObject({ response_type: 'ephemeral', replace_original: true })
    expect(JSON.stringify(reply?.blocks)).toContain('Job 42 failed in email-send')
    expect(JSON.stringify(reply?.blocks)).toContain(`${SLACK_ACTIONS.acknowledge}|${event.id}`)

    slack.emails.UADA = 'someone@else.test'
    clearSlackProfileCache()
    await app.request(
      signed('/api/slack/commands', form('status'), 'application/x-www-form-urlencoded')
    )
    await flushSlackBackgroundWork()
    expect(JSON.stringify(slack.responseUrlPosts.at(-1))).toContain('does not belong to a member')
  })

  it('verifies Events API requests and handles uninstalls', async () => {
    await seed()
    const app = await createApp()
    await install(app)

    const challenge = JSON.stringify({ type: 'url_verification', challenge: 'abc123' })
    const verified = await app.request(signed('/api/slack/events', challenge, 'application/json'))
    expect(await verified.json()).toEqual({ challenge: 'abc123' })

    const forged = await app.request('/api/slack/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Slack-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
        'X-Slack-Signature': 'v0=deadbeef',
      },
      body: challenge,
    })
    expect(forged.status).toBe(401)

    const otherApp = JSON.stringify({
      type: 'event_callback',
      api_app_id: 'A0OTHER',
      team_id: 'T0ACME',
      event_id: 'Ev0',
      event: { type: 'app_uninstalled' },
    })
    await app.request(signed('/api/slack/events', otherApp, 'application/json'))
    await flushSlackBackgroundWork()
    expect((await slackInstallationRepository.findByOrganization(ORG_ID))?.status).toBe('active')

    const uninstall = JSON.stringify({
      type: 'event_callback',
      api_app_id: 'A0DURABULL',
      team_id: 'T0ACME',
      event_id: 'Ev1',
      event: { type: 'app_uninstalled' },
    })
    await app.request(signed('/api/slack/events', uninstall, 'application/json'))
    await flushSlackBackgroundWork()
    expect(await slackInstallationRepository.findByOrganization(ORG_ID)).toMatchObject({
      status: 'revoked',
      statusReason: 'app_uninstalled',
    })
  })

  it('publishes the App Home tab for members', async () => {
    await seed()
    const app = await createApp()
    await install(app)
    const opened = JSON.stringify({
      type: 'event_callback',
      api_app_id: 'A0DURABULL',
      team_id: 'T0ACME',
      event_id: 'Ev2',
      event: { type: 'app_home_opened', user: 'UADA', tab: 'home' },
    })
    await app.request(signed('/api/slack/events', opened, 'application/json'))
    // Slack retries unacknowledged events; the duplicate is ignored.
    await app.request(signed('/api/slack/events', opened, 'application/json'))
    await flushSlackBackgroundWork()
    const publishes = slack.callsTo('views.publish')
    expect(publishes).toHaveLength(1)
    expect(publishes[0]?.body.user_id).toBe('UADA')
    const view = JSON.stringify(publishes[0]?.body.view)
    expect(view).toContain('Production Redis')
    expect(view).toContain('open incident (1 unacknowledged)')
  })

  it('unfurls Durabull links only for members of the linked organization', async () => {
    const { rule } = await seed()
    const app = await createApp()
    await install(app)
    const ruleUrl = `${BASE_URL}/acme/c/${CONNECTION_ID}/alerts/rules/${rule.id}`
    const shared = (user: string, eventId: string) =>
      JSON.stringify({
        type: 'event_callback',
        api_app_id: 'A0DURABULL',
        team_id: 'T0ACME',
        event_id: eventId,
        event: {
          type: 'link_shared',
          user,
          channel: 'C0ALERTS',
          message_ts: '1700000000.000001',
          links: [
            { url: ruleUrl, domain: 'app.durabull.test' },
            { url: 'https://example.com/x', domain: 'example.com' },
          ],
        },
      })
    await app.request(signed('/api/slack/events', shared('UEVE', 'Ev3'), 'application/json'))
    await flushSlackBackgroundWork()
    expect(slack.callsTo('chat.unfurl')).toHaveLength(0)

    await app.request(signed('/api/slack/events', shared('UADA', 'Ev4'), 'application/json'))
    await flushSlackBackgroundWork()
    const unfurl = slack.callsTo('chat.unfurl')[0]
    expect(Object.keys(unfurl?.body.unfurls as object)).toEqual([ruleUrl])
    expect(JSON.stringify(unfurl?.body.unfurls)).toContain('1 open incident')
  })

  it('keeps Slack behind the Team plan and nudges Free organizations to upgrade', async () => {
    await seed()
    setBillingConfigForTests({
      enabled: true,
      enforcement: 'on',
      launchAt: null,
      migrationGrantUntil: null,
    })
    invalidateEntitlementCache()
    const app = await createApp()

    const overview = (await (await app.request('/api/integrations/slack')).json()) as {
      entitled: boolean
    }
    expect(overview.entitled).toBe(false)

    const connect = await app.request('/api/integrations/slack/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(connect.status).toBe(403)
    expect(await connect.json()).toMatchObject({
      code: 'feature_not_entitled',
      feature: 'integrations.slack',
      requiredPlan: 'team',
    })
  })

  it('removes the installation and revokes the token when no other organization shares it', async () => {
    await seed()
    const app = await createApp()
    await install(app)
    const removed = await app.request('/api/integrations/slack', { method: 'DELETE' })
    expect(await removed.json()).toEqual({ success: true, revokedToken: true })
    expect(slack.callsTo('auth.revoke')).toHaveLength(1)
    expect(await slackInstallationRepository.findByOrganization(ORG_ID)).toBeNull()
    expect(await alertDestinationRepository.listByOrganization(ORG_ID, { type: 'slack' })).toEqual(
      []
    )
  })
})
