import type { SlackAlertMessageState, SlackMentionMode } from '@durabull/dal'
import {
  escapeSlackText,
  formatDuration,
  mrkdwn,
  plainText,
  ruleTypeLabel,
  slackCode,
  slackCodeBlock,
  slackDate,
  slackInline,
  slackLink,
} from './format'

/** Block Kit action ids handled by the interactions endpoint. */
export const SLACK_ACTIONS = {
  acknowledge: 'durabull.incident.acknowledge',
  unacknowledge: 'durabull.incident.unacknowledge',
  resolve: 'durabull.incident.resolve',
  snooze: 'durabull.rule.snooze',
  retryJob: 'durabull.job.retry',
  pauseQueue: 'durabull.queue.pause',
  resumeQueue: 'durabull.queue.resume',
  incidentMenu: 'durabull.incident.menu',
  refreshHome: 'durabull.home.refresh',
  openLink: 'durabull.open',
} as const

export const SNOOZE_OPTIONS = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
  { minutes: 1440, label: '24 hours' },
  { minutes: 10_080, label: '7 days' },
] as const

const STATE_COLORS: Record<SlackAlertMessageState, string> = {
  firing: '#E5484D',
  acknowledged: '#F5A524',
  resolved: '#2EB67D',
}

const STATE_LABELS: Record<SlackAlertMessageState, string> = {
  firing: ':rotating_light: *Firing*',
  acknowledged: ':eyes: *Acknowledged*',
  resolved: ':white_check_mark: *Resolved*',
}

export interface SlackAlertJobDetails {
  id: string
  name: string | null
  attemptsMade: number | null
  attempts: number | null
  failedReason: string | null
}

export interface SlackAlertMessageView {
  eventId: string
  state: SlackAlertMessageState
  ruleName: string
  ruleType: string
  connectionName: string
  connectionEnvironment?: string | null
  queueName: string
  summary: string
  firedAt: Date
  acknowledgedByName?: string | null
  resolvedAt?: Date | null
  resolvedByName?: string | null
  resolutionReason?: string | null
  job?: SlackAlertJobDetails | null
  urls: { incident: string; rule: string; job?: string | null }
  /** Workspace members may act on the incident from Slack. */
  actionsEnabled: boolean
  /** Rule is snoozed until this time; shown so nobody snoozes twice. */
  ruleMutedUntil?: Date | null
}

export interface SlackMessageContent {
  text: string
  attachments: Array<{ color: string; fallback: string; blocks: unknown[] }>
}

export function mentionPrefix(mention: SlackMentionMode | undefined, userGroupIds: string[] = []) {
  const parts: string[] = []
  if (mention === 'here') parts.push('<!here>')
  if (mention === 'channel') parts.push('<!channel>')
  for (const id of userGroupIds) {
    if (/^S[A-Z0-9]+$/.test(id)) parts.push(`<!subteam^${id}>`)
  }
  return parts.join(' ')
}

function headline(view: SlackAlertMessageView): string {
  return `${slackInline(view.ruleName, 150)}: ${slackInline(view.summary, 300)}`
}

/** Notification text (also the fallback for clients that cannot render blocks). */
export function buildAlertNotificationText(view: SlackAlertMessageView, mention = ''): string {
  const status =
    view.state === 'resolved'
      ? 'Resolved'
      : view.state === 'acknowledged'
        ? 'Acknowledged'
        : 'Firing'
  return `${mention ? `${mention} ` : ''}[${status}] ${headline(view)}`
}

