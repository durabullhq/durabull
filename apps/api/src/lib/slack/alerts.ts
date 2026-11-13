import { AnalyticsEvents, SlackSurface } from '@durabull/analytics/events'
import {
  type AlertDelivery,
  type AlertDestination,
  type AlertEvent,
  type AlertSlackDestinationConfig,
  alertDeliveryRepository,
  alertDestinationRepository,
  alertEventRepository,
  alertRuleRepository,
  type ClaimedSlackAlertMessage,
  desiredSlackMessageState,
  eq,
  getDb,
  organization,
  redisConnectionRepository,
  type SlackInstallation,
  slackAlertMessageRepository,
  slackInstallationRepository,
} from '@durabull/dal'
import {
  buildAlertMessage,
  buildStateChangeReply,
  mentionPrefix,
  type SlackAlertMessageView,
} from './alert-message'
import { recordSlackEvent, slackErrorCode } from './analytics'
import { runInBackground } from './background'
import {
  getSlackPermalink,
  isAmbiguousSlackFailure,
  postSlackMessage,
  SlackApiError,
  updateSlackMessage,
} from './client'
import { appBaseUrl } from './config'
import { SlackInstallationUnavailableError, withSlackToken } from './token'

const SYNC_RETRY_BASE_MS = 30_000
const SYNC_RETRY_MAX_MS = 30 * 60_000
const SYNC_MAX_ATTEMPTS = 50
const DISCONNECTED_RECHECK_MS = 10 * 60_000
const NOT_IN_CHANNEL_RECHECK_MS = 30 * 60_000

/**
 * Slack errors after which a posted message cannot be updated until Slack
 * access changes. `not_in_channel` is left out: it clears when the app is
 * invited back, so it is rechecked periodically without using up attempts.
 */
const PERMANENT_UPDATE_ERRORS = new Set([
  'channel_not_found',
  'message_not_found',
  'cant_update_message',
  'edit_window_closed',
  'is_archived',
])

export function parseSlackDestinationConfig(
  destination: Pick<AlertDestination, 'config' | 'name'>
): AlertSlackDestinationConfig {
  const source =
    typeof destination.config === 'object' && destination.config !== null
      ? (destination.config as Record<string, unknown>)
      : {}
  const channelId = typeof source.channelId === 'string' ? source.channelId : ''
  if (!channelId) {
    throw new SlackApiError('channel_not_configured', {
      message: `Slack destination "${destination.name}" has no channel configured.`,
    })
  }
  return {
    channelId,
    channelName: typeof source.channelName === 'string' ? source.channelName : undefined,
    mention:
      source.mention === 'here' || source.mention === 'channel' || source.mention === 'none'
        ? source.mention
        : 'none',
    userGroupIds: Array.isArray(source.userGroupIds)
      ? source.userGroupIds.filter((id): id is string => typeof id === 'string')
      : [],
    threadUpdates: source.threadUpdates !== false,
    slackTeamId: typeof source.slackTeamId === 'string' ? source.slackTeamId : undefined,
  }
}

/**
 * False when the destination's channel was picked in a different Slack
 * workspace than the one now connected: its channel id means nothing there.
 * Destinations saved before the workspace was recorded are assumed to match.
 */
export function slackDestinationMatchesWorkspace(
  destination: Pick<AlertDestination, 'config'>,
  installation: Pick<SlackInstallation, 'slackTeamId'>
): boolean {
  const teamId = asRecord(destination.config).slackTeamId
  return typeof teamId !== 'string' || teamId === installation.slackTeamId
}

export const SLACK_WORKSPACE_CHANGED_MESSAGE =
  'This Slack destination was set up in a different Slack workspace than the one now connected. Edit it and pick a channel again.'

/** Thread updates are on unless the destination turned them off. */
function slackThreadUpdatesEnabled(destination: Pick<AlertDestination, 'config'>): boolean {
  return asRecord(destination.config).threadUpdates !== false
}

