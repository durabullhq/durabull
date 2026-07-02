import {
  type AlertDelivery,
  type AlertDestination,
  type AlertEvent,
  type AlertWebhookDestination,
  alertDeliveryRepository,
  alertDestinationRepository,
  alertRuleRepository,
  alertWebhookDestinationRepository,
  decryptSecret,
  eq,
  getDb,
  linearIntegrationRepository,
  linearJobIssueRepository,
  organization,
  type RedisConnection,
} from '@durabull/dal'
import { isEmailConfigured } from '@durabull/email'
import { env } from '@durabull/env'
import { buildAlertAppUrls } from './alert-app-urls'
import {
  findWebhookSecretFromChannels,
  sanitizeDeliveryProviderMetadata,
  toWebhookDeliveryMetadata,
} from './alert-webhook-channels'
import {
  deliverWebhookOrThrow,
  isWebhookDeliveryExpired,
  WEBHOOK_DELIVERY_ABANDONED_MESSAGE,
  WebhookDeliveryError,
} from './alert-webhook-client'
import {
  buildAlertWebhookPayloadFromEvent,
  serializeAlertWebhookPayload,
} from './alert-webhook-payload'
import { getWebhookDeliveryTarget } from './alert-webhook-url'
import { createLinearIssue, LinearApiError } from './linear-client'
import { resolveLinearIssueFields } from './linear-field-resolver'
import { getValidLinearAccessToken } from './linear-oauth'

class NonRetryableDeliveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NonRetryableDeliveryError'
  }
}

/**
 * Notification dispatch only needs the connection's identity, not its secrets or
 * Redis URL. Depending on this narrow shape lets callers (e.g. a manual retry)
 * pass the already-resolved connection context without re-fetching or decrypting.
 */
export type AlertNotificationConnection = Pick<RedisConnection, 'id' | 'name'>

export type NotificationChannel =
  | {
      type: 'email'
      target: string
    }
  | {
      type: 'linear'
      target: 'org-default'
      teamId?: string
      projectId?: string
      labelIds?: string[]
      assigneeId?: string
      stateId?: string
      priority?: number
    }
  | {
      type: 'webhook'
      url: string
      secret?: string
    }
  | {
      type: 'webhook'
      destinationId: string
    }
  | {
      // Generalized saved-destination reference (webhook, email, or linear).
      // Resolved at dispatch time so destination edits apply to queued work.
      type: 'destination'
      destinationId: string
    }

export async function dispatchAlertNotification(
  event: AlertEvent,
  channels: NotificationChannel[],
  connection: AlertNotificationConnection,
  ruleName: string
): Promise<void> {
  const deliveries = await Promise.all(
    channels.map((channel) => buildDeliveryInput(channel, event.id, event.organizationId))
  )

  await alertDeliveryRepository.enqueueMany(deliveries)
  await processAlertDeliveries(event, connection, ruleName)
}

async function buildDeliveryInput(
  channel: NotificationChannel,
  alertEventId: string,
  organizationId: string
) {
  if (channel.type === 'destination') {
    // Only the reference is stored; the destination is resolved fresh at
    // dispatch so editing it updates all rules and pending deliveries.
    return {
      alertEventId,
      organizationId,
      channelType: channel.type,
      target: getSavedWebhookDeliveryTarget(channel.destinationId),
      providerMetadata: { type: 'destination', destinationId: channel.destinationId },
    }
  }

  if (channel.type === 'webhook' && 'destinationId' in channel) {
    const destination = await alertWebhookDestinationRepository.findById(
      channel.destinationId,
      organizationId
    )

    return {
      alertEventId,
      organizationId,
      channelType: channel.type,
      target: getSavedWebhookDeliveryTarget(channel.destinationId),
      providerMetadata: resolveSavedWebhookDeliveryMetadata(channel.destinationId, destination),
    }
  }

  return {
    alertEventId,
    organizationId,
    channelType: channel.type,
    target: getDeliveryTarget(channel),
    providerMetadata: getDeliveryProviderMetadata(channel),
  }
}

