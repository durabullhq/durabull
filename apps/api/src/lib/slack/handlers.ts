import {
  type AlertEvent,
  alertEventRepository,
  alertRuleRepository,
  redisConnectionRepository,
  type SlackInstallationWithOrganization,
  slackInstallationRepository,
} from '@durabull/dal'
import { SLACK_ACTIONS, SNOOZE_OPTIONS } from './alert-message'
import {
  buildIncidentUrls,
  jobIdFromEventContext,
  refreshSlackAlertMessages,
  syncSlackAlertMessages,
} from './alerts'
import {
  postSlackEphemeral,
  postSlackMessage,
  postToSlackResponseUrl,
  publishSlackHomeView,
  SlackApiError,
  unfurlSlackLinks,
} from './client'
import { appBaseUrl, SLACK_SLASH_COMMAND } from './config'
import {
  escapeSlackText,
  mrkdwn,
  ruleTypeLabel,
  slackCode,
  slackDate,
  slackInline,
  slackLink,
} from './format'
import { isMemberDenial, resolveSlackActor, resolveSlackUserOrganizations } from './identity'
import {
  findJob,
  findQueueConnections,
  getQueueOverview,
  listUsableConnections,
  retryFailedJob,
  SlackOperationError,
  setQueuePaused,
} from './operations'
import { withSlackToken } from './token'
import {
  connectionUrl,
  errorBlocks,
  helpBlocks,
  homeView,
  type IncidentListItem,
  incidentListBlocks,
  jobBlocks,
  type OrganizationStatus,
  queueBlocks,
  statusBlocks,
} from './views'

const MAX_MESSAGE_BLOCKS = 50

// ---------------------------------------------------------------------------
// Shared data loaders
// ---------------------------------------------------------------------------

export async function loadOrganizationStatus(
  installation: SlackInstallationWithOrganization
): Promise<OrganizationStatus> {
  const [connections, usable, summary] = await Promise.all([
    redisConnectionRepository.findAll(installation.organizationId),
    listUsableConnections(installation.organizationId),
    alertEventRepository.summarizeOpenByOrganization(installation.organizationId),
  ])
  const byConnection = new Map(summary.map((row) => [row.connectionId, row]))
  const visible = new Set(usable.map((connection) => connection.id))
  const hiddenOpen = { firing: 0, acknowledged: 0 }
  for (const row of summary) {
    if (visible.has(row.connectionId)) continue
    hiddenOpen.firing += row.firing
    hiddenOpen.acknowledged += row.acknowledged
  }
  return {
    organizationName: installation.organizationName,
    organizationSlug: installation.organizationSlug,
    connections: usable.map((connection) => ({
      id: connection.id,
      name: connection.name,
      environment: connection.environment ?? null,
      firing: byConnection.get(connection.id)?.firing ?? 0,
      acknowledged: byConnection.get(connection.id)?.acknowledged ?? 0,
    })),
    disabledConnections: Math.max(0, connections.length - usable.length),
    hiddenOpen,
  }
}

export async function loadOpenIncidents(
  installation: SlackInstallationWithOrganization,
  limit: number
): Promise<{ incidents: IncidentListItem[]; totalOpen: number }> {
  const [events, summary, connections] = await Promise.all([
    alertEventRepository.findByOrganization(installation.organizationId, {
      offset: 0,
      limit,
      status: 'firing',
    }),
    alertEventRepository.summarizeOpenByOrganization(installation.organizationId),
    listUsableConnections(installation.organizationId),
  ])
  const connectionNames = new Map(connections.map((c) => [c.id, c.name]))
  const ruleNames = new Map<string, string>()
  for (const event of events) {
    if (ruleNames.has(event.alertRuleId)) continue
    const rule = await alertRuleRepository.findById(event.alertRuleId, installation.organizationId)
    ruleNames.set(event.alertRuleId, rule?.name ?? 'Alert rule')
  }
  return {
    totalOpen: summary.reduce((sum, row) => sum + row.open, 0),
    incidents: events.map((event) => ({
      id: event.id,
      type: event.type,
      queueName: event.queueName,
      summary: event.summary,
      firedAt: event.firedAt,
      connectionId: event.connectionId,
      connectionName: connectionNames.get(event.connectionId) ?? 'Redis connection',
      ruleName: ruleNames.get(event.alertRuleId) ?? 'Alert rule',
      acknowledgedByName: event.acknowledgedAt ? (event.acknowledgedByName ?? 'someone') : null,
      url: buildIncidentUrls({
        organizationSlug: installation.organizationSlug,
        connectionId: event.connectionId,
        queueName: event.queueName,
        ruleId: event.alertRuleId,
        eventType: event.type,
        jobId: jobIdFromEventContext(event.context),
      }).incident,
    })),
  }
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const value = key(item)
    if (seen.has(value)) return false
    seen.add(value)
    return true
  })
}