export function buildAlertMessage(
  view: SlackAlertMessageView,
  options: { mention?: string } = {}
): SlackMessageContent {
  const blocks: unknown[] = []
  const environment = view.connectionEnvironment
    ? ` (${slackInline(view.connectionEnvironment, 40)})`
    : ''

  blocks.push({
    type: 'context',
    elements: [
      mrkdwn(
        `${STATE_LABELS[view.state]}  ·  ${ruleTypeLabel(view.ruleType)}  ·  ${slackInline(view.connectionName, 80)}${environment}`
      ),
    ],
  })
  blocks.push({
    type: 'section',
    text: mrkdwn(
      `*${slackLink(view.urls.incident, view.ruleName)}*\n${slackInline(view.summary, 2000)}`
    ),
  })

  const scopeLabel = view.ruleType === 'redis_health' ? 'Scope' : 'Queue'
  const fields = [
    mrkdwn(`*${scopeLabel}*\n${slackCode(view.queueName, 150)}`),
    mrkdwn(`*Fired*\n${slackDate(view.firedAt)}`),
  ]
  if (view.job) {
    fields.push(
      mrkdwn(
        `*Job*\n${view.urls.job ? slackLink(view.urls.job, view.job.id) : slackCode(view.job.id)}${
          view.job.name ? ` ${slackCode(view.job.name, 100)}` : ''
        }`
      )
    )
    if (view.job.attemptsMade !== null) {
      fields.push(
        mrkdwn(
          `*Attempts*\n${view.job.attemptsMade}${view.job.attempts !== null ? ` of ${view.job.attempts}` : ''}`
        )
      )
    }
  }
  blocks.push({ type: 'section', fields })

  if (view.job?.failedReason && view.state !== 'resolved') {
    blocks.push({ type: 'section', text: mrkdwn(slackCodeBlock(view.job.failedReason, 1500)) })
  }

  const statusLine = buildStatusLine(view)
  if (statusLine) blocks.push({ type: 'context', elements: [mrkdwn(statusLine)] })

  blocks.push({
    type: 'actions',
    block_id: `incident:${view.eventId}`,
    elements: buildActions(view),
  })

  if (!view.actionsEnabled && view.state !== 'resolved') {
    blocks.push({
      type: 'context',
      elements: [
        mrkdwn('Actions from Slack are turned off for this workspace. Use Durabull to respond.'),
      ],
    })
  }

  const text = buildAlertNotificationText(view, options.mention)
  return {
    text,
    attachments: [{ color: STATE_COLORS[view.state], fallback: text, blocks }],
  }
}

function buildStatusLine(view: SlackAlertMessageView): string | null {
  if (view.state === 'resolved') {
    const resolvedAt = view.resolvedAt ?? null
    const duration = resolvedAt
      ? ` after ${formatDuration(resolvedAt.getTime() - view.firedAt.getTime())}`
      : ''
    return `${resolutionDescription(view)}${duration}${resolvedAt ? ` · ${slackDate(resolvedAt)}` : ''}`
  }
  const parts: string[] = []
  if (view.state === 'acknowledged') {
    parts.push(
      view.acknowledgedByName
        ? `Acknowledged by *${slackInline(view.acknowledgedByName, 80)}*`
        : 'Acknowledged'
    )
  }
  if (view.ruleMutedUntil && view.ruleMutedUntil.getTime() > Date.now()) {
    parts.push(
      `:zzz: Rule snoozed until ${slackDate(view.ruleMutedUntil, '{date_short_pretty} {time}')}`
    )
  }
  return parts.length > 0 ? parts.join('  ·  ') : null
}

function resolutionDescription(
  view: Pick<SlackAlertMessageView, 'resolvedByName' | 'resolutionReason'>
) {
  switch (view.resolutionReason) {
    case 'auto_job_completed':
      return 'Resolved automatically: the job completed'
    case 'auto_condition_cleared':
      return 'Resolved automatically: the condition cleared'
    case 'rule_changed':
      return 'Resolved because the alert rule changed'
    default:
      return view.resolvedByName
        ? `Resolved by *${slackInline(view.resolvedByName, 80)}*`
        : 'Resolved'
  }
}