export type ProcessAlertDeliveriesOptions = {
  /** When set, claim and dispatch only this delivery (manual retry). */
  deliveryId?: string
  /** Used by the monitor sweep after it has already claimed delivery rows. */
  claimedDeliveries?: AlertDelivery[]
}

export async function processAlertDeliveries(
  event: AlertEvent,
  connection: AlertNotificationConnection,
  ruleName: string,
  options?: ProcessAlertDeliveriesOptions
): Promise<void> {
  const dueDeliveries =
    options?.claimedDeliveries ??
    (options?.deliveryId
      ? await alertDeliveryRepository.claimById(options.deliveryId, event.id)
      : await alertDeliveryRepository.claimDueForEvent(event.id))
  if (dueDeliveries.length === 0) return

  const organizationSlug = await getOrganizationSlug(event.organizationId)

  for (const delivery of dueDeliveries) {
    if (delivery.channelType === 'webhook' && isWebhookDeliveryExpired(delivery.createdAt)) {
      await alertDeliveryRepository.markFailed(delivery.id, {
        error: WEBHOOK_DELIVERY_ABANDONED_MESSAGE,
        retryable: false,
        expectedClaimedAt: requireClaimedAt(delivery),
      })
      continue
    }

    try {
      switch (delivery.channelType) {
        case 'email':
          await sendAlertEmail(delivery.target, event, connection, ruleName, organizationSlug)
          await alertDeliveryRepository.markDelivered(delivery.id, {}, requireClaimedAt(delivery))
          break
        case 'linear':
          await sendLinearAlert(delivery, event, connection, ruleName, organizationSlug)
          break
        case 'webhook':
          await sendWebhookAlert(delivery, event, connection, ruleName, organizationSlug)
          break
        case 'destination':
          await sendDestinationAlert(delivery, event, connection, ruleName, organizationSlug)
          break
        default:
          await alertDeliveryRepository.markFailed(delivery.id, {
            error: `Unknown channel type: ${delivery.channelType}`,
            retryable: false,
            expectedClaimedAt: requireClaimedAt(delivery),
          })
      }
    } catch (error) {
      const retry = classifyDeliveryFailure(error, delivery.attemptCount + 1, delivery)
      await alertDeliveryRepository.markFailed(delivery.id, {
        ...retry,
        expectedClaimedAt: requireClaimedAt(delivery),
      })
    }
  }
}

function getDeliveryProviderMetadata(
  channel: Exclude<NotificationChannel, { destinationId: string }>
): Record<string, unknown> {
  if (channel.type === 'webhook') {
    return { ...toWebhookDeliveryMetadata(channel) }
  }
  return channel as Record<string, unknown>
}

function getDeliveryTarget(
  channel: Exclude<NotificationChannel, { destinationId: string }>
): string {
  if (channel.type === 'email') return channel.target
  if (channel.type === 'webhook') {
    return getWebhookDeliveryTarget(channel.url)
  }
  return [
    'org-default',
    channel.teamId ?? '',
    channel.projectId ?? '',
    channel.assigneeId ?? '',
    channel.stateId ?? '',
    channel.priority ?? '',
    ...(channel.labelIds ?? []),
  ].join(':')
}

function getSavedWebhookDeliveryTarget(destinationId: string): string {
  return `destination:${destinationId}`
}