function capBlocks(blocks: unknown[]): unknown[] {
  if (blocks.length <= MAX_MESSAGE_BLOCKS) return blocks
  return [
    ...blocks.slice(0, MAX_MESSAGE_BLOCKS - 1),
    { type: 'context', elements: [mrkdwn('More results are available in Durabull.')] },
  ]
}

async function respond(
  responseUrl: string | undefined,
  payload: { text: string; blocks?: unknown[]; replaceOriginal?: boolean }
): Promise<void> {
  if (!responseUrl) return
  await postToSlackResponseUrl(responseUrl, {
    response_type: 'ephemeral',
    replace_original: payload.replaceOriginal ?? false,
    text: payload.text,
    ...(payload.blocks ? { blocks: capBlocks(payload.blocks) } : {}),
  })
}

// ---------------------------------------------------------------------------
// Slash command
// ---------------------------------------------------------------------------

export interface SlackCommandPayload {
  teamId: string
  userId: string
  text: string
  responseUrl: string
  channelId?: string
}

const COMMANDS = new Set(['status', 'alerts', 'queue', 'job', 'help'])
const COMMAND_ALIASES: Record<string, string> = {
  incidents: 'alerts',
  alert: 'alerts',
  incident: 'alerts',
  q: 'queue',
  queues: 'queue',
  jobs: 'job',
  '?': 'help',
}

function toCommand(word: string): string | null {
  const normalized = word.toLowerCase().replace(/[?!.,:]+$/, '') || word
  const command = COMMAND_ALIASES[normalized] ?? normalized
  return COMMANDS.has(command) ? command : null
}

/**
 * Reads a command from what someone typed. The first known command word wins,
 * so "@Durabull show me the alerts" works like "alerts"; arguments are the
 * words after it. Empty text means status.
 */
export function parseCommandText(text: string): { command: string; args: string[] } {
  const parts = text.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { command: 'status', args: [] }
  const index = parts.findIndex((word) => toCommand(word) !== null)
  if (index === -1) return { command: (parts[0] ?? '').toLowerCase(), args: parts.slice(1) }
  return { command: toCommand(parts[index] ?? '') ?? 'status', args: parts.slice(index + 1) }
}

export interface CommandReply {
  text: string
  blocks: unknown[]
  /** The requester is not a member of any connected organization; reply privately. */
  denied: boolean
  /**
   * The answer covers several Durabull organizations. Channel members may
   * belong to only one of them, so it is never posted to a shared channel.
   */
  multipleOrganizations?: boolean
}

function reply(text: string, blocks: unknown[], denied = false): CommandReply {
  return { text, blocks: capBlocks(blocks), denied }
}

/**
 * Runs a Durabull command for a Slack user and returns the reply. Shared by
 * the slash command, @Durabull mentions and direct messages; `prefix` is how
 * the user invoked it, so usage hints match what they typed.
 */
export async function runCommand(input: {
  teamId: string
  userId: string
  text: string
  prefix: string
}): Promise<CommandReply> {
  let organizations = 0
  const result = await runCommandForMember(input, (count) => {
    organizations = count
  })
  return organizations > 1 ? { ...result, multipleOrganizations: true } : result
}

