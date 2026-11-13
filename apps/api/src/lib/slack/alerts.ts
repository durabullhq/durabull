import {
  type AlertDelivery,
  type AlertDestination,
  type AlertEvent,
  type AlertSlackDestinationConfig,
  alertDeliveryRepository,
  alertDestinationRepository,
  alertEventRepository,
  alertRuleRepository,
  desiredSlackMessageState,
  eq,
  getDb,
  organization,
  redisConnectionRepository,
  type SlackAlertMessage,
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
import { runInBackground } from './background'
import { getSlackPermalink, postSlackMessage, SlackApiError, updateSlackMessage } from './client'
import { appBaseUrl } from './config'
import { SlackInstallationUnavailableError, withSlackToken } from './token'

const SYNC_RETRY_BASE_MS = 30_000
const SYNC_RETRY_MAX_MS = 30 * 60_000
const SYNC_MAX_ATTEMPTS = 50
const DISCONNECTED_RECHECK_MS = 10 * 60_000

/** Slack errors after which a posted message can never be updated again. */
const PERMANENT_UPDATE_ERRORS = new Set([
  'channel_not_found',
  'message_not_found',
  'cant_update_message',
  'edit_window_closed',
  'is_archived',
  'not_in_channel',
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
  }
}

/** The organization's Slack installation when it is connected and usable, otherwise null. */
/** Thread updates are on unless the destination turned them off. */
function slackThreadUpdatesEnabled(destination: Pick<AlertDestination, 'config'>): boolean {
  return asRecord(destination.config).threadUpdates !== false
}

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
  const { delivery, destination } = input
  const config = parseSlackDestinationConfig(destination)
  const metadata = (delivery.providerMetadata ?? {}) as Record<string, unknown>

  const existing = await slackAlertMessageRepository.findByDelivery(delivery.id)
  if (existing) {
    await markSlackDeliveryDelivered(
      input,
      config,
      existing.messageTs,
      existing.permalink,
      metadata
    )
    return
  }

  const installation = await requireActiveSlackInstallation(input.event.organizationId)
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
    const posted = await postSlackMessage(token, {
      channel: config.channelId,
      text: content.text,
      attachments: content.attachments,
    })
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
 * Re-renders Slack messages whose incident changed state and posts a short
 * thread reply describing the change. Safe to run from several processes:
 * each message is leased before it is updated.
 */
export async function syncSlackAlertMessages(
  options: { alertEventIds?: string[]; limit?: number } = {}
): Promise<{ synced: number; failed: number }> {
  const messages = await slackAlertMessageRepository.claimOutOfSync({
    alertEventIds: options.alertEventIds,
    limit: options.limit ?? 25,
    maxAttempts: SYNC_MAX_ATTEMPTS,
  })
  let synced = 0
  let failed = 0
  const installations = new Map<string, SlackInstallation | null>()
  for (const message of messages) {
    try {
      await syncOneMessage(message, installations)
      synced++
    } catch (error) {
      failed++
      await recordSyncFailure(message, error)
    }
  }
  return { synced, failed }
}

async function syncOneMessage(
  message: SlackAlertMessage,
  installations: Map<string, SlackInstallation | null>
): Promise<void> {
  const event = await alertEventRepository.findById(message.alertEventId, message.organizationId)
  if (!event) {
    await slackAlertMessageRepository.abandon(message.id, 'Alert incident no longer exists.')
    return
  }
  if (!installations.has(message.organizationId)) {
    installations.set(
      message.organizationId,
      await slackInstallationRepository.findByOrganization(message.organizationId)
    )
  }
  const installation = installations.get(message.organizationId)
  if (installation && installation.slackTeamId !== message.slackTeamId) {
    await slackAlertMessageRepository.abandon(
      message.id,
      'The organization is now connected to a different Slack workspace.'
    )
    return
  }
  if (!installation || installation.status !== 'active') {
    // Picked up again after Slack is reconnected; waiting does not use up retries.
    await slackAlertMessageRepository.defer(
      message.id,
      new Date(Date.now() + DISCONNECTED_RECHECK_MS),
      'Slack is not connected.'
    )
    return
  }
  const view = await loadSlackAlertView(event, installation)
  const content = buildAlertMessage(view)
  const destination = message.destinationId
    ? await alertDestinationRepository.findById(message.destinationId, message.organizationId)
    : null
  const threadUpdates =
    destination?.type === 'slack' ? slackThreadUpdatesEnabled(destination) : true
  const reply = threadUpdates ? buildStateChangeReply(message.renderedState, view) : null

  await withSlackToken(installation, async (token) => {
    await updateSlackMessage(token, {
      channel: message.channelId,
      ts: message.messageTs,
      text: content.text,
      attachments: content.attachments,
    })
    if (reply) {
      try {
        await postSlackMessage(token, {
          channel: message.channelId,
          thread_ts: message.messageTs,
          text: reply,
        })
      } catch (error) {
        // The message itself is current; a missing thread reply is cosmetic.
        console.warn('[slack] Thread reply failed', {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  })
  await slackAlertMessageRepository.markSynced(message.id, {
    state: view.state,
    acknowledgedBy: view.state === 'acknowledged' ? event.acknowledgedBy : null,
  })
}

async function recordSyncFailure(message: SlackAlertMessage, error: unknown): Promise<void> {
  const text = error instanceof Error ? error.message : String(error)
  if (
    (error instanceof SlackApiError && error.isAuthError) ||
    error instanceof SlackInstallationUnavailableError
  ) {
    // The installation is marked for reconnect; resume once it is fixed.
    await slackAlertMessageRepository.defer(
      message.id,
      new Date(Date.now() + DISCONNECTED_RECHECK_MS),
      text
    )
    return
  }
  if (error instanceof SlackApiError && PERMANENT_UPDATE_ERRORS.has(error.code)) {
    await slackAlertMessageRepository.abandon(message.id, text)
    return
  }
  const attempts = message.syncAttempts + 1
  const resetAt = error instanceof SlackApiError ? error.rateLimitResetAt : null
  const backoff = Math.min(SYNC_RETRY_MAX_MS, SYNC_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1))
  await slackAlertMessageRepository.markSyncFailed(message.id, {
    error: text,
    nextSyncAt: attempts >= SYNC_MAX_ATTEMPTS ? null : (resetAt ?? new Date(Date.now() + backoff)),
  })
}

/**
 * Re-renders every Slack message for an incident whose state did not change
 * (for example its rule was snoozed) and optionally posts a thread note.
 */
export async function refreshSlackAlertMessages(
  event: AlertEvent,
  options: { note?: string } = {}
): Promise<void> {
  const messages = await slackAlertMessageRepository.listByEvent(event.id)
  if (messages.length === 0) return
  const installation = await findActiveSlackInstallation(event.organizationId)
  if (!installation) return
  const view = await loadSlackAlertView(event, installation)
  const content = buildAlertMessage(view)
  await withSlackToken(installation, async (token) => {
    for (const message of messages) {
      if (message.slackTeamId !== installation.slackTeamId) continue
      try {
        await updateSlackMessage(token, {
          channel: message.channelId,
          ts: message.messageTs,
          text: content.text,
          attachments: content.attachments,
        })
        if (options.note) {
          await postSlackMessage(token, {
            channel: message.channelId,
            thread_ts: message.messageTs,
            text: options.note,
          })
        }
      } catch (error) {
        if (error instanceof SlackApiError && error.isAuthError) throw error
        console.warn('[slack] Could not refresh alert message', {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  })
}

/** Mirrors incident changes into Slack right away instead of waiting for the sweep. */
export function queueSlackMessageSync(alertEventIds: string[]): void {
  const ids = [...new Set(alertEventIds.filter(Boolean))]
  if (ids.length === 0) return
  runInBackground('message sync', () => syncSlackAlertMessages({ alertEventIds: ids }))
}
