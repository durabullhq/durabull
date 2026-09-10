import type { AlertDelivery, AlertEvent, AlertRule } from '@durabull/dal'
import type {
  McpAlertEventDetail,
  McpAlertEventSummary,
  McpAlertRuleSummary,
  McpScheduledJobSummary,
} from '@durabull/mcp'
import {
  sanitizeMcpText as sanitizeMcpTextImpl,
  truncateMcpText as truncateMcpTextImpl,
} from '@durabull/mcp/safety/sanitize-output'

import type { ScheduledJobSummary } from '../../lib/scheduled-jobs'
import { toIsoString, toRecord } from './format'

export { sanitizeMcpOutput } from '@durabull/mcp/safety/sanitize-output'

const SENSITIVE_KEY =
  /(^|_)(secret|password|authorization|api[_-]?key|credential|private[_-]?key|redis[_-]?url|connection[_-]?url|access[_-]?token)(_|$)/i
const MAX_CONTEXT_DEPTH = 4
const MAX_CONTEXT_ARRAY_ITEMS = 50

export const truncateMcpText = truncateMcpTextImpl
export const sanitizeMcpText = sanitizeMcpTextImpl

export function sanitizeAlertEventContext(
  context: unknown,
  depth = 0
): Record<string, unknown> | null {
  if (context == null || depth > MAX_CONTEXT_DEPTH) {
    return null
  }

  if (Array.isArray(context)) {
    const items = context
      .slice(0, MAX_CONTEXT_ARRAY_ITEMS)
      .map((item) => sanitizeAlertContextValue(item, depth + 1))
      .filter((item) => item !== undefined)
    return items.length > 0 ? { items } : null
  }

  if (typeof context !== 'object') {
    return null
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      continue
    }
    const next = sanitizeAlertContextValue(value, depth + 1)
    if (next !== undefined) {
      sanitized[key] = next
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null
}

function sanitizeAlertContextValue(value: unknown, depth: number): unknown | undefined {
  if (value == null) return value
  if (typeof value === 'string') {
    return sanitizeMcpText(value) ?? undefined
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    const nested = sanitizeAlertEventContext(value, depth)
    return nested ?? undefined
  }
  if (typeof value === 'object') {
    const nested = sanitizeAlertEventContext(value, depth)
    return nested ?? undefined
  }
  return undefined
}

type AlertEventLike = Pick<
  AlertEvent,
  | 'id'
  | 'alertRuleId'
  | 'queueName'
  | 'type'
  | 'status'
  | 'summary'
  | 'firedAt'
  | 'resolvedAt'
  | 'context'
> & { acknowledgedAt?: Date | null }

export function toMcpAlertEventSummary(event: AlertEventLike): McpAlertEventSummary {
  return {
    id: event.id,
    alertRuleId: event.alertRuleId,
    queueName: event.queueName,
    type: event.type,
    status: event.status,
    summary: sanitizeMcpText(event.summary) ?? '',
    firedAt: event.firedAt.toISOString(),
    resolvedAt: event.resolvedAt?.toISOString() ?? null,
    acknowledgedAt: toIsoString(event.acknowledgedAt ?? null),
    context: sanitizeAlertEventContext(event.context),
  }
}

/**
 * Delivery projection for MCP. The delivery `target` (email address or webhook URL) and raw
 * provider metadata are intentionally omitted; external identifiers and links are kept because
 * they point at the incident in the downstream tool (for example a Linear issue).
 */
export function toMcpAlertDeliverySummary(delivery: AlertDelivery) {
  return {
    id: delivery.id,
    channelType: delivery.channelType,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    lastError: sanitizeMcpText(delivery.lastError),
    externalIdentifier: delivery.externalIdentifier ?? null,
    externalUrl: delivery.externalUrl ?? null,
    nextRetryAt: toIsoString(delivery.nextRetryAt),
    updatedAt: toIsoString(delivery.updatedAt) ?? new Date(0).toISOString(),
  }
}

export function toMcpAlertEventDetail(
  event: AlertEvent,
  deliveries: AlertDelivery[]
): McpAlertEventDetail {
  return {
    ...toMcpAlertEventSummary(event),
    resolutionReason: event.linearResolutionReason ?? null,
    notificationSentAt: toIsoString(event.notificationSentAt),
    deliveries: deliveries.map((delivery) => toMcpAlertDeliverySummary(delivery)),
  }
}

export function computeAlertRuleState(rule: Pick<AlertRule, 'enabled' | 'mutedUntil'>) {
  if (!rule.enabled) return 'disabled' as const
  if (rule.mutedUntil && rule.mutedUntil.getTime() > Date.now()) return 'snoozed' as const
  return 'active' as const
}

const CHANNEL_KEYS_KEPT = new Set(['type', 'target', 'url', 'destinationId', 'teamId', 'projectId'])

/**
 * Notification channels reduced to routing identity only. Secrets, secret hints, label lists,
 * assignee/state ids, and any unknown keys are dropped.
 */
export function sanitizeNotificationChannelsForMcp(channels: unknown): unknown[] {
  if (!Array.isArray(channels)) return []
  return channels.flatMap((channel) => {
    if (typeof channel !== 'object' || channel === null || Array.isArray(channel)) return []
    const projected: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(channel as Record<string, unknown>)) {
      if (!CHANNEL_KEYS_KEPT.has(key)) continue
      if (typeof value !== 'string') continue
      projected[key] = sanitizeMcpText(value) ?? undefined
    }
    return typeof projected.type === 'string' ? [projected] : []
  })
}

export function toMcpAlertRuleSummary(
  rule: AlertRule,
  openEventCount: number
): McpAlertRuleSummary {
  return {
    id: rule.id,
    name: sanitizeMcpText(rule.name) ?? '',
    type: rule.type,
    state: computeAlertRuleState(rule),
    enabled: rule.enabled,
    mutedUntil: toIsoString(rule.mutedUntil),
    queueName: rule.queueName ?? null,
    queueFilterMode: rule.queueFilterMode ?? null,
    filterQueueNames: Array.isArray(rule.filterQueueNames) ? rule.filterQueueNames : [],
    cooldownMinutes: rule.cooldownMinutes,
    config: toRecord(rule.config),
    notificationChannels: sanitizeNotificationChannelsForMcp(rule.notificationChannels),
    openEventCount,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  }
}

export function toMcpScheduledJobSummary(summary: ScheduledJobSummary): McpScheduledJobSummary {
  return {
    schedulerId: summary.schedulerId,
    queueName: summary.queueName,
    jobName: summary.jobName,
    pattern: summary.pattern ?? null,
    everyMs: summary.every ?? null,
    timezone: summary.timezone ?? null,
    nextRunAt: toIsoString(summary.nextRun),
    startDate: toIsoString(summary.startDate),
    endDate: toIsoString(summary.endDate),
    limit: summary.limit ?? null,
    iterationCount: summary.iterationCount ?? null,
    recentFailedCount: summary.recentFailedCount,
    lastFailedAt: toIsoString(summary.lastFailedAt),
    data: summary.data,
    templateOptions: summary.templateOptions,
  }
}