async function runCommandForMember(
  input: { teamId: string; userId: string; text: string; prefix: string },
  reportOrganizations: (count: number) => void
): Promise<CommandReply> {
  const { prefix } = input
  const { command, args } = parseCommandText(input.text)
  if (command === 'help') return reply('Durabull commands', helpBlocks(prefix))

  const { allowed, denied, installations } = await resolveSlackUserOrganizations(
    input.teamId,
    input.userId
  )
  if (installations.length === 0) {
    const message =
      'Durabull is not connected to this Slack workspace. An organization admin can connect it under Settings → Integrations.'
    return reply(message, errorBlocks(message), true)
  }
  if (allowed.length === 0) {
    const message =
      denied[0]?.message ?? 'You are not a member of a connected Durabull organization.'
    return reply(message, errorBlocks(message), true)
  }
  reportOrganizations(allowed.length)

  try {
    switch (command) {
      case 'status': {
        const statuses = await Promise.all(
          allowed.map(({ installation }) => loadOrganizationStatus(installation))
        )
        return reply('Durabull status', [
          ...statusBlocks(statuses),
          {
            type: 'context',
            elements: [mrkdwn(`\`${prefix} alerts\` lists open incidents with actions.`)],
          },
        ])
      }
      case 'alerts': {
        const perOrg = allowed.length > 1 ? 5 : 10
        const blocks: unknown[] = []
        for (const { installation } of allowed) {
          const { incidents, totalOpen } = await loadOpenIncidents(installation, perOrg)
          blocks.push(
            ...incidentListBlocks(installation.organizationName, incidents, {
              actionsEnabled: installation.actionsEnabled,
              totalOpen,
              alertsUrl: `${appBaseUrl()}/${encodeURIComponent(installation.organizationSlug)}/alerts`,
            })
          )
        }
        return reply('Open incidents', blocks)
      }
      case 'queue': {
        const [queueName, ...rest] = args
        if (!queueName) {
          return reply(
            'Name a queue',
            errorBlocks(`Usage: \`${prefix} queue <name> [connection]\``)
          )
        }
        const blocks: unknown[] = []
        for (const { installation } of allowed) {
          const connections = await findQueueConnections(
            installation.organizationId,
            queueName,
            rest.join(' ') || undefined
          )
          for (const connection of connections.slice(0, 3)) {
            try {
              const overview = await getQueueOverview(connection, queueName)
              blocks.push(
                ...queueBlocks(installation.organizationSlug, overview, installation.actionsEnabled)
              )
            } catch (error) {
              blocks.push(
                ...errorBlocks(
                  `${connection.name}: ${error instanceof Error ? error.message : 'Redis is unavailable.'}`
                )
              )
            }
            blocks.push({ type: 'divider' })
          }
        }
        if (blocks.length === 0) {
          return reply(
            'Queue not found',
            errorBlocks(
              `No queue named \`${escapeSlackText(queueName)}\` was found on your Durabull connections. Queue names are case-sensitive.`
            )
          )
        }
        blocks.pop()
        return reply(`Queue ${queueName}`, blocks)
      }
      case 'job': {
        const [jobId, queueName] = args
        if (!jobId) {
          return reply('Give a job id', errorBlocks(`Usage: \`${prefix} job <id> [queue]\``))
        }
        const blocks: unknown[] = []
        let truncated = false
        for (const { installation } of allowed) {
          const result = await findJob(installation.organizationId, jobId, queueName)
          truncated ||= result.truncated
          for (const match of result.matches.slice(0, 3)) {
            blocks.push(...jobBlocks(installation.organizationSlug, match), { type: 'divider' })
          }
        }
        if (blocks.length === 0) {
          return reply(
            'Job not found',
            errorBlocks(
              `No job \`${escapeSlackText(jobId)}\` was found${queueName ? ` in \`${escapeSlackText(queueName)}\`` : ''}.${
                truncated
                  ? ' Only the first 100 queues per connection were searched; add the queue name to narrow it down.'
                  : ''
              }`
            )
          )
        }
        blocks.pop()
        return reply(`Job ${jobId}`, blocks)
      }
      default:
        return reply('Unknown command', [
          ...errorBlocks(`Unknown command \`${escapeSlackText(command)}\`.`),
          ...helpBlocks(prefix),
        ])
    }
  } catch (error) {
    const message =
      error instanceof SlackOperationError || error instanceof SlackApiError
        ? error.message
        : 'Durabull could not complete that command. Try again in a moment.'
    if (!(error instanceof SlackOperationError)) console.error('[slack] Command failed:', error)
    return reply(message, errorBlocks(message))
  }
}