/** The organization's Slack installation when it is connected and usable, otherwise null. */
export async function findActiveSlackInstallation(
  organizationId: string
): Promise<SlackInstallation | null> {
  const installation = await slackInstallationRepository.findByOrganization(organizationId)
  return installation?.status === 'active' ? installation : null
}

export async function requireActiveSlackInstallation(
  organizationId: string
): Promise<SlackInstallation> {
  const installation = await slackInstallationRepository.findByOrganization(organizationId)
  if (!installation) {
    throw new SlackApiError('not_connected', {
      message:
        'Slack is not connected for this organization. Connect it under Settings → Integrations.',
    })
  }
  if (installation.status !== 'active') {
    throw new SlackApiError('not_connected', {
      message: `Slack needs to be reconnected (${installation.statusReason ?? 'revoked'}).`,
    })
  }
  return installation
}

/**
 * Re-reads the installation immediately before writing to Slack. Loading a
 * message's content takes a moment; if the organization disconnected Slack
 * (or connected another workspace) meanwhile, nothing is posted, even when
 * the bot token still works because another organization shares it.
 */
async function assertInstallationCurrent(installation: SlackInstallation): Promise<void> {
  const current = await slackInstallationRepository.findByOrganization(installation.organizationId)
  if (!current || current.status !== 'active' || current.slackTeamId !== installation.slackTeamId) {
    throw new SlackInstallationUnavailableError(
      'Slack was disconnected while this message was being prepared.'
    )
  }
}

async function getOrganizationSlug(organizationId: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)
  return rows[0]?.slug ?? null
}

function asRecord(context: unknown): Record<string, unknown> {
  return typeof context === 'object' && context !== null ? (context as Record<string, unknown>) : {}
}

/** The BullMQ job id a job-failed incident refers to, if any. */
export function jobIdFromEventContext(context: unknown): string | null {
  const jobId = asRecord(context).jobId
  return typeof jobId === 'string' ? jobId : null
}

function jobDetails(context: unknown): SlackAlertMessageView['job'] {
  const source = asRecord(context)
  if (typeof source.jobId !== 'string') return null
  return {
    id: source.jobId,
    name: typeof source.jobName === 'string' ? source.jobName : null,
    attemptsMade: typeof source.attemptsMade === 'number' ? source.attemptsMade : null,
    attempts: typeof source.attempts === 'number' ? source.attempts : null,
    failedReason: typeof source.failedReason === 'string' ? source.failedReason : null,
  }
}

export function buildIncidentUrls(input: {
  organizationSlug: string | null
  connectionId: string
  queueName: string
  ruleId: string
  eventType: string
  jobId?: string | null
}): SlackAlertMessageView['urls'] {
  const base = appBaseUrl()
  if (!input.organizationSlug) return { incident: base, rule: base, job: null }
  const org = encodeURIComponent(input.organizationSlug)
  const connection = encodeURIComponent(input.connectionId)
  const alerts = `${base}/${org}/c/${connection}/alerts`
  const rule = `${alerts}/rules/${encodeURIComponent(input.ruleId)}`
  const queue = `${base}/${org}/c/${connection}/queues/${encodeURIComponent(input.queueName)}`
  return {
    incident: input.eventType === 'redis_health' ? rule : input.jobId ? rule : queue,
    rule,
    job: input.jobId ? `${queue}/jobs/${encodeURIComponent(input.jobId)}` : null,
  }
}