function buildActions(view: SlackAlertMessageView): unknown[] {
  const open = {
    type: 'button',
    action_id: `${SLACK_ACTIONS.openLink}.incident`,
    text: plainText('Open in Durabull'),
    url: view.urls.incident,
  }
  if (view.state === 'resolved' || !view.actionsEnabled) return [open]

  const elements: unknown[] = []
  if (view.state === 'firing') {
    elements.push({
      type: 'button',
      action_id: SLACK_ACTIONS.acknowledge,
      text: plainText('Acknowledge'),
      style: 'primary',
      value: view.eventId,
    })
  } else {
    elements.push({
      type: 'button',
      action_id: SLACK_ACTIONS.unacknowledge,
      text: plainText('Unacknowledge'),
      value: view.eventId,
    })
  }
  elements.push({
    type: 'button',
    action_id: SLACK_ACTIONS.resolve,
    text: plainText('Resolve'),
    value: view.eventId,
    confirm: {
      title: plainText('Resolve incident?'),
      text: mrkdwn(
        `Resolve *${slackInline(view.ruleName, 100)}* on ${slackCode(view.queueName, 100)}? It fires again if the condition returns.`
      ),
      confirm: plainText('Resolve'),
      deny: plainText('Cancel'),
    },
  })
  if (view.ruleType === 'job_failed' && view.job?.id) {
    elements.push({
      type: 'button',
      action_id: SLACK_ACTIONS.retryJob,
      text: plainText('Retry job'),
      value: view.eventId,
      confirm: {
        title: plainText('Retry this job?'),
        text: mrkdwn(
          `Move job ${slackCode(view.job.id, 100)} in ${slackCode(view.queueName, 100)} back to waiting so a worker runs it again.`
        ),
        confirm: plainText('Retry'),
        deny: plainText('Cancel'),
      },
    })
  }
  elements.push({
    type: 'static_select',
    action_id: SLACK_ACTIONS.snooze,
    placeholder: plainText('Snooze rule'),
    options: SNOOZE_OPTIONS.map((option) => ({
      text: plainText(option.label),
      value: `${view.eventId}|${option.minutes}`,
    })),
  })
  elements.push(open)
  return elements
}

/** Thread reply posted when an incident changes state. */
export function buildStateChangeReply(
  previous: SlackAlertMessageState,
  view: SlackAlertMessageView
): string | null {
  if (view.state === 'acknowledged') {
    return `:eyes: Acknowledged${view.acknowledgedByName ? ` by *${escapeSlackText(view.acknowledgedByName)}*` : ''}.`
  }
  if (view.state === 'firing' && previous === 'acknowledged') {
    return ':leftwards_arrow_with_hook: Acknowledgement cleared. The incident is open again.'
  }
  if (view.state === 'resolved') {
    const duration = view.resolvedAt
      ? ` Open for ${formatDuration(view.resolvedAt.getTime() - view.firedAt.getTime())}.`
      : ''
    return `:white_check_mark: ${resolutionDescription(view)}.${duration}`
  }
  return null
}

export function buildTestMessage(input: {
  channelName: string | null
  destinationName: string
  organizationName: string
  settingsUrl: string
}): SlackMessageContent {
  const text = `Durabull test message for destination "${input.destinationName}"`
  return {
    text,
    attachments: [
      {
        color: STATE_COLORS.resolved,
        fallback: text,
        blocks: [
          {
            type: 'section',
            text: mrkdwn(
              `:white_check_mark: *Durabull can post here.*\nAlert rules that route to *${slackInline(input.destinationName, 100)}* in ${slackInline(input.organizationName, 100)} will deliver incidents to ${input.channelName ? `#${slackInline(input.channelName, 80)}` : 'this channel'}, with buttons to acknowledge, resolve, snooze and retry.`
            ),
          },
          {
            type: 'context',
            elements: [
              mrkdwn(
                `Sent from ${slackLink(input.settingsUrl, 'Durabull alert destinations')}. Try \`/durabull status\` anytime.`
              ),
            ],
          },
        ],
      },
    ],
  }
}
