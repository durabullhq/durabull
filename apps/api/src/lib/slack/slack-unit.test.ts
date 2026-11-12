import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import {
  buildAlertMessage,
  buildStateChangeReply,
  mentionPrefix,
  SLACK_ACTIONS,
} from './alert-message'
import {
  callSlack,
  isSlackResponseUrl,
  listSlackUserGroups,
  postToSlackResponseUrl,
  SlackApiError,
} from './client'
import { buildSlackAuthorizeUrl, SLACK_BOT_EVENTS, SLACK_BOT_SCOPES } from './config'
import { escapeSlackText, formatDuration, slackCodeBlock } from './format'
import { parseCommandText, parseDurabullLink } from './handlers'
import { buildSlackAppManifest } from './manifest'
import { signSlackRequest, verifySlackSignature } from './verify'

const view = {
  eventId: '11111111-1111-4111-8111-111111111111',
  state: 'firing' as const,
  ruleName: 'Email <failures> & retries',
  ruleType: 'job_failed',
  connectionName: 'Production Redis',
  connectionEnvironment: 'production',
  queueName: 'email-send',
  summary: 'Job 42 failed in email-send',
  firedAt: new Date('2026-11-12T10:00:00Z'),
  job: {
    id: '42',
    name: 'send-welcome',
    attemptsMade: 3,
    attempts: 3,
    failedReason: 'Error: SMTP timeout\n    at send (mailer.ts:10)```',
  },
  urls: {
    incident: 'https://app.durabull.test/acme/c/conn/alerts/rules/rule',
    rule: 'https://app.durabull.test/acme/c/conn/alerts/rules/rule',
    job: 'https://app.durabull.test/acme/c/conn/queues/email-send/jobs/42',
  },
  actionsEnabled: true,
}

function actionIds(content: ReturnType<typeof buildAlertMessage>): string[] {
  const blocks = content.attachments[0]?.blocks as Array<{
    type: string
    elements?: Array<{ action_id?: string }>
  }>
  return blocks
    .filter((block) => block.type === 'actions')
    .flatMap((block) => block.elements ?? [])
    .map((element) => element.action_id ?? '')
}

describe('Slack request signatures', () => {
  const signingSecret = 'test-signing-secret'
  const rawBody = 'token=x&team_id=T1&text=status'
  const timestamp = 1_800_000_000

  it('accepts a request signed with the app secret', () => {
    const signature = signSlackRequest({ signingSecret, timestamp, rawBody })
    expect(
      verifySlackSignature({
        signingSecret,
        timestamp: String(timestamp),
        signature,
        rawBody,
        nowSeconds: timestamp + 10,
      })
    ).toEqual({ ok: true })
  })

  it('rejects tampered bodies, wrong secrets, stale timestamps and missing headers', () => {
    const signature = signSlackRequest({ signingSecret, timestamp, rawBody })
    const base = {
      signingSecret,
      timestamp: String(timestamp),
      signature,
      rawBody,
      nowSeconds: timestamp,
    }
    expect(verifySlackSignature({ ...base, rawBody: `${rawBody}&x=1` })).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
    expect(verifySlackSignature({ ...base, signingSecret: 'other' })).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
    expect(verifySlackSignature({ ...base, nowSeconds: timestamp + 301 })).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    })
    expect(verifySlackSignature({ ...base, signature: undefined })).toEqual({
      ok: false,
      reason: 'missing_headers',
    })
  })
})