function resolveSavedWebhookDeliveryMetadata(
  destinationId: string,
  destination: AlertWebhookDestination | null
): Record<string, unknown> {
  if (!destination) {
    return {
      type: 'webhook',
      destinationId,
      deliveryError: 'Webhook destination was deleted before alert delivery was queued.',
    }
  }
  if (!destination.enabled) {
    return {
      type: 'webhook',
      destinationId,
      destinationName: destination.name,
      deliveryError: `Webhook destination "${destination.name}" is disabled.`,
      deliveryErrorRetryable: true,
    }
  }

  let secretLast4: string | undefined
  if (destination.encryptedSigningSecret) {
    try {
      const secret = decryptSecret(destination.encryptedSigningSecret)
      secretLast4 = secret.length >= 4 ? secret.slice(-4) : undefined
    } catch {
      return {
        type: 'webhook',
        destinationId,
        destinationName: destination.name,
        url: destination.url,
        encryptedSigningSecret: destination.encryptedSigningSecret,
        secretConfigured: true,
        deliveryError: `Webhook destination "${destination.name}" signing secret could not be decrypted.`,
        deliveryErrorRetryable: true,
      }
    }
  }

  return {
    type: 'webhook',
    destinationId,
    destinationName: destination.name,
    url: destination.url,
    encryptedSigningSecret: destination.encryptedSigningSecret,
    secretConfigured: Boolean(destination.encryptedSigningSecret),
    ...(secretLast4 ? { secretLast4 } : {}),
  }
}

async function sendAlertEmail(
  to: string,
  event: AlertEvent,
  connection: AlertNotificationConnection,
  ruleName: string,
  organizationSlug: string | null
): Promise<void> {
  if (!isEmailConfigured()) {
    throw new NonRetryableDeliveryError(
      'Email delivery is not configured because RESEND_API_KEY is missing.'
    )
  }

  const { sendAlertNotificationEmail } = await import('@durabull/email')
  const { dashboardUrl, muteUrl } = buildAlertAppUrls({
    appBaseUrl: env.APP_BASE_URL,
    organizationSlug,
    connectionId: connection.id,
    queueName: event.queueName,
    alertRuleId: event.alertRuleId,
  })

  await sendAlertNotificationEmail({
    to,
    alertRuleName: ruleName,
    queueName: event.queueName,
    connectionName: connection.name,
    summary: event.summary,
    firedAt: event.firedAt,
    context: (event.context ?? {}) as Record<string, unknown>,
    dashboardUrl,
    muteUrl,
  })
}

async function sendLinearAlert(
  delivery: AlertDelivery,
  event: AlertEvent,
  connection: AlertNotificationConnection,
  ruleName: string,
  organizationSlug: string | null
): Promise<void> {
  const integration = await linearIntegrationRepository.findByOrganization(event.organizationId)
  if (!integration) {
    throw new LinearApiError('Linear integration is not configured for this organization.', {
      status: 400,
      retryable: false,
    })
  }

  const channel = parseLinearChannel(delivery.providerMetadata)
  const teamId = channel.teamId ?? integration.defaultTeamId
  if (!teamId) {
    throw new LinearApiError('Linear team is required before alert delivery can create issues.', {
      status: 400,
      retryable: false,
    })
  }

  const jobContext = getJobContext(event.context)
  const { jobUrl } = buildAlertAppUrls({
    appBaseUrl: env.APP_BASE_URL,
    organizationSlug,
    connectionId: connection.id,
    queueName: event.queueName,
    alertRuleId: event.alertRuleId,
    jobId: jobContext.jobId,
  })

  const existingIssue = jobContext.jobId
    ? await linearJobIssueRepository.findByJob({
        organizationId: event.organizationId,
        connectionId: event.connectionId,
        queueName: event.queueName,
        jobId: jobContext.jobId,
      })
    : null

  if (existingIssue) {
    await linearJobIssueRepository.createOrGet({
      organizationId: event.organizationId,
      connectionId: event.connectionId,
      queueName: event.queueName,
      jobId: existingIssue.jobId,
      alertEventId: event.id,
      linearIssueId: existingIssue.linearIssueId,
      linearIssueIdentifier: existingIssue.linearIssueIdentifier,
      linearIssueUrl: existingIssue.linearIssueUrl,
    })
    await markLinearDeliveryDelivered(delivery, {
      id: existingIssue.linearIssueId,
      identifier: existingIssue.linearIssueIdentifier,
      url: existingIssue.linearIssueUrl,
    })
    return
  }

  const accessToken = await getValidLinearAccessToken(integration)
  const resolvedFields = await resolveLinearIssueFields(integration, accessToken, {
    teamId,
    projectId: channel.projectId ?? integration.defaultProjectId,
    labelIds: channel.labelIds?.length ? channel.labelIds : integration.defaultLabelIds,
    assigneeId: channel.assigneeId ?? integration.defaultAssigneeId,
    stateId: channel.stateId ?? integration.defaultStateId,
    priority: channel.priority ?? integration.defaultPriority,
  })
  const issue = await createLinearIssueOnce(accessToken, {
    teamId: resolvedFields.teamId,
    title: buildLinearIssueTitle(event, connection, ruleName, jobContext.jobName),
    description: buildLinearIssueDescription({
      event,
      connection,
      ruleName,
      jobUrl,
      jobContext,
    }),
    projectId: resolvedFields.projectId,
    labelIds: resolvedFields.labelIds,
    assigneeId: resolvedFields.assigneeId,
    stateId: resolvedFields.stateId,
    priority: resolvedFields.priority,
  })

  try {
    const deliveredIssue = jobContext.jobId
      ? linearJobIssueToDeliveryIssue(
          await linearJobIssueRepository.createOrGet({
            organizationId: event.organizationId,
            connectionId: event.connectionId,
            queueName: event.queueName,
            jobId: jobContext.jobId,
            alertEventId: event.id,
            linearIssueId: issue.id,
            linearIssueIdentifier: issue.identifier,
            linearIssueUrl: issue.url,
          })
        )
      : issue

    await markLinearDeliveryDelivered(delivery, deliveredIssue)
  } catch {
    throw new LinearApiError(
      `Linear issue ${issue.identifier} was created, but Durabull could not record the delivery. Manual reconciliation is required before retrying.`,
      { status: 500, retryable: false }
    )
  }
}