/** Everything a Slack alert message shows, read fresh so re-renders reflect the latest state. */
export async function loadSlackAlertView(
  event: AlertEvent,
  installation: Pick<SlackInstallation, 'actionsEnabled'>,
  hints: { ruleName?: string; connectionName?: string; organizationSlug?: string | null } = {}
): Promise<SlackAlertMessageView> {
  const [rule, connection, organizationSlug, acknowledgedByName, resolvedByName] =
    await Promise.all([
      alertRuleRepository.findById(event.alertRuleId, event.organizationId),
      redisConnectionRepository
        .findById(event.connectionId, event.organizationId)
        .catch(() => null),
      hints.organizationSlug !== undefined
        ? Promise.resolve(hints.organizationSlug)
        : getOrganizationSlug(event.organizationId),
      event.acknowledgedBy
        ? slackInstallationRepository.findUserName(event.acknowledgedBy)
        : Promise.resolve(null),
      event.resolvedBy
        ? slackInstallationRepository.findUserName(event.resolvedBy)
        : Promise.resolve(null),
    ])
  const job = jobDetails(event.context)
  return {
    eventId: event.id,
    state: desiredSlackMessageState(event),
    ruleName: rule?.name ?? hints.ruleName ?? 'Alert rule',
    ruleType: event.type,
    connectionName: connection?.name ?? hints.connectionName ?? 'Redis connection',
    connectionEnvironment: connection?.environment ?? null,
    queueName: event.queueName,
    summary: event.summary,
    firedAt: event.firedAt,
    acknowledgedByName,
    resolvedAt: event.resolvedAt,
    resolvedByName,
    // The column predates Slack; it records the reason for every resolution, not only Linear's.
    resolutionReason: event.linearResolutionReason,
    job,
    urls: buildIncidentUrls({
      organizationSlug,
      connectionId: event.connectionId,
      queueName: event.queueName,
      ruleId: event.alertRuleId,
      eventType: event.type,
      jobId: job?.id,
    }),
    actionsEnabled: installation.actionsEnabled,
    ruleMutedUntil: rule?.mutedUntil ?? null,
  }
}

/**
 * Delivers an alert incident to a Slack destination's channel. A delivery that
 * already posted a message (a retried claim) is completed without reposting.
 */
export async function sendSlackDestinationAlert(input: {
  delivery: AlertDelivery
  event: AlertEvent
  destination: AlertDestination
  ruleName: string
  connectionName: string
  organizationSlug: string | null
  requireClaimedAt: (delivery: AlertDelivery) => Date
}): Promise<void> {
  const config = (() => {
    try {
      return parseSlackDestinationConfig(input.destination)
    } catch {
      return null
    }
  })()
  const properties = {
    slack_surface: SlackSurface.ALERT_MESSAGE,
    slack_rule_type: input.event.type,
    slack_mention: config?.mention ?? 'none',
    slack_user_group_count: config?.userGroupIds?.length ?? 0,
    slack_thread_updates: slackThreadUpdatesEnabled(input.destination),
  }
  const actor = { organizationId: input.event.organizationId }
  try {
    const result = await deliverSlackDestinationAlert(input)
    if (result.posted) {
      recordSlackEvent(AnalyticsEvents.SLACK_ALERT_POSTED, actor, {
        ...properties,
        // The state rendered in Slack, which can differ from the queued event's status.
        slack_alert_state: result.state,
      })
    }
  } catch (error) {
    recordSlackEvent(AnalyticsEvents.SLACK_ALERT_POST_FAILED, actor, {
      ...properties,
      slack_error_code: slackErrorCode(error),
      slack_reason:
        error instanceof SlackApiError && error.retryable
          ? 'retryable'
          : error instanceof SlackInstallationUnavailableError
            ? 'not_connected'
            : 'permanent',
    })
    throw error
  }
}