describe('Slack alert messages', () => {
  it('renders a firing job incident with every action', () => {
    const content = buildAlertMessage(view, { mention: mentionPrefix('here', ['S0ONCALL']) })
    expect(content.text).toStartWith('<!here> <!subteam^S0ONCALL> [Firing]')
    expect(content.text).toContain('Email &lt;failures&gt; &amp; retries')
    expect(content.attachments[0]?.color).toBe('#E5484D')
    expect(actionIds(content)).toEqual([
      SLACK_ACTIONS.acknowledge,
      SLACK_ACTIONS.resolve,
      SLACK_ACTIONS.retryJob,
      SLACK_ACTIONS.snooze,
      `${SLACK_ACTIONS.openLink}.incident`,
    ])
    const serialized = JSON.stringify(content)
    // The stack trace cannot escape its code fence.
    expect(serialized).not.toContain('mailer.ts:10)```')
    expect(serialized).toContain('send-welcome')
  })

  it('swaps acknowledge for unacknowledge and names the responder', () => {
    const content = buildAlertMessage({ ...view, state: 'acknowledged', acknowledgedByName: 'Ada' })
    expect(content.attachments[0]?.color).toBe('#F5A524')
    expect(actionIds(content)[0]).toBe(SLACK_ACTIONS.unacknowledge)
    expect(JSON.stringify(content)).toContain('Acknowledged by *Ada*')
  })

  it('keeps only the link once resolved or when Slack actions are off', () => {
    const resolved = buildAlertMessage({
      ...view,
      state: 'resolved',
      resolvedAt: new Date('2026-11-12T10:42:00Z'),
      resolutionReason: 'auto_job_completed',
    })
    expect(actionIds(resolved)).toEqual([`${SLACK_ACTIONS.openLink}.incident`])
    expect(JSON.stringify(resolved)).toContain(
      'Resolved automatically: the job completed after 42m'
    )

    const disabled = buildAlertMessage({ ...view, actionsEnabled: false })
    expect(actionIds(disabled)).toEqual([`${SLACK_ACTIONS.openLink}.incident`])
    expect(JSON.stringify(disabled)).toContain('Actions from Slack are turned off')
  })

  it('omits the retry button for incidents that are not about one job', () => {
    const content = buildAlertMessage({ ...view, ruleType: 'failure_threshold', job: null })
    expect(actionIds(content)).not.toContain(SLACK_ACTIONS.retryJob)
  })

  it('describes state changes for thread replies', () => {
    expect(
      buildStateChangeReply('firing', { ...view, state: 'acknowledged', acknowledgedByName: 'Ada' })
    ).toBe(':eyes: Acknowledged by *Ada*.')
    expect(buildStateChangeReply('acknowledged', view)).toContain('Acknowledgement cleared')
    expect(
      buildStateChangeReply('firing', {
        ...view,
        state: 'resolved',
        resolvedByName: 'Bob',
        resolvedAt: new Date('2026-11-12T12:05:00Z'),
      })
    ).toBe(':white_check_mark: Resolved by *Bob*. Open for 2h 5m.')
  })

  it('drops malformed user group ids from mentions', () => {
    expect(mentionPrefix('none', ['S123', 'not-a-group', '<!channel>'])).toBe('<!subteam^S123>')
    expect(mentionPrefix('channel')).toBe('<!channel>')
  })
})

describe('Slack text helpers', () => {
  it('escapes control characters and neutralises code fences', () => {
    expect(escapeSlackText('<@U1> & <!channel>')).toBe('&lt;@U1&gt; &amp; &lt;!channel&gt;')
    expect(slackCodeBlock('a```b')).toBe("```a'''b```")
  })

  it('formats durations compactly', () => {
    expect(formatDuration(20_000)).toBe('under a minute')
    expect(formatDuration(5 * 60_000)).toBe('5m')
    expect(formatDuration(3 * 3_600_000)).toBe('3h')
    expect(formatDuration(50 * 3_600_000)).toBe('2d 2h')
  })
})

describe('Slash command parsing', () => {
  it('defaults to status and resolves aliases', () => {
    expect(parseCommandText('')).toEqual({ command: 'status', args: [] })
    expect(parseCommandText('  Incidents ')).toEqual({ command: 'alerts', args: [] })
    expect(parseCommandText('queue email-send  production')).toEqual({
      command: 'queue',
      args: ['email-send', 'production'],
    })
    expect(parseCommandText('jobs 42 email-send')).toEqual({
      command: 'job',
      args: ['42', 'email-send'],
    })
  })
})

describe('Durabull link parsing', () => {
  const base = 'https://app.durabull.test'

  it('recognises queue, job and alert rule links on this deployment', () => {
    expect(parseDurabullLink(`${base}/acme/c/conn-1/queues/email%20send`, base)).toEqual({
      kind: 'queue',
      orgSlug: 'acme',
      connectionId: 'conn-1',
      queueName: 'email send',
    })
    expect(parseDurabullLink(`${base}/acme/c/conn-1/queues/email/jobs/42?tab=logs`, base)).toEqual({
      kind: 'job',
      orgSlug: 'acme',
      connectionId: 'conn-1',
      queueName: 'email',
      jobId: '42',
    })
    expect(parseDurabullLink(`${base}/acme/c/conn-1/alerts/rules/rule-1`, base)).toEqual({
      kind: 'rule',
      orgSlug: 'acme',
      connectionId: 'conn-1',
      ruleId: 'rule-1',
    })
  })

  it('ignores other origins and pages', () => {
    expect(parseDurabullLink('https://evil.test/acme/c/conn-1/queues/email', base)).toBeNull()
    expect(parseDurabullLink(`${base}/acme/settings/integrations`, base)).toBeNull()
    expect(parseDurabullLink(`${base}/acme/c/conn-1/queues`, base)).toBeNull()
    expect(parseDurabullLink('not a url', base)).toBeNull()
  })

  it('supports deployments served under a path prefix', () => {
    expect(
      parseDurabullLink('https://ops.test/durabull/acme/c/c1/queues/q', 'https://ops.test/durabull')
    ).toMatchObject({ kind: 'queue', queueName: 'q' })
    expect(
      parseDurabullLink('https://ops.test/other/acme/c/c1/queues/q', 'https://ops.test/durabull')
    ).toBeNull()
  })
})

