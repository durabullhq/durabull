import type { RedisConnection } from '@durabull/dal'
import type { Job } from 'bullmq'
import { SLACK_ACTIONS } from './alert-message'
import { appBaseUrl, SLACK_SLASH_COMMAND } from './config'
import {
  confirmText,
  mrkdwn,
  plainText,
  ruleTypeLabel,
  slackCode,
  slackCodeBlock,
  slackDate,
  slackInline,
  slackLink,
  truncate,
} from './format'
import type { QueueOverview } from './operations'

export interface IncidentListItem {
  id: string
  type: string
  queueName: string
  summary: string
  firedAt: Date
  connectionId: string
  connectionName: string
  ruleName: string
  acknowledgedByName: string | null
  url: string
}

export interface OrganizationStatus {
  organizationName: string
  organizationSlug: string
  connections: Array<{
    id: string
    name: string
    environment: string | null
    firing: number
    acknowledged: number
  }>
  disabledConnections: number
  /** Open incidents on connections that are disabled or paused (not listed above). */
  hiddenOpen: { firing: number; acknowledged: number }
}

function orgUrl(slug: string, path = ''): string {
  return `${appBaseUrl()}/${encodeURIComponent(slug)}${path}`
}

export function connectionUrl(slug: string, connectionId: string, path = ''): string {
  return orgUrl(slug, `/c/${encodeURIComponent(connectionId)}${path}`)
}

export function queueUrl(slug: string, connectionId: string, queueName: string): string {
  return connectionUrl(slug, connectionId, `/queues/${encodeURIComponent(queueName)}`)
}

export function jobUrl(
  slug: string,
  connectionId: string,
  queueName: string,
  jobId: string
): string {
  return `${queueUrl(slug, connectionId, queueName)}/jobs/${encodeURIComponent(jobId)}`
}

/** Command list; `prefix` is how the user talks to Durabull (`/durabull`, `@Durabull`, or nothing in a DM). */
export function helpBlocks(prefix: string = SLACK_SLASH_COMMAND): unknown[] {
  const c = prefix ? `${prefix} ` : ''
  return [
    { type: 'section', text: mrkdwn('*Durabull in Slack*') },
    {
      type: 'section',
      text: mrkdwn(
        [
          `\`${c}status\`: open incidents per Redis connection`,
          `\`${c}alerts\`: firing incidents, with acknowledge and resolve buttons`,
          `\`${c}queue <name> [connection]\`: job counts for a queue, with pause and resume`,
          `\`${c}job <id> [queue]\`: find a job and see why it failed`,
          `\`${c}help\`: this message`,
        ].join('\n')
      ),
    },
    {
      type: 'context',
      elements: [
        mrkdwn(
          `Use \`${SLACK_SLASH_COMMAND}\` for a private answer, mention @Durabull to answer in the channel, or message the app directly. Durabull matches your Slack email to your Durabull account. Paste a Durabull queue, job or alert rule link to preview it.`
        ),
      ],
    },
  ]
}

function environmentLabel(environment: string | null | undefined): string {
  return environment ? ` · ${slackInline(environment, 30)}` : ''
}

export function statusBlocks(orgs: OrganizationStatus[]): unknown[] {
  const blocks: unknown[] = []
  for (const org of orgs) {
    // Incidents on hidden connections still count: the all-clear must be true.
    const firing = org.connections.reduce((sum, c) => sum + c.firing, org.hiddenOpen.firing)
    const open = org.connections.reduce(
      (sum, c) => sum + c.firing + c.acknowledged,
      org.hiddenOpen.firing + org.hiddenOpen.acknowledged
    )
    blocks.push({
      type: 'section',
      text: mrkdwn(
        `*${slackLink(orgUrl(org.organizationSlug), org.organizationName)}*\n${
          open === 0
            ? ':large_green_circle: No open incidents'
            : `${firing > 0 ? ':red_circle:' : ':large_yellow_circle:'} *${open}* open incident${open === 1 ? '' : 's'} (${firing} unacknowledged)`
        }`
      ),
    })
    if (org.connections.length === 0) {
      blocks.push({
        type: 'context',
        elements: [mrkdwn('No enabled Redis connections.')],
      })
    } else {
      const lines = org.connections.map((connection) => {
        const total = connection.firing + connection.acknowledged
        const icon =
          connection.firing > 0
            ? ':red_circle:'
            : connection.acknowledged > 0
              ? ':large_yellow_circle:'
              : ':large_green_circle:'
        const status =
          total === 0
            ? 'healthy'
            : `${connection.firing} firing${connection.acknowledged ? `, ${connection.acknowledged} acknowledged` : ''}`
        return `${icon} ${slackLink(connectionUrl(org.organizationSlug, connection.id, '/alerts'), connection.name)}${environmentLabel(connection.environment)}: ${status}`
      })
      blocks.push({ type: 'section', text: mrkdwn(lines.slice(0, 25).join('\n')) })
    }
    if (org.disabledConnections > 0) {
      blocks.push({
        type: 'context',
        elements: [
          mrkdwn(
            `${org.disabledConnections} disabled or paused connection(s) not shown${
              org.hiddenOpen.firing + org.hiddenOpen.acknowledged > 0
                ? `, with ${org.hiddenOpen.firing + org.hiddenOpen.acknowledged} open incident(s) counted above`
                : ''
            }.`
          ),
        ],
      })
    }
    blocks.push({ type: 'divider' })
  }
  if (blocks.length > 0) blocks.pop()
  return blocks
}