async function deliverSlackDestinationAlert(
  input: Parameters<typeof sendSlackDestinationAlert>[0]
): Promise<{ posted: false } | { posted: true; state: SlackAlertMessageView['state'] }> {
  const { delivery, destination } = input
  const config = parseSlackDestinationConfig(destination)
  const metadata = (delivery.providerMetadata ?? {}) as Record<string, unknown>

  const existing = await slackAlertMessageRepository.findByDelivery(delivery.id)
  if (existing) {
    // Report where the message actually went, even if the destination's
    // channel was changed before this retry.
    const postedConfig =
      existing.channelId === config.channelId
        ? config
        : { ...config, channelId: existing.channelId, channelName: undefined }
    await markSlackDeliveryDelivered(
      input,
      postedConfig,
      existing.messageTs,
      existing.permalink,
      metadata
    )
    return { posted: false }
  }

  const installation = await requireActiveSlackInstallation(input.event.organizationId)
  if (!slackDestinationMatchesWorkspace(destination, installation)) {
    throw new SlackApiError('workspace_changed', {
      retryable: false,
      message: SLACK_WORKSPACE_CHANGED_MESSAGE,
    })
  }
  const currentEvent =
    (await alertEventRepository.findById(input.event.id, input.event.organizationId)) ?? input.event
  const view = await loadSlackAlertView(currentEvent, installation, {
    ruleName: input.ruleName,
    connectionName: input.connectionName,
    organizationSlug: input.organizationSlug,
  })
  const mention =
    view.state === 'firing' ? mentionPrefix(config.mention, config.userGroupIds ?? []) : ''
  const content = buildAlertMessage(view, { mention })

  const { posted, permalink } = await withSlackToken(installation, async (token) => {
    await assertInstallationCurrent(installation)
    let posted: { channel: string; ts: string }
    try {
      posted = await postSlackMessage(token, {
        channel: config.channelId,
        text: content.text,
        attachments: content.attachments,
      })
    } catch (error) {
      if (isAmbiguousSlackFailure(error)) {
        // Slack may have posted it. Retrying automatically could post the incident twice.
        throw new SlackApiError('post_outcome_unknown', {
          retryable: false,
          message: `Slack did not confirm the post (${(error as SlackApiError).code}). Check the channel before retrying this delivery, so the incident is not posted twice.`,
        })
      }
      throw error
    }
    return { posted, permalink: await getSlackPermalink(token, posted.channel, posted.ts) }
  })

  try {
    await slackAlertMessageRepository.createOrGet({
      organizationId: currentEvent.organizationId,
      alertEventId: currentEvent.id,
      alertDeliveryId: delivery.id,
      destinationId: destination.id,
      slackTeamId: installation.slackTeamId,
      channelId: posted.channel,
      messageTs: posted.ts,
      permalink,
      renderedState: view.state,
      renderedAcknowledgedBy: currentEvent.acknowledgedBy,
    })
  } catch {
    throw new SlackApiError('record_failed', {
      retryable: false,
      message:
        'The Slack message was posted, but Durabull could not record it. Delivery is stopped to avoid posting it twice.',
    })
  }
  await markSlackDeliveryDelivered(input, config, posted.ts, permalink, metadata)
  return { posted: true, state: view.state }
}

async function markSlackDeliveryDelivered(
  input: Parameters<typeof sendSlackDestinationAlert>[0],
  config: AlertSlackDestinationConfig,
  ts: string,
  permalink: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  const marked = await alertDeliveryRepository.markDelivered(
    input.delivery.id,
    {
      externalId: ts,
      externalIdentifier: config.channelName ? `#${config.channelName}` : config.channelId,
      externalUrl: permalink,
      providerMetadata: {
        ...metadata,
        resolvedType: 'slack',
        destinationName: input.destination.name,
        channelId: config.channelId,
        channelName: config.channelName ?? null,
        messageTs: ts,
      },
    },
    input.requireClaimedAt(input.delivery)
  )
  if (!marked) {
    throw new SlackApiError('claim_lost', {
      retryable: false,
      message: 'Alert delivery claim was lost before it could be completed.',
    })
  }
}

/**
 * Re-renders Slack messages whose incident changed state (or that were asked
 * to refresh) and posts a short thread reply describing the change. Safe to
 * run from several processes: messages are claimed one at a time, so each
 * lease starts when its Slack update does, and results only land while the
 * lease is still held.
 */
