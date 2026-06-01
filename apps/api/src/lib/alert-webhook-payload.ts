import type { AlertEvent, AlertRuleType } from '@durabull/dal'
import { buildAlertAppUrls } from './alert-app-urls'

export const WEBHOOK_MAX_BODY_BYTES = 32_768
export const WEBHOOK_MAX_FAILED_REASON_LENGTH = 2_000
export const WEBHOOK_MAX_STRING_FIELD_LENGTH = 2_000

export type AlertWebhookEventType = 'alert.fired' | 'alert.test'

export interface AlertWebhookPayload {
  schemaVersion: 1
  event: AlertWebhookEventType
  id: string
  deliveryId: string
  occurredAt: string
  organization: { id: string; slug: string | null }
  connection: { id: string; name: string }
  rule: { id: string; name: string; type: AlertRuleType | string }
  queue: { name: string }
  alert: {
    status: 'firing'
    summary: string
    context: Record<string, unknown>
    firedAt: string
    dedupeKey: string | null
  }
  links: {
    dashboard: string
    job: string | null
    muteRule: string
  }
}

export interface BuildAlertWebhookPayloadInput {
  eventType: AlertWebhookEventType
  eventId: string
  deliveryId: string
  occurredAt: Date
  organizationId: string
  organizationSlug: string | null
  connection: { id: string; name: string }
  ruleId: string
  ruleName: string
  ruleType: AlertRuleType | string
  queueName: string
  summary: string
  context: Record<string, unknown> | null | undefined
  firedAt: Date
  dedupeKey?: string | null
  appBaseUrl: string
}

export function buildAlertWebhookPayload(
  input: BuildAlertWebhookPayloadInput
): AlertWebhookPayload {
  const jobId = getJobIdFromContext(input.context)
  const links = buildAlertAppUrls({
    appBaseUrl: input.appBaseUrl,
    organizationSlug: input.organizationSlug,
    connectionId: input.connection.id,
    queueName: input.queueName,
    alertRuleId: input.ruleId,
    jobId,
  })

  return {
    schemaVersion: 1,
    event: input.eventType,
    id: input.eventId,
    deliveryId: input.deliveryId,
    occurredAt: input.occurredAt.toISOString(),
    organization: {
      id: input.organizationId,
      slug: input.organizationSlug,
    },
    connection: {
      id: input.connection.id,
      name: input.connection.name,
    },
    rule: {
      id: input.ruleId,
      name: input.ruleName,
      type: input.ruleType,
    },
    queue: {
      name: input.queueName,
    },
    alert: {
      status: 'firing',
      summary: truncateString(input.summary, WEBHOOK_MAX_STRING_FIELD_LENGTH),
      context: sanitizeAlertContext(input.context),
      firedAt: input.firedAt.toISOString(),
      dedupeKey: input.dedupeKey ?? null,
    },
    links: {
      dashboard: links.dashboardUrl,
      job: jobId ? links.jobUrl : null,
      muteRule: links.muteUrl,
    },
  }
}

export function buildAlertWebhookPayloadFromEvent(
  event: AlertEvent,
  deliveryId: string,
  connection: { id: string; name: string },
  ruleName: string,
  organizationSlug: string | null,
  appBaseUrl: string
): AlertWebhookPayload {
  return buildAlertWebhookPayload({
    eventType: 'alert.fired',
    eventId: event.id,
    deliveryId,
    occurredAt: event.firedAt,
    organizationId: event.organizationId,
    organizationSlug,
    connection,
    ruleId: event.alertRuleId,
    ruleName,
    ruleType: event.type,
    queueName: event.queueName,
    summary: event.summary,
    context: (event.context ?? {}) as Record<string, unknown>,
    firedAt: event.firedAt,
    dedupeKey: event.dedupeKey,
    appBaseUrl,
  })
}

export function serializeAlertWebhookPayload(payload: AlertWebhookPayload): string {
  let current = payload
  const summaryLimits = [WEBHOOK_MAX_STRING_FIELD_LENGTH, 500, 200]

  for (let attempt = 0; attempt < summaryLimits.length; attempt++) {
    const body = JSON.stringify(current)
    if (Buffer.byteLength(body, 'utf8') <= WEBHOOK_MAX_BODY_BYTES) {
      return body
    }

    current = {
      ...current,
      alert: {
        ...current.alert,
        summary: truncateString(current.alert.summary, summaryLimits[attempt] ?? 200),
        context:
          attempt === 0
            ? truncateContextForSize(current.alert.context)
            : attempt === 1
              ? {}
              : current.alert.context,
      },
    }
  }

  const minimalPayload = buildMinimalWebhookPayload(current)
  const minimalBody = JSON.stringify(minimalPayload)
  if (Buffer.byteLength(minimalBody, 'utf8') <= WEBHOOK_MAX_BODY_BYTES) {
    return minimalBody
  }

  throw new Error(
    `Webhook payload exceeds ${WEBHOOK_MAX_BODY_BYTES} bytes even after truncation.`
  )
}

function buildMinimalWebhookPayload(payload: AlertWebhookPayload): AlertWebhookPayload {
  return {
    schemaVersion: 1,
    event: payload.event,
    id: payload.id,
    deliveryId: payload.deliveryId,
    occurredAt: payload.occurredAt,
    organization: {
      id: payload.organization.id,
      slug: payload.organization.slug,
    },
    connection: {
      id: payload.connection.id,
      name: truncateString(payload.connection.name, 200),
    },
    rule: {
      id: payload.rule.id,
      name: truncateString(payload.rule.name, 200),
      type: payload.rule.type,
    },
    queue: {
      name: truncateString(payload.queue.name, 200),
    },
    alert: {
      status: 'firing',
      summary: truncateString(payload.alert.summary, 200),
      context: {},
      firedAt: payload.alert.firedAt,
      dedupeKey: payload.alert.dedupeKey,
    },
    links: {
      dashboard: truncateString(payload.links.dashboard, 500),
      job: payload.links.job ? truncateString(payload.links.job, 500) : null,
      muteRule: truncateString(payload.links.muteRule, 500),
    },
  }
}

function getJobIdFromContext(context: Record<string, unknown> | null | undefined): string | null {
  if (!context || typeof context !== 'object') return null
  return typeof context.jobId === 'string' ? context.jobId : null
}

function sanitizeAlertContext(
  context: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!context || typeof context !== 'object') return {}

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string') {
      const maxLength =
        key === 'failedReason' ? WEBHOOK_MAX_FAILED_REASON_LENGTH : WEBHOOK_MAX_STRING_FIELD_LENGTH
      sanitized[key] = truncateString(value, maxLength)
      continue
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      sanitized[key] = value
      continue
    }
    if (Array.isArray(value)) {
      sanitized[key] = value.slice(0, 50)
      continue
    }
  }
  return sanitized
}

function truncateContextForSize(context: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string') {
      next[key] = truncateString(value, 250)
    } else {
      next[key] = value
    }
  }
  return next
}

function truncateString(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}