async function createLinearIssueOnce(
  accessToken: string,
  input: Parameters<typeof createLinearIssue>[1]
): ReturnType<typeof createLinearIssue> {
  try {
    return await createLinearIssue(accessToken, input)
  } catch (error) {
    if (error instanceof LinearApiError && error.retryable && error.status !== 429) {
      throw new LinearApiError(
        'Linear issue creation returned an ambiguous failure. Manual reconciliation is required before retrying to avoid duplicate issues.',
        { status: error.status, retryable: false }
      )
    }
    throw error
  }
}

function linearJobIssueToDeliveryIssue(issue: {
  linearIssueId: string
  linearIssueIdentifier: string
  linearIssueUrl: string
}): { id: string; identifier: string; url: string } {
  return {
    id: issue.linearIssueId,
    identifier: issue.linearIssueIdentifier,
    url: issue.linearIssueUrl,
  }
}

async function markLinearDeliveryDelivered(
  delivery: AlertDelivery,
  issue: { id: string; identifier: string; url: string }
): Promise<void> {
  const marked = await alertDeliveryRepository.markDelivered(
    delivery.id,
    {
      externalId: issue.id,
      externalIdentifier: issue.identifier,
      externalUrl: issue.url,
      providerMetadata: {
        ...((delivery.providerMetadata ?? {}) as Record<string, unknown>),
        issue,
      },
    },
    requireClaimedAt(delivery)
  )
  if (!marked) {
    throw new LinearApiError('Alert delivery claim was lost before it could be completed.', {
      status: 409,
      retryable: false,
    })
  }
}

function requireClaimedAt(delivery: AlertDelivery): Date {
  if (delivery.claimedAt instanceof Date) return delivery.claimedAt
  throw new LinearApiError('Alert delivery was not claimed before finalization.', {
    status: 409,
    retryable: false,
  })
}