export function incidentListBlocks(
  orgName: string,
  incidents: IncidentListItem[],
  options: { actionsEnabled: boolean; totalOpen: number; alertsUrl: string }
): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'section',
      text: mrkdwn(
        incidents.length === 0
          ? `:large_green_circle: *${slackInline(orgName, 80)}* has no open incidents.`
          : `*${slackInline(orgName, 80)}*: ${options.totalOpen} open incident${options.totalOpen === 1 ? '' : 's'}${
              options.totalOpen > incidents.length ? `, newest ${incidents.length} shown` : ''
            }`
      ),
    },
  ]
  for (const incident of incidents) {
    const acknowledged = incident.acknowledgedByName
      ? ` · :eyes: ${slackInline(incident.acknowledgedByName, 40)}`
      : ''
    blocks.push({
      type: 'section',
      text: mrkdwn(
        `${incident.acknowledgedByName ? ':large_yellow_circle:' : ':red_circle:'} *${slackLink(incident.url, incident.ruleName)}* · ${slackCode(incident.queueName, 60)}\n${slackInline(incident.summary, 200)}\n_${slackInline(incident.connectionName, 40)} · ${ruleTypeLabel(incident.type)} · ${slackDate(incident.firedAt, '{date_short_pretty} {time}')}${acknowledged}_`
      ),
      ...(options.actionsEnabled
        ? {
            accessory: {
              type: 'overflow',
              action_id: SLACK_ACTIONS.incidentMenu,
              options: [
                ...(incident.acknowledgedByName
                  ? []
                  : [
                      {
                        text: plainText('Acknowledge'),
                        value: `${SLACK_ACTIONS.acknowledge}|${incident.id}`,
                      },
                    ]),
                { text: plainText('Resolve'), value: `${SLACK_ACTIONS.resolve}|${incident.id}` },
              ],
            },
          }
        : {}),
    })
  }
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        action_id: `${SLACK_ACTIONS.openLink}.incidents`,
        text: plainText('Open incidents in Durabull'),
        url: options.alertsUrl,
      },
    ],
  })
  return blocks
}

export function queueBlocks(
  slug: string,
  overview: QueueOverview,
  actionsEnabled: boolean
): unknown[] {
  const { connection, queueName, counts } = overview
  const url = queueUrl(slug, connection.id, queueName)
  const blocks: unknown[] = [
    {
      type: 'section',
      text: mrkdwn(
        `*${slackLink(url, queueName)}*${overview.paused ? '  :double_vertical_bar: *Paused*' : ''}\n${slackInline(connection.name, 80)}${environmentLabel(connection.environment)}`
      ),
    },
    {
      type: 'section',
      fields: [
        mrkdwn(`*Waiting*\n${counts.waiting + counts.prioritized}`),
        mrkdwn(`*Active*\n${counts.active}`),
        mrkdwn(`*Delayed*\n${counts.delayed}`),
        mrkdwn(`*Failed*\n${counts.failed > 0 ? `:red_circle: ${counts.failed}` : '0'}`),
        mrkdwn(`*Completed*\n${counts.completed}`),
      ],
    },
  ]
  const elements: unknown[] = []
  if (actionsEnabled) {
    const value = `${connection.id}|${queueName}`
    elements.push(
      overview.paused
        ? {
            type: 'button',
            action_id: SLACK_ACTIONS.resumeQueue,
            text: plainText('Resume queue'),
            style: 'primary',
            value,
          }
        : {
            type: 'button',
            action_id: SLACK_ACTIONS.pauseQueue,
            text: plainText('Pause queue'),
            value,
            confirm: {
              title: plainText('Pause this queue?'),
              text: confirmText(
                `Workers stop picking up new jobs from ${truncate(queueName, 150)} until it is resumed. Active jobs finish.`
              ),
              confirm: plainText('Pause'),
              deny: plainText('Cancel'),
            },
          }
    )
  }
  elements.push({
    type: 'button',
    action_id: `${SLACK_ACTIONS.openLink}.queue`,
    text: plainText('Open queue'),
    url,
  })
  blocks.push({ type: 'actions', elements })
  blocks.push({
    type: 'context',
    elements: [mrkdwn(`Checked ${slackDate(new Date(), '{time_secs}')}`)],
  })
  return blocks
}