export async function syncSlackAlertMessages(
  options: { alertEventIds?: string[]; limit?: number } = {}
): Promise<{ synced: number; failed: number }> {
  const limit = options.limit ?? 25
  let synced = 0
  let failed = 0
  const installations = new Map<string, SlackInstallation | null>()
  for (let processed = 0; processed < limit; processed++) {
    const [claim] = await slackAlertMessageRepository.claimOutOfSync({
      alertEventIds: options.alertEventIds,
      limit: 1,
      maxAttempts: SYNC_MAX_ATTEMPTS,
    })
    if (!claim) break
    try {
      await syncOneMessage(claim, installations)
      synced++
    } catch (error) {
      failed++
      await recordSyncFailure(claim, error)
    }
  }
  return { synced, failed }
}

async function syncOneMessage(
  claim: ClaimedSlackAlertMessage,
  installations: Map<string, SlackInstallation | null>
): Promise<void> {
  const event = await alertEventRepository.findById(claim.alertEventId, claim.organizationId)
  if (!event) {
    await slackAlertMessageRepository.abandon(claim, 'Alert incident no longer exists.')
    return
  }
  if (!installations.has(claim.organizationId)) {
    installations.set(
      claim.organizationId,
      await slackInstallationRepository.findByOrganization(claim.organizationId)
    )
  }
  const installation = installations.get(claim.organizationId)
  if (installation && installation.slackTeamId !== claim.slackTeamId) {
    await slackAlertMessageRepository.abandon(
      claim,
      'The organization is now connected to a different Slack workspace.'
    )
    return
  }
  if (!installation || installation.status !== 'active') {
    // Picked up again after Slack is reconnected; waiting does not use up retries.
    await slackAlertMessageRepository.defer(
      claim,
      new Date(Date.now() + DISCONNECTED_RECHECK_MS),
      'Slack is not connected.'
    )
    return
  }
  const view = await loadSlackAlertView(event, installation)
  const content = buildAlertMessage(view)
  const acknowledgedBy = view.state === 'acknowledged' ? event.acknowledgedBy : null
  const stateChanged =
    view.state !== claim.renderedState || acknowledgedBy !== claim.renderedAcknowledgedBy
  const destination = claim.destinationId
    ? await alertDestinationRepository.findById(claim.destinationId, claim.organizationId)
    : null
  const threadUpdates =
    destination?.type === 'slack' ? slackThreadUpdatesEnabled(destination) : true
  // A refresh-only pass (snooze, retry, settings change) re-renders without a reply.
  const reply =
    threadUpdates && stateChanged ? buildStateChangeReply(claim.renderedState, view) : null
  let threadReplyPosted = false

  await withSlackToken(installation, async (token) => {
    await assertInstallationCurrent(installation)
    await updateSlackMessage(token, {
      channel: claim.channelId,
      ts: claim.messageTs,
      text: content.text,
      attachments: content.attachments,
    })
    if (reply) {
      try {
        // Checked again: Slack may have been disconnected during the update.
        await assertInstallationCurrent(installation)
        await postSlackMessage(token, {
          channel: claim.channelId,
          thread_ts: claim.messageTs,
          text: reply,
        })
        threadReplyPosted = true
      } catch (error) {
        // The message itself is current; a missing thread reply is cosmetic.
        console.warn('[slack] Thread reply failed', {
          messageId: claim.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  })
  const recorded = await slackAlertMessageRepository.markSynced(claim, {
    state: view.state,
    acknowledgedBy,
  })
  recordSlackEvent(
    AnalyticsEvents.SLACK_ALERT_MESSAGE_SYNCED,
    { organizationId: claim.organizationId },
    {
      slack_surface: SlackSurface.ALERT_MESSAGE,
      slack_alert_state: view.state,
      slack_state_changed: stateChanged,
      slack_thread_updates: threadReplyPosted,
      slack_rule_type: event.type,
    }
  )
  if (!recorded) {
    // Another worker took the message over while this one was in Slack, so this
    // view may have overwritten a newer one. Ask for one more pass from current state.
    await slackAlertMessageRepository.requestRefresh([claim.alertEventId])
  }
}

async function recordSyncFailure(claim: ClaimedSlackAlertMessage, error: unknown): Promise<void> {
  const text = error instanceof Error ? error.message : String(error)
  if (
    (error instanceof SlackApiError && error.isAuthError) ||
    error instanceof SlackInstallationUnavailableError
  ) {
    // The installation is marked for reconnect; resume once it is fixed.
    await slackAlertMessageRepository.defer(
      claim,
      new Date(Date.now() + DISCONNECTED_RECHECK_MS),
      text
    )
    return
  }
  if (error instanceof SlackApiError && error.code === 'not_in_channel') {
    // Clears when someone invites the app back, which Durabull is not told
    // about; keep checking without using up attempts.
    await slackAlertMessageRepository.defer(
      claim,
      new Date(Date.now() + NOT_IN_CHANNEL_RECHECK_MS),
      text
    )
    return
  }
  if (error instanceof SlackApiError && PERMANENT_UPDATE_ERRORS.has(error.code)) {
    // Parked until the workspace is reconnected, which revives its messages.
    await slackAlertMessageRepository.abandon(claim, text)
    return
  }
  const attempts = claim.syncAttempts + 1
  const resetAt = error instanceof SlackApiError ? error.rateLimitResetAt : null
  const backoff = Math.min(SYNC_RETRY_MAX_MS, SYNC_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1))
  const recorded = await slackAlertMessageRepository.markSyncFailed(claim, {
    error: text,
    nextSyncAt: attempts >= SYNC_MAX_ATTEMPTS ? null : (resetAt ?? new Date(Date.now() + backoff)),
  })
  if (!recorded && isAmbiguousSlackFailure(error)) {
    // Slack may have applied this (older) view after the worker that took the
    // message over finished. Ask for one more pass from current state.
    await slackAlertMessageRepository.requestRefresh([claim.alertEventId])
  }
}

/**
 * Re-renders an incident's Slack messages after a change that does not alter
 * its state (its rule was snoozed, its job retried) and posts an optional
 * thread note. The refresh is recorded first, so the sweep finishes it if
 * Slack is unavailable now, and the view is always rendered from the
 * incident's current state, never from a copy read before the change.
 */
export async function refreshSlackAlertMessages(
  event: Pick<AlertEvent, 'id' | 'organizationId'>,
  options: { note?: string } = {}
): Promise<void> {
  const requested = await slackAlertMessageRepository.requestRefresh([event.id])
  if (requested === 0) return
  const installation = await findActiveSlackInstallation(event.organizationId)
  if (!installation) return
  if (options.note) {
    const note = options.note
    const messages = await slackAlertMessageRepository.listByEvent(event.id)
    const destinations = new Map<string, AlertDestination | null>()
    for (const message of messages) {
      if (message.slackTeamId !== installation.slackTeamId) continue
      if (message.destinationId && !destinations.has(message.destinationId)) {
        destinations.set(
          message.destinationId,
          await alertDestinationRepository.findById(message.destinationId, message.organizationId)
        )
      }
      const destination = message.destinationId ? destinations.get(message.destinationId) : null
      if (destination?.type === 'slack' && !slackThreadUpdatesEnabled(destination)) continue
      try {
        await withSlackToken(installation, async (token) => {
          await assertInstallationCurrent(installation)
          return postSlackMessage(token, {
            channel: message.channelId,
            thread_ts: message.messageTs,
            text: note,
          })
        })
      } catch (error) {
        if (error instanceof SlackApiError && error.isAuthError) break
        console.warn('[slack] Could not post thread note', {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  await syncSlackAlertMessages({ alertEventIds: [event.id] })
}

/** Mirrors incident changes into Slack right away instead of waiting for the sweep. */
export function queueSlackMessageSync(alertEventIds: string[]): void {
  const ids = [...new Set(alertEventIds.filter(Boolean))]
  if (ids.length === 0) return
  runInBackground('message sync', () => syncSlackAlertMessages({ alertEventIds: ids }))
}