async function sendDestinationAlert(
  delivery: AlertDelivery,
  event: AlertEvent,
  connection: AlertNotificationConnection,
  ruleName: string,
  organizationSlug: string | null
): Promise<void> {
  const metadata = (delivery.providerMetadata ?? {}) as Record<string, unknown>
  const destinationId = typeof metadata.destinationId === 'string' ? metadata.destinationId : ''
  if (!destinationId) {
    throw new NonRetryableDeliveryError('Destination delivery is missing its destination id.')
  }

  const destination = await alertDestinationRepository.findById(
    destinationId,
    event.organizationId
  )
  if (!destination) {
    throw new NonRetryableDeliveryError('Notification destination no longer exists.')
  }
  if (!destination.enabled) {
    throw new WebhookDeliveryError(`Destination "${destination.name}" is disabled.`, {
      retryable: true,
    })
  }

  switch (destination.type) {
    case 'email': {
      const target = getEmailDestinationTarget(destination)
      await sendAlertEmail(target, event, connection, ruleName, organizationSlug)
      await alertDeliveryRepository.markDelivered(
        delivery.id,
        {
          providerMetadata: {
            ...metadata,
            resolvedType: 'email',
            destinationName: destination.name,
            target,
          },
        },
        requireClaimedAt(delivery)
      )
      break
    }
    case 'linear': {
      const config =
        typeof destination.config === 'object' && destination.config !== null
          ? (destination.config as Record<string, unknown>)
          : {}
      await sendLinearAlert(
        {
          ...delivery,
          providerMetadata: {
            // Preserve the original destination marker (mirrors the email
            // branch) instead of overwriting it with 'linear' — parseLinearChannel
            // only reads the config fields below and ignores `type`.
            ...metadata,
            ...config,
            resolvedType: 'linear',
            destinationName: destination.name,
          },
        },
        event,
        connection,
        ruleName,
        organizationSlug
      )
      break
    }
    case 'webhook': {
      // Webhook-type destination deliveries share the webhook expiry window.
      if (isWebhookDeliveryExpired(delivery.createdAt)) {
        throw new NonRetryableDeliveryError(WEBHOOK_DELIVERY_ABANDONED_MESSAGE)
      }
      await sendWebhookAlert(
        {
          ...delivery,
          providerMetadata: resolveSavedWebhookDeliveryMetadata(destinationId, destination),
        },
        event,
        connection,
        ruleName,
        organizationSlug
      )
      break
    }
    default:
      throw new NonRetryableDeliveryError(
        `Destination "${destination.name}" has an unknown type: ${destination.type}`
      )
  }
}

function getEmailDestinationTarget(destination: AlertDestination): string {
  const target =
    typeof destination.config === 'object' && destination.config !== null
      ? (destination.config as { target?: unknown }).target
      : undefined
  if (typeof target !== 'string' || !target) {
    throw new NonRetryableDeliveryError(
      `Email destination "${destination.name}" has no target address configured.`
    )
  }
  return target
}

async function sendWebhookAlert(
  delivery: AlertDelivery,
  event: AlertEvent,
  connection: AlertNotificationConnection,
  ruleName: string,
  organizationSlug: string | null
): Promise<void> {
  const metadata = await resolveWebhookMetadataForDispatch(
    delivery.providerMetadata as Record<string, unknown> | null | undefined,
    event.organizationId
  )
  if (metadata && typeof metadata.deliveryError === 'string') {
    if (metadata.deliveryErrorRetryable === true) {
      throw new WebhookDeliveryError(metadata.deliveryError, { retryable: true })
    }
    throw new NonRetryableDeliveryError(metadata.deliveryError)
  }
  const channel = parseWebhookChannel(metadata)
  const secret = await resolveWebhookSigningSecret(event, channel.url, metadata)
  const payload = buildAlertWebhookPayloadFromEvent(
    event,
    delivery.id,
    connection,
    ruleName,
    organizationSlug,
    env.APP_BASE_URL
  )
  const body = serializeAlertWebhookPayload(payload)

  const result = await deliverWebhookOrThrow({
    url: channel.url,
    body,
    secret,
    deliveryId: delivery.id,
    idempotencyKey: event.id,
  })

  const marked = await alertDeliveryRepository.markDelivered(
    delivery.id,
    {
      providerMetadata: sanitizeDeliveryProviderMetadata({
        ...((delivery.providerMetadata ?? {}) as Record<string, unknown>),
        ...(metadata ?? {}),
        httpStatus: result.httpStatus,
        responseTimeMs: result.durationMs,
        responseBodySnippet: result.responseBodySnippet,
      }),
    },
    requireClaimedAt(delivery)
  )
  if (!marked) {
    throw new WebhookDeliveryError('Alert delivery claim was lost before it could be completed.', {
      httpStatus: 409,
      retryable: false,
    })
  }
}