export function jobBlocks(
  slug: string,
  input: { connection: RedisConnection; queueName: string; job: Job; state: string }
): unknown[] {
  const { connection, queueName, job, state } = input
  const id = job.id ?? '?'
  const url = jobUrl(slug, connection.id, queueName, id)
  const stateIcon =
    state === 'failed'
      ? ':red_circle:'
      : state === 'completed'
        ? ':large_green_circle:'
        : state === 'active'
          ? ':large_blue_circle:'
          : ':white_circle:'
  const fields = [
    mrkdwn(`*State*\n${stateIcon} ${state}`),
    mrkdwn(`*Queue*\n${slackCode(queueName, 100)}`),
    mrkdwn(
      `*Attempts*\n${job.attemptsMade}${job.opts?.attempts ? ` of ${job.opts.attempts}` : ''}`
    ),
    mrkdwn(`*Created*\n${job.timestamp ? slackDate(new Date(job.timestamp)) : '—'}`),
  ]
  if (job.finishedOn) fields.push(mrkdwn(`*Finished*\n${slackDate(new Date(job.finishedOn))}`))
  const blocks: unknown[] = [
    {
      type: 'section',
      text: mrkdwn(
        `*${slackLink(url, `Job ${id}`)}*${job.name ? ` ${slackCode(job.name, 100)}` : ''}\n${slackInline(connection.name, 80)}${environmentLabel(connection.environment)}`
      ),
    },
    { type: 'section', fields },
  ]
  if (state === 'failed' && job.failedReason) {
    blocks.push({ type: 'section', text: mrkdwn(slackCodeBlock(job.failedReason, 1200)) })
  }
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        action_id: `${SLACK_ACTIONS.openLink}.job`,
        text: plainText('Open job'),
        url,
      },
    ],
  })
  return blocks
}

export function errorBlocks(message: string): unknown[] {
  return [{ type: 'section', text: mrkdwn(`:warning: ${slackInline(message, 2000)}`) }]
}

export function homeView(input: {
  orgs: Array<{
    status: OrganizationStatus
    incidents: IncidentListItem[]
    totalOpen: number
    actionsEnabled: boolean
  }>
  denied: Array<{ organizationName: string; message: string }>
  noInstallations: boolean
}): unknown {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: plainText('Durabull', 150),
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: SLACK_ACTIONS.refreshHome,
          text: plainText(':arrows_counterclockwise: Refresh'),
          value: 'refresh',
        },
        {
          type: 'button',
          action_id: `${SLACK_ACTIONS.openLink}.app`,
          text: plainText('Open Durabull'),
          url: appBaseUrl(),
        },
      ],
    },
  ]

  if (input.noInstallations) {
    blocks.push({
      type: 'section',
      text: mrkdwn('Durabull is not connected to an organization in this workspace yet.'),
    })
  }

  for (const org of input.orgs) {
    blocks.push({ type: 'divider' })
    blocks.push(...statusBlocks([org.status]))
    if (org.incidents.length > 0) {
      blocks.push(
        ...incidentListBlocks(org.status.organizationName, org.incidents, {
          actionsEnabled: org.actionsEnabled,
          totalOpen: org.totalOpen,
          alertsUrl: orgUrl(org.status.organizationSlug, '/alerts'),
        }).slice(1)
      )
    }
  }

  for (const denied of input.denied) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'section',
      text: mrkdwn(
        `*${slackInline(denied.organizationName, 80)}*\n${slackInline(denied.message, 500)}`
      ),
    })
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'context',
    elements: [
      mrkdwn(
        `Type \`${SLACK_SLASH_COMMAND} help\` in any channel for commands. Updated ${slackDate(new Date(), '{date_short_pretty} {time}')}.`
      ),
    ],
  })
  // Slack caps a Home tab at 100 blocks.
  return { type: 'home', blocks: blocks.slice(0, 100) }
}