export async function handleSlashCommand(payload: SlackCommandPayload): Promise<void> {
  const result = await runCommand({
    teamId: payload.teamId,
    userId: payload.userId,
    text: payload.text,
    prefix: SLACK_SLASH_COMMAND,
  })
  await respond(payload.responseUrl, {
    replaceOriginal: true,
    text: result.text,
    blocks: result.blocks,
  })
}

// ---------------------------------------------------------------------------
// @Durabull mentions and direct messages
// ---------------------------------------------------------------------------

export const MENTION_PREFIX = '@Durabull'

export interface SlackConversationMessage {
  teamId: string
  userId: string
  channel: string
  ts: string
  threadTs?: string
  text: string
  /** A direct message to the bot rather than a mention in a channel. */
  direct: boolean
}

/** The command text after removing user mentions such as `<@U0BOT>`. */
export function stripMentions(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+(\|[^>]*)?>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Answers `@Durabull status` in a channel (in a thread on the mention) or a
 * direct message to the app. Channel answers are visible to the channel, so a
 * person who is not a member gets a private explanation instead.
 */
export async function handleConversationMessage(message: SlackConversationMessage): Promise<void> {
  const installations = await slackInstallationRepository.listActiveByTeam(message.teamId)
  const tokenInstallation = installations[0]
  if (!tokenInstallation) return

  const result = await runCommand({
    teamId: message.teamId,
    userId: message.userId,
    text: stripMentions(message.text),
    prefix: message.direct ? '' : MENTION_PREFIX,
  })
  const threadTs = message.direct ? message.threadTs : (message.threadTs ?? message.ts)
  await withSlackToken(tokenInstallation, async (token) => {
    if ((result.denied || result.multipleOrganizations) && !message.direct) {
      await postSlackEphemeral(token, {
        channel: message.channel,
        user: message.userId,
        text: result.text,
        blocks: result.multipleOrganizations
          ? [
              // Slack allows 50 blocks per message.
              ...result.blocks.slice(0, 49),
              {
                type: 'context',
                elements: [
                  mrkdwn(
                    'Only you can see this: it covers more than one Durabull organization, and people in this channel may not belong to all of them. Use `/durabull` for private answers.'
                  ),
                ],
              },
            ]
          : result.blocks,
        ...(threadTs ? { thread_ts: threadTs } : {}),
      })
      return
    }
    await postSlackMessage(token, {
      channel: message.channel,
      text: result.text,
      blocks: result.blocks,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    })
  })
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

export interface SlackBlockActionsPayload {
  type: 'block_actions'
  team?: { id?: string } | null
  user: { id: string; team_id?: string }
  api_app_id?: string
  container?: { type?: string; is_ephemeral?: boolean; channel_id?: string; message_ts?: string }
  response_url?: string
  actions: Array<{
    action_id: string
    value?: string
    selected_option?: { value?: string } | null
  }>
}

type IncidentActionKind = 'acknowledge' | 'unacknowledge' | 'resolve' | 'retry' | 'snooze'

export interface ActionResult {
  ok: boolean
  text: string
}

async function findIncident(
  teamId: string,
  eventId: string
): Promise<{ installation: SlackInstallationWithOrganization; event: AlertEvent } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null
  const installations = await slackInstallationRepository.listActiveByTeam(teamId)
  for (const installation of installations) {
    const event = await alertEventRepository.findById(eventId, installation.organizationId)
    if (event) return { installation, event }
  }
  return null
}

export async function performIncidentAction(input: {
  kind: IncidentActionKind
  eventId: string
  teamId: string
  slackUserId: string
  minutes?: number
}): Promise<ActionResult> {
  const found = await findIncident(input.teamId, input.eventId)
  if (!found) {
    return {
      ok: false,
      text: 'This incident does not belong to a Durabull organization connected to this workspace.',
    }
  }
  const { installation, event } = found
  const actor = await resolveSlackActor(installation, input.slackUserId, { requireActions: true })
  if (!actor.ok) return { ok: false, text: actor.message }
  const { member } = actor
  const orgId = installation.organizationId

  switch (input.kind) {
    case 'acknowledge': {
      const updated = await alertEventRepository.acknowledge(event.id, orgId, member.userId)
      if (!updated) {
        return {
          ok: false,
          text:
            event.status !== 'firing'
              ? 'This incident is already resolved.'
              : 'This incident is already acknowledged.',
        }
      }
      await syncSlackAlertMessages({ alertEventIds: [event.id] })
      return { ok: true, text: 'Incident acknowledged.' }
    }
    case 'unacknowledge': {
      const updated = await alertEventRepository.unacknowledge(event.id, orgId)
      if (!updated)
        return { ok: false, text: 'Only acknowledged, open incidents can be unacknowledged.' }
      await syncSlackAlertMessages({ alertEventIds: [event.id] })
      return { ok: true, text: 'Acknowledgement cleared.' }
    }
    case 'resolve': {
      if (event.status === 'suppressed') {
        return { ok: false, text: 'Suppressed incidents are informational and cannot be resolved.' }
      }
      const updated = await alertEventRepository.resolve(event.id, orgId, 'manual', member.userId)
      if (!updated) return { ok: false, text: 'This incident is already resolved.' }
      await syncSlackAlertMessages({ alertEventIds: [event.id] })
      return { ok: true, text: 'Incident resolved.' }
    }
    case 'snooze': {
      const option = SNOOZE_OPTIONS.find((candidate) => candidate.minutes === input.minutes)
      if (!option) return { ok: false, text: 'Choose a snooze duration from the list.' }
      const rule = await alertRuleRepository.findById(event.alertRuleId, orgId)
      if (!rule) return { ok: false, text: 'The alert rule for this incident no longer exists.' }
      const until = new Date(Date.now() + option.minutes * 60_000)
      await alertRuleRepository.setMutedUntil(rule.id, orgId, until)
      await refreshSlackAlertMessages(event, {
        note: `:zzz: *${escapeSlackText(member.name || member.email)}* snoozed *${slackInline(rule.name, 100)}* for ${option.label}, until ${slackDate(until, '{date_short_pretty} {time}')}. Open incidents stay open.`,
      })
      return { ok: true, text: `Rule snoozed for ${option.label}.` }
    }
    case 'retry': {
      if (event.type !== 'job_failed')
        return { ok: false, text: 'Only job-failed incidents have a job to retry.' }
      const jobId = jobIdFromEventContext(event.context)
      if (!jobId) return { ok: false, text: 'This incident does not reference a job.' }
      try {
        await retryFailedJob(orgId, {
          connectionId: event.connectionId,
          queueName: event.queueName,
          jobId,
        })
      } catch (error) {
        if (error instanceof SlackOperationError) return { ok: false, text: error.message }
        throw error
      }
      await refreshSlackAlertMessages(event, {
        note: `:repeat: *${escapeSlackText(member.name || member.email)}* retried job \`${escapeSlackText(jobId)}\`. The incident resolves automatically when the job completes.`,
      })
      return { ok: true, text: `Job ${jobId} moved back to waiting.` }
    }
  }
}

async function performQueueAction(input: {
  paused: boolean
  value: string
  teamId: string
  slackUserId: string
}): Promise<ActionResult & { blocks?: unknown[] }> {
  const separator = input.value.indexOf('|')
  const connectionId = input.value.slice(0, separator)
  const queueName = input.value.slice(separator + 1)
  if (separator < 0 || !connectionId || !queueName) return { ok: false, text: 'Unknown queue.' }

  const installations = await slackInstallationRepository.listActiveByTeam(input.teamId)
  for (const installation of installations) {
    const connection = await redisConnectionRepository.findById(
      connectionId,
      installation.organizationId
    )
    if (!connection) continue
    const actor = await resolveSlackActor(installation, input.slackUserId, { requireActions: true })
    if (!actor.ok) return { ok: false, text: actor.message }
    try {
      const overview = await setQueuePaused(installation.organizationId, {
        connectionId,
        queueName,
        paused: input.paused,
      })
      return {
        ok: true,
        text: `${queueName} ${input.paused ? 'paused' : 'resumed'}.`,
        blocks: [
          ...(overview
            ? queueBlocks(installation.organizationSlug, overview, installation.actionsEnabled)
            : [
                {
                  type: 'section',
                  text: mrkdwn(
                    `${slackCode(queueName, 100)} is ${input.paused ? 'paused' : 'running again'}. Its counts could not be refreshed; run ${SLACK_SLASH_COMMAND} queue ${slackInline(queueName, 100)} to see them.`
                  ),
                },
              ]),
          {
            type: 'context',
            elements: [
              mrkdwn(
                `${input.paused ? ':double_vertical_bar: Paused' : ':arrow_forward: Resumed'} by ${escapeSlackText(actor.member.name || actor.member.email)}`
              ),
            ],
          },
        ],
      }
    } catch (error) {
      if (error instanceof SlackOperationError) return { ok: false, text: error.message }
      throw error
    }
  }
  return {
    ok: false,
    text: 'That queue is not in a Durabull organization connected to this workspace.',
  }
}

function incidentKindFor(actionId: string): IncidentActionKind | null {
  switch (actionId) {
    case SLACK_ACTIONS.acknowledge:
      return 'acknowledge'
    case SLACK_ACTIONS.unacknowledge:
      return 'unacknowledge'
    case SLACK_ACTIONS.resolve:
      return 'resolve'
    case SLACK_ACTIONS.retryJob:
      return 'retry'
    default:
      return null
  }
}

export async function handleBlockActions(payload: SlackBlockActionsPayload): Promise<void> {
  const teamId = payload.team?.id ?? payload.user.team_id ?? ''
  const slackUserId = payload.user.id
  const fromHome = payload.container?.type === 'view'
  const fromEphemeral = Boolean(payload.container?.is_ephemeral)

  for (const action of payload.actions) {
    if (action.action_id.startsWith(SLACK_ACTIONS.openLink)) continue
    if (action.action_id === SLACK_ACTIONS.refreshHome) {
      await publishHomeTab(teamId, slackUserId)
      continue
    }

    let result: (ActionResult & { blocks?: unknown[] }) | null = null
    let replaceOriginal = false
    try {
      if (
        action.action_id === SLACK_ACTIONS.pauseQueue ||
        action.action_id === SLACK_ACTIONS.resumeQueue
      ) {
        result = await performQueueAction({
          paused: action.action_id === SLACK_ACTIONS.pauseQueue,
          value: action.value ?? '',
          teamId,
          slackUserId,
        })
        replaceOriginal = result.ok && Boolean(result.blocks)
      } else if (action.action_id === SLACK_ACTIONS.snooze) {
        const [eventId = '', minutes = ''] = (action.selected_option?.value ?? '').split('|')
        result = await performIncidentAction({
          kind: 'snooze',
          eventId,
          minutes: Number.parseInt(minutes, 10),
          teamId,
          slackUserId,
        })
      } else if (action.action_id === SLACK_ACTIONS.incidentMenu) {
        const [actionId = '', eventId = ''] = (action.selected_option?.value ?? '').split('|')
        const kind = incidentKindFor(actionId)
        if (kind) result = await performIncidentAction({ kind, eventId, teamId, slackUserId })
      } else {
        const kind = incidentKindFor(action.action_id)
        if (kind) {
          result = await performIncidentAction({
            kind,
            eventId: action.value ?? '',
            teamId,
            slackUserId,
          })
        }
      }
    } catch (error) {
      console.error('[slack] Interaction failed:', error)
      result = {
        ok: false,
        text:
          error instanceof SlackApiError
            ? error.message
            : 'Durabull could not complete that action. Try again in a moment.',
      }
    }
    if (!result) continue

    if (fromHome) {
      await publishHomeTab(teamId, slackUserId, result.ok ? undefined : result.text)
      continue
    }
    // Shared alert messages update in place and post a thread note, so only
    // failures (or replies to the user's own ephemeral results) need feedback.
    // A successful pause or resume also replaces the queue message, so its
    // counts and button match the new state.
    if (!result.ok || fromEphemeral || replaceOriginal) {
      await respond(payload.response_url, {
        text: result.ok ? result.text : `:warning: ${result.text}`,
        blocks: replaceOriginal ? result.blocks : undefined,
        replaceOriginal,
      }).catch((error) => console.warn('[slack] Could not send action feedback:', error))
    }
  }
}

// ---------------------------------------------------------------------------
// App Home
// ---------------------------------------------------------------------------

export async function publishHomeTab(
  teamId: string,
  slackUserId: string,
  notice?: string
): Promise<void> {
  const { allowed, denied, installations } = await resolveSlackUserOrganizations(
    teamId,
    slackUserId
  )
  const tokenInstallation = installations[0]
  if (!tokenInstallation) return

  const orgs = await Promise.all(
    allowed.map(async ({ installation }) => {
      const [status, open] = await Promise.all([
        loadOrganizationStatus(installation),
        loadOpenIncidents(installation, 5),
      ])
      return {
        status,
        incidents: open.incidents,
        totalOpen: open.totalOpen,
        actionsEnabled: installation.actionsEnabled,
      }
    })
  )
  const view = homeView({
    orgs,
    // Organizations are only named to their own members.
    denied: uniqueBy(
      denied.map((denial) => ({
        organizationName: isMemberDenial(denial)
          ? denial.installation.organizationName
          : 'Durabull',
        message: denial.message,
      })),
      (entry) => `${entry.organizationName}:${entry.message}`
    ),
    noInstallations: installations.length === 0,
  }) as { type: string; blocks: unknown[] }
  if (notice) {
    view.blocks.splice(2, 0, {
      type: 'section',
      text: mrkdwn(`:warning: ${slackInline(notice, 500)}`),
    })
  }
  await withSlackToken(tokenInstallation, (token) => publishSlackHomeView(token, slackUserId, view))
}

// ---------------------------------------------------------------------------
// Link unfurls
// ---------------------------------------------------------------------------

export type DurabullLink =
  | { kind: 'queue'; orgSlug: string; connectionId: string; queueName: string }
  | { kind: 'job'; orgSlug: string; connectionId: string; queueName: string; jobId: string }
  | { kind: 'rule'; orgSlug: string; connectionId: string; ruleId: string }

/** Recognises Durabull app URLs on this deployment's origin. */
export function parseDurabullLink(rawUrl: string, baseUrl = appBaseUrl()): DurabullLink | null {
  let url: URL
  let base: URL
  try {
    url = new URL(rawUrl)
    base = new URL(baseUrl)
  } catch {
    return null
  }
  if (url.origin !== base.origin) return null
  const basePath = base.pathname.replace(/\/+$/, '')
  if (basePath && !url.pathname.startsWith(`${basePath}/`)) return null
  const segments = url.pathname
    .slice(basePath.length)
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
  const [orgSlug, c, connectionId, section, ...rest] = segments
  if (!orgSlug || c !== 'c' || !connectionId || !section) return null
  if (section === 'queues' && rest[0]) {
    if (rest[1] === 'jobs' && rest[2]) {
      return { kind: 'job', orgSlug, connectionId, queueName: rest[0], jobId: rest[2] }
    }
    if (rest.length === 1) return { kind: 'queue', orgSlug, connectionId, queueName: rest[0] }
  }
  if (section === 'alerts' && rest[0] === 'rules' && rest[1]) {
    return { kind: 'rule', orgSlug, connectionId, ruleId: rest[1] }
  }
  return null
}

export interface SlackLinkSharedEvent {
  channel?: string
  message_ts?: string
  unfurl_id?: string
  source?: string
  user: string
  links: Array<{ url: string; domain?: string }>
}

async function buildUnfurl(
  installation: SlackInstallationWithOrganization,
  link: DurabullLink
): Promise<unknown[] | null> {
  const orgId = installation.organizationId
  const connection = await redisConnectionRepository.findById(link.connectionId, orgId)
  if (!connection) return null

  if (link.kind === 'rule') {
    const rule = await alertRuleRepository.findById(link.ruleId, orgId)
    if (!rule || rule.connectionId !== connection.id) return null
    const open = await alertEventRepository.countByConnection(connection.id, orgId, {
      alertRuleId: rule.id,
      status: 'firing',
    })
    const snoozed = rule.mutedUntil && rule.mutedUntil.getTime() > Date.now()
    const state = !rule.enabled ? 'Disabled' : snoozed ? 'Snoozed' : 'Active'
    return [
      {
        type: 'section',
        text: mrkdwn(
          `*${slackLink(connectionUrl(installation.organizationSlug, connection.id, `/alerts/rules/${encodeURIComponent(rule.id)}`), rule.name)}*\n${ruleTypeLabel(rule.type)} · ${slackInline(connection.name, 60)} · \`${slackInline(rule.queueName ?? 'all queues', 80)}\``
        ),
      },
      {
        type: 'context',
        elements: [
          mrkdwn(
            `${open > 0 ? `:red_circle: ${open} open incident${open === 1 ? '' : 's'}` : ':large_green_circle: No open incidents'} · ${state}${snoozed && rule.mutedUntil ? ` until ${slackDate(rule.mutedUntil, '{date_short_pretty} {time}')}` : ''}`
          ),
        ],
      },
    ]
  }

  if (!connection.enabled) return null
  if (link.kind === 'queue') {
    const overview = await getQueueOverview(connection, link.queueName)
    // Unfurls are visible to the whole channel; keep them read-only.
    return queueBlocks(installation.organizationSlug, overview, false).filter(
      (block) => (block as { type?: string }).type !== 'actions'
    )
  }
  const result = await findJob(orgId, link.jobId, link.queueName)
  const match = result.matches.find((candidate) => candidate.connection.id === connection.id)
  if (!match) return null
  return jobBlocks(installation.organizationSlug, match).filter(
    (block) => (block as { type?: string }).type !== 'actions'
  )
}

export async function handleLinkShared(teamId: string, event: SlackLinkSharedEvent): Promise<void> {
  const parsed = event.links
    .map((link) => ({ url: link.url, link: parseDurabullLink(link.url) }))
    .filter((entry): entry is { url: string; link: DurabullLink } => entry.link !== null)
    .slice(0, 5)
  if (parsed.length === 0) return

  const installations = await slackInstallationRepository.listActiveByTeam(teamId)
  const unfurls: Record<string, unknown> = {}
  let tokenInstallation: SlackInstallationWithOrganization | null = null
  for (const { url, link } of parsed) {
    const installation = installations.find(
      (candidate) => candidate.organizationSlug === link.orgSlug
    )
    if (!installation || !installation.unfurlsEnabled) continue
    // Only members may expose their organization's data in a channel.
    const actor = await resolveSlackActor(installation, event.user)
    if (!actor.ok) continue
    try {
      const blocks = await buildUnfurl(installation, link)
      if (blocks) {
        unfurls[url] = { blocks }
        tokenInstallation ??= installation
      }
    } catch (error) {
      console.warn('[slack] Unfurl failed', {
        kind: link.kind,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  if (!tokenInstallation || Object.keys(unfurls).length === 0) return
  await withSlackToken(tokenInstallation, (token) =>
    unfurlSlackLinks(
      token,
      event.unfurl_id && event.source
        ? { unfurl_id: event.unfurl_id, source: event.source, unfurls }
        : { channel: event.channel ?? '', ts: event.message_ts ?? '', unfurls }
    )
  )
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Slack does not deliver uninstall and revocation events in order, so a late
 * event only revokes installations that existed when it happened.
 */
export async function handleAppUninstalled(
  teamId: string,
  reason: string,
  occurredAt?: Date
): Promise<void> {
  const count = await slackInstallationRepository.markTeamRevoked(teamId, reason, { occurredAt })
  if (count > 0) console.info('[slack] Workspace access removed', { teamId, reason, count })
}