async function resolveWebhookMetadataForDispatch(
  metadata: Record<string, unknown> | null | undefined,
  organizationId: string
): Promise<Record<string, unknown> | null | undefined> {
  const destinationId = typeof metadata?.destinationId === 'string' ? metadata.destinationId : ''
  if (!destinationId || typeof metadata?.deliveryError !== 'string') {
    return metadata
  }

  const destination = await alertWebhookDestinationRepository.findById(
    destinationId,
    organizationId
  )
  return resolveSavedWebhookDeliveryMetadata(destinationId, destination)
}

function parseWebhookChannel(value: unknown): { type: 'webhook'; url: string } {
  const source =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const url = typeof source.url === 'string' ? source.url : ''
  if (!url) {
    throw new NonRetryableDeliveryError('Webhook delivery is missing a target URL.')
  }
  return {
    type: 'webhook',
    url,
  }
}

async function resolveWebhookSigningSecret(
  event: AlertEvent,
  url: string,
  metadata: unknown
): Promise<string | undefined> {
  const source =
    typeof metadata === 'object' && metadata !== null ? (metadata as Record<string, unknown>) : {}
  const encryptedSigningSecret =
    typeof source.encryptedSigningSecret === 'string' ? source.encryptedSigningSecret : ''
  if (encryptedSigningSecret) {
    try {
      return decryptSecret(encryptedSigningSecret)
    } catch {
      throw new NonRetryableDeliveryError('Webhook signing secret could not be decrypted.')
    }
  }

  const legacySecret = typeof source.secret === 'string' ? source.secret.trim() : ''
  if (legacySecret.length > 0) {
    return legacySecret
  }

  const rule = await alertRuleRepository.findById(event.alertRuleId, event.organizationId)
  if (!rule) return undefined

  return findWebhookSecretFromChannels(
    Array.isArray(rule.notificationChannels) ? rule.notificationChannels : [],
    url
  )
}

function parseLinearChannel(value: unknown): Extract<NotificationChannel, { type: 'linear' }> {
  const source =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return {
    type: 'linear',
    target: 'org-default',
    teamId: typeof source.teamId === 'string' ? source.teamId : undefined,
    projectId: typeof source.projectId === 'string' ? source.projectId : undefined,
    labelIds: Array.isArray(source.labelIds)
      ? source.labelIds.filter((label): label is string => typeof label === 'string')
      : undefined,
    assigneeId: typeof source.assigneeId === 'string' ? source.assigneeId : undefined,
    stateId: typeof source.stateId === 'string' ? source.stateId : undefined,
    priority: typeof source.priority === 'number' ? source.priority : undefined,
  }
}

function getJobContext(context: unknown): {
  jobId: string | null
  jobName: string | null
  failedReason: string | null
  attemptsMade: number | null
  attempts: number | null
  failedAt: string | null
} {
  const source =
    typeof context === 'object' && context !== null ? (context as Record<string, unknown>) : {}
  return {
    jobId: typeof source.jobId === 'string' ? source.jobId : null,
    jobName: typeof source.jobName === 'string' ? source.jobName : null,
    failedReason: typeof source.failedReason === 'string' ? source.failedReason : null,
    attemptsMade: typeof source.attemptsMade === 'number' ? source.attemptsMade : null,
    attempts: typeof source.attempts === 'number' ? source.attempts : null,
    failedAt: typeof source.failedAt === 'string' ? source.failedAt : null,
  }
}