describe('Slack app manifest', () => {
  it('requests exactly the scopes the OAuth flow asks for and points at this deployment', () => {
    const manifest = buildSlackAppManifest({ baseUrl: 'https://app.durabull.test/' })
    expect(manifest.oauth_config.scopes.bot).toEqual([...SLACK_BOT_SCOPES])
    expect(manifest.oauth_config.redirect_urls).toEqual([
      'https://app.durabull.test/api/integrations/slack/callback',
    ])
    expect(manifest.settings.event_subscriptions.request_url).toBe(
      'https://app.durabull.test/api/slack/events'
    )
    expect(manifest.settings.event_subscriptions.bot_events).toEqual([...SLACK_BOT_EVENTS])
    expect(manifest.settings.interactivity.request_url).toBe(
      'https://app.durabull.test/api/slack/interactions'
    )
    expect(manifest.features.slash_commands[0]?.url).toBe(
      'https://app.durabull.test/api/slack/commands'
    )
    expect(manifest.features.unfurl_domains).toEqual(['app.durabull.test'])

    const authorize = new URL(
      buildSlackAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://x.test/cb', state: 's' })
    )
    expect(authorize.searchParams.get('scope')?.split(',')).toEqual([...SLACK_BOT_SCOPES])
  })
})

describe('Slack Web API client', () => {
  afterEach(() => {
    ;(globalThis.fetch as unknown as { mockRestore?: () => void }).mockRestore?.()
  })

  it('classifies Slack errors for the delivery outbox', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch')
    fetchSpy.mockResolvedValueOnce(Response.json({ ok: false, error: 'invalid_auth' }))
    const auth = await callSlack('auth.test', 'xoxb').catch((error) => error)
    expect(auth).toBeInstanceOf(SlackApiError)
    expect(auth.isAuthError).toBe(true)
    expect(auth.retryable).toBe(false)

    fetchSpy.mockResolvedValueOnce(
      new Response('slow down', { status: 429, headers: { 'retry-after': '7' } })
    )
    const limited = await callSlack('chat.postMessage', 'xoxb').catch((error) => error)
    expect(limited.retryable).toBe(true)
    expect(limited.rateLimitResetAt.getTime()).toBeGreaterThan(Date.now() + 5_000)

    fetchSpy.mockResolvedValueOnce(new Response('oops', { status: 502 }))
    const outage = await callSlack('chat.postMessage', 'xoxb').catch((error) => error)
    expect(outage.retryable).toBe(true)

    fetchSpy.mockResolvedValueOnce(Response.json({ ok: false, error: 'channel_not_found' }))
    const channel = await callSlack('chat.postMessage', 'xoxb').catch((error) => error)
    expect(channel.retryable).toBe(false)
    expect(channel.message).toContain('/invite @Durabull')
  })

  it('treats user groups as empty on Slack plans without them', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch')
    fetchSpy.mockResolvedValueOnce(Response.json({ ok: false, error: 'paid_teams_only' }))
    expect(await listSlackUserGroups('xoxb')).toEqual([])
  })

  it('only posts delayed replies to Slack response URLs', async () => {
    expect(isSlackResponseUrl('https://hooks.slack.com/commands/T1/1/abc')).toBe(true)
    expect(isSlackResponseUrl('http://hooks.slack.com/commands')).toBe(false)
    expect(isSlackResponseUrl('https://hooks.slack.com.evil.test/x')).toBe(false)
    await expect(postToSlackResponseUrl('https://evil.test/x', { text: 'hi' })).rejects.toThrow(
      'non-Slack'
    )
  })
})