function buildLinearIssueTitle(
  event: AlertEvent,
  connection: AlertNotificationConnection,
  ruleName: string,
  jobName: string | null
): string {
  if (event.type === 'job_failed') {
    return `[Durabull] ${connection.name}/${event.queueName} job failed${
      jobName ? `: ${safeLinearMarkdown(jobName, 200)}` : ''
    }`
  }

  return `[Durabull] ${safeLinearMarkdown(ruleName, 200)} fired for ${connection.name}/${event.queueName}`
}

function buildLinearIssueDescription({
  event,
  connection,
  ruleName,
  jobUrl,
  jobContext,
}: {
  event: AlertEvent
  connection: AlertNotificationConnection
  ruleName: string
  jobUrl: string
  jobContext: ReturnType<typeof getJobContext>
}): string {
  const lines = [
    `Durabull alert rule **${safeLinearMarkdown(ruleName, 200)}** fired.`,
    '',
    `- Connection: ${connection.name}`,
    `- Queue: ${event.queueName}`,
    `- Summary: ${safeLinearMarkdown(event.summary)}`,
    `- Fired at: ${event.firedAt.toISOString()}`,
  ]

  if (jobContext.jobId) lines.push(`- Job ID: ${jobContext.jobId}`)
  if (jobContext.jobName) lines.push(`- Job name: ${safeLinearMarkdown(jobContext.jobName, 200)}`)
  if (jobContext.failedReason) {
    lines.push(`- Failure reason: ${safeLinearMarkdown(jobContext.failedReason)}`)
  }
  if (jobContext.attemptsMade !== null) {
    lines.push(`- Attempts made: ${jobContext.attemptsMade}`)
  }
  if (jobContext.attempts !== null) lines.push(`- Max attempts: ${jobContext.attempts}`)
  if (jobContext.failedAt) lines.push(`- Failed at: ${jobContext.failedAt}`)
  lines.push('', `[Open in Durabull](${jobUrl})`)

  return lines.join('\n')
}

function safeLinearMarkdown(value: string, maxLength = 1000): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  const truncated =
    normalized.length > maxLength
      ? `${normalized.slice(0, Math.max(0, maxLength - 1))}...`
      : normalized
  return truncated.replace(/([\\`*_{}[\]()#+\-.!>])/g, '\\$1')
}

function classifyDeliveryFailure(
  error: unknown,
  attemptCount: number,
  delivery?: Pick<AlertDelivery, 'channelType' | 'createdAt'>
): { error: string; retryable: boolean; nextRetryAt?: Date | null } {
  if (delivery?.channelType === 'webhook' && isWebhookDeliveryExpired(delivery.createdAt)) {
    return { error: WEBHOOK_DELIVERY_ABANDONED_MESSAGE, retryable: false }
  }

  const message = error instanceof Error ? error.message : String(error)
  const retryable =
    error instanceof LinearApiError
      ? error.retryable
      : error instanceof WebhookDeliveryError
        ? error.retryable
        : !(error instanceof NonRetryableDeliveryError)
  if (!retryable) return { error: message, retryable: false }

  const resetAt = error instanceof LinearApiError ? error.rateLimitResetAt : null
  const backoffMs = Math.min(60 * 60 * 1000, 2 ** Math.max(0, attemptCount - 1) * 30_000)
  return {
    error: message,
    retryable: true,
    nextRetryAt:
      resetAt && resetAt.getTime() > Date.now() ? resetAt : new Date(Date.now() + backoffMs),
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

export { buildAlertAppUrls } from './alert-app-urls'

export const __alertNotifierTestUtils = {
  buildDeliveryInput,
  getSavedWebhookDeliveryTarget,
  resolveWebhookMetadataForDispatch,
  sendDestinationAlert,
}
