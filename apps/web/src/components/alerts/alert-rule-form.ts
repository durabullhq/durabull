import { z } from 'zod'
import type {
  AlertRuleMutationInput,
  AlertRuleRecord,
  AlertRuleType,
  QueueFilterMode,
} from '@/hooks/use-alerts'

const emailSchema = z.string().email()

export interface NotificationRouteDraft {
  id: string
  type: 'email' | 'linear' | 'webhook'
  target: string
  teamId?: string
  projectId?: string
  labelIds?: string[]
  assigneeId?: string
  stateId?: string
  priority?: string
  webhookMode?: 'saved' | 'custom'
  webhookDestinationId?: string
  webhookUrl?: string
  webhookSecret?: string
  secretConfigured?: boolean
  secretLast4?: string
}

export interface AlertRuleDraft {
  name: string
  queueFilterMode: QueueFilterMode
  selectedQueueNames: string[]
  type: AlertRuleType
  enabled: boolean
  cooldownMinutes: string
  notificationRoutes: NotificationRouteDraft[]
  failureThresholdCount: string
  failureThresholdWindowMinutes: string
  failureRatePercent: string
  failureRateWindowMinutes: string
  failureRateMinSample: string
  stalledMinutes: string
  jobFailedMaxIssuesPerPoll: string
}

export function createAlertRuleDraft(rule?: AlertRuleRecord | null): AlertRuleDraft {
  const config = (rule?.config ?? {}) as Record<string, unknown>

  let queueFilterMode: QueueFilterMode = 'include'
  let selectedQueueNames: string[] = []

  if (rule) {
    const filterList = (rule.filterQueueNames ?? []).filter((n) => n.trim().length > 0)
    if (rule.queueFilterMode === 'exclude') {
      queueFilterMode = 'exclude'
      selectedQueueNames = filterList
    } else {
      queueFilterMode = 'include'
      selectedQueueNames =
        filterList.length > 0 ? filterList : rule.queueName?.trim() ? [rule.queueName.trim()] : []
    }
  }

  return {
    name: rule?.name ?? '',
    queueFilterMode,
    selectedQueueNames,
    type: rule?.type ?? 'failure_threshold',
    enabled: rule?.enabled ?? true,
    cooldownMinutes: String(rule?.cooldownMinutes ?? 30),
    notificationRoutes: extractNotificationRoutes(rule),
    failureThresholdCount: stringifyNumber(config.count, 25),
    failureThresholdWindowMinutes: stringifyNumber(config.windowMinutes, 5),
    failureRatePercent: stringifyRatePercent(config.rate, 10),
    failureRateWindowMinutes: stringifyNumber(config.windowMinutes, 15),
    failureRateMinSample: stringifyNumber(config.minSample, 100),
    stalledMinutes: stringifyNumber(config.stalledMinutes, 10),
    jobFailedMaxIssuesPerPoll: stringifyNumber(config.maxIssuesPerPoll, 100),
  }
}

function extractNotificationRoutes(rule?: AlertRuleRecord | null): NotificationRouteDraft[] {
  if (!rule?.notificationChannels || !Array.isArray(rule.notificationChannels)) {
    return [createNotificationRouteDraft()]
  }

  const routes = rule.notificationChannels.flatMap((channel, index) => {
    if (channel.type === 'email' && typeof channel.target === 'string') {
      return [createNotificationRouteDraft(index + 1, channel.target)]
    }
    if (channel.type === 'linear') {
      return [
        {
          id: `linear-route-${index + 1}`,
          type: 'linear' as const,
          target: 'org-default',
          teamId: channel.teamId,
          projectId: channel.projectId,
          labelIds: channel.labelIds ?? [],
          assigneeId: channel.assigneeId,
          stateId: channel.stateId,
          priority: channel.priority !== undefined ? String(channel.priority) : '',
        },
      ]
    }
    if (channel.type === 'webhook' && 'url' in channel && typeof channel.url === 'string') {
      return [
        createWebhookNotificationRouteDraft(index + 1, channel.url, {
          secretConfigured: channel.secretConfigured === true,
          secretLast4: channel.secretLast4,
        }),
      ]
    }
    if (
      channel.type === 'webhook' &&
      'destinationId' in channel &&
      typeof channel.destinationId === 'string'
    ) {
      return [createSavedWebhookNotificationRouteDraft(index + 1, channel.destinationId)]
    }
    return []
  })

  return routes.length > 0 ? routes : [createNotificationRouteDraft()]
}

export function createNotificationRouteDraft(sequence = 0, target = ''): NotificationRouteDraft {
  return {
    id:
      sequence > 0
        ? `email-route-${sequence}`
        : `email-route-${Math.random().toString(36).slice(2, 10)}`,
    type: 'email',
    target,
  }
}

export function createWebhookNotificationRouteDraft(
  sequence = 0,
  webhookUrl = '',
  options?: { secretConfigured?: boolean; secretLast4?: string }
): NotificationRouteDraft {
  return {
    id:
      sequence > 0
        ? `webhook-route-${sequence}`
        : `webhook-route-${Math.random().toString(36).slice(2, 10)}`,
    type: 'webhook',
    target: webhookUrl,
    webhookMode: 'custom',
    webhookUrl,
    secretConfigured: options?.secretConfigured,
    secretLast4: options?.secretLast4,
  }
}

export function createSavedWebhookNotificationRouteDraft(
  sequence = 0,
  destinationId = ''
): NotificationRouteDraft {
  return {
    id:
      sequence > 0
        ? `webhook-destination-route-${sequence}`
        : `webhook-destination-route-${Math.random().toString(36).slice(2, 10)}`,
    type: 'webhook',
    target: destinationId,
    webhookMode: 'saved',
    webhookDestinationId: destinationId,
  }
}

export function createLinearNotificationRouteDraft(sequence = 0): NotificationRouteDraft {
  return {
    id:
      sequence > 0
        ? `linear-route-${sequence}`
        : `linear-route-${Math.random().toString(36).slice(2, 10)}`,
    type: 'linear',
    target: 'org-default',
    labelIds: [],
    priority: '',
  }
}

function stringifyNumber(value: unknown, fallback: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return String(fallback)
}

function stringifyRatePercent(value: unknown, fallbackPercent: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.round(value * 1000) / 10)
  }

  return String(fallbackPercent)
}

export function validateAlertRuleDraft(draft: AlertRuleDraft): string | null {
  if (!draft.name.trim()) {
    return 'Rule name is required.'
  }

  const cooldownMinutes = parseWholeNumber(draft.cooldownMinutes)
  if (!cooldownMinutes || cooldownMinutes < 1 || cooldownMinutes > 1440) {
    return 'Cooldown must be a whole number between 1 and 1440 minutes.'
  }

  const selectedQueueNames = normalizeQueueNames(draft.selectedQueueNames)
  if (draft.queueFilterMode === 'include' && selectedQueueNames.length === 0) {
    return 'Choose at least one queue or switch to "all except" mode.'
  }

  const emailRoutes = draft.notificationRoutes.filter((route) => route.type === 'email')
  const notificationEmails = normalizeNotificationEmails(emailRoutes.map((route) => route.target))
  if (notificationEmails.length > 10) {
    return 'You can configure up to 10 notification email recipients.'
  }

  for (const email of notificationEmails) {
    const result = emailSchema.safeParse(email)
    if (!result.success) {
      return `Invalid notification email: ${email}`
    }
  }

  for (const route of draft.notificationRoutes.filter((item) => item.type === 'linear')) {
    if (route.priority?.trim()) {
      const priority = parseWholeNumber(route.priority)
      if (priority === null || priority < 0 || priority > 4) {
        return 'Linear priority must be a whole number between 0 and 4.'
      }
    }
  }

  for (const route of draft.notificationRoutes.filter((item) => item.type === 'webhook')) {
    if (route.webhookMode === 'saved') {
      if (!route.webhookDestinationId?.trim()) {
        return 'Choose a saved webhook destination.'
      }
      continue
    }

    const url = route.webhookUrl?.trim() ?? route.target.trim()
    if (!url) {
      return 'Webhook URL is required.'
    }
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return 'Webhook URL must use HTTP or HTTPS.'
      }
    } catch {
      return `Invalid webhook URL: ${url}`
    }
    const secret = route.webhookSecret?.trim()
    if (secret && secret.length < 16) {
      return 'Webhook signing secret must be at least 16 characters when provided.'
    }
  }

  if (draft.notificationRoutes.length > 10) {
    return 'You can configure up to 10 notification destinations.'
  }

  switch (draft.type) {
    case 'failure_threshold': {
      const count = parseWholeNumber(draft.failureThresholdCount)
      const windowMinutes = parseWholeNumber(draft.failureThresholdWindowMinutes)
      if (!count || count < 1 || count > 10000) {
        return 'Failure threshold count must be a whole number between 1 and 10000.'
      }
      if (!windowMinutes || windowMinutes < 1 || windowMinutes > 1440) {
        return 'Failure threshold window must be between 1 and 1440 minutes.'
      }
      return null
    }
    case 'failure_rate': {
      const ratePercent = Number(draft.failureRatePercent)
      const windowMinutes = parseWholeNumber(draft.failureRateWindowMinutes)
      const minSample = parseWholeNumber(draft.failureRateMinSample)
      if (!Number.isFinite(ratePercent) || ratePercent < 1 || ratePercent > 100) {
        return 'Failure rate must be between 1 and 100 percent.'
      }
      if (!windowMinutes || windowMinutes < 1 || windowMinutes > 1440) {
        return 'Failure rate window must be between 1 and 1440 minutes.'
      }
      if (!minSample || minSample < 1 || minSample > 100000) {
        return 'Minimum sample must be a whole number between 1 and 100000.'
      }
      return null
    }
    case 'queue_stalled': {
      const stalledMinutes = parseWholeNumber(draft.stalledMinutes)
      if (!stalledMinutes || stalledMinutes < 1 || stalledMinutes > 1440) {
        return 'Stalled window must be a whole number between 1 and 1440 minutes.'
      }
      return null
    }
    case 'job_failed': {
      const maxIssuesPerPoll = parseWholeNumber(draft.jobFailedMaxIssuesPerPoll)
      if (!maxIssuesPerPoll || maxIssuesPerPoll < 1 || maxIssuesPerPoll > 500) {
        return 'Max Linear issues per poll must be a whole number between 1 and 500.'
      }
      return null
    }
    default:
      return 'Unsupported alert type.'
  }
}

function trimOrUndefined(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function trimStringArray(values?: string[]): string[] {
  return values?.map((value) => value.trim()).filter(Boolean) ?? []
}

export function serializeAlertRuleDraft(draft: AlertRuleDraft): AlertRuleMutationInput {
  const type = draft.type
  const baseName = draft.name.trim()
  const notificationChannels = [
    ...normalizeNotificationEmails(
      draft.notificationRoutes
        .filter((route) => route.type === 'email')
        .map((route) => route.target)
    ).map((target) => ({
      type: 'email' as const,
      target,
    })),
    ...draft.notificationRoutes
      .filter((route) => route.type === 'linear')
      .map((route) => ({
        type: 'linear' as const,
        target: 'org-default' as const,
        ...(trimOrUndefined(route.teamId) ? { teamId: trimOrUndefined(route.teamId) } : {}),
        ...(trimOrUndefined(route.projectId)
          ? { projectId: trimOrUndefined(route.projectId) }
          : {}),
        ...(trimStringArray(route.labelIds).length
          ? { labelIds: trimStringArray(route.labelIds) }
          : {}),
        ...(trimOrUndefined(route.assigneeId)
          ? { assigneeId: trimOrUndefined(route.assigneeId) }
          : {}),
        ...(trimOrUndefined(route.stateId) ? { stateId: trimOrUndefined(route.stateId) } : {}),
        ...(route.priority?.trim()
          ? { priority: parseWholeNumber(route.priority) ?? undefined }
          : {}),
      })),
    ...draft.notificationRoutes
      .filter((route) => route.type === 'webhook')
      .map((route) => {
        if (route.webhookMode === 'saved') {
          return {
            type: 'webhook' as const,
            destinationId: route.webhookDestinationId?.trim() ?? route.target.trim(),
          }
        }

        const url = route.webhookUrl?.trim() ?? route.target.trim()
        const secret = route.webhookSecret?.trim()
        return {
          type: 'webhook' as const,
          url,
          ...(secret ? { secret } : {}),
        }
      }),
  ]
  const config = buildAlertRuleConfig(type, draft)
  const cooldownMinutes = parseWholeNumber(draft.cooldownMinutes) ?? 30

  return {
    name: baseName,
    type,
    queueName: null,
    queueFilterMode: draft.queueFilterMode,
    filterQueueNames: normalizeQueueNames(draft.selectedQueueNames),
    enabled: draft.enabled,
    cooldownMinutes,
    notificationChannels,
    config,
  }
}

export function serializeAlertRuleDraftsForMode(
  draft: AlertRuleDraft,
  mode: 'create' | 'edit'
): AlertRuleMutationInput[] {
  const input = serializeAlertRuleDraft(draft)
  const filterQueueNames = input.filterQueueNames ?? []

  if (mode !== 'create') {
    return [input]
  }

  if (input.queueFilterMode !== 'include' || filterQueueNames.length <= 1) {
    return [input]
  }

  return filterQueueNames.map((queueName) => ({
    ...input,
    filterQueueNames: [queueName],
  }))
}

function buildAlertRuleConfig(type: AlertRuleType, draft: AlertRuleDraft): Record<string, unknown> {
  switch (type) {
    case 'failure_threshold':
      return {
        count: parseWholeNumber(draft.failureThresholdCount) ?? 25,
        windowMinutes: parseWholeNumber(draft.failureThresholdWindowMinutes) ?? 5,
      }
    case 'failure_rate':
      return {
        rate: (Number(draft.failureRatePercent) || 10) / 100,
        windowMinutes: parseWholeNumber(draft.failureRateWindowMinutes) ?? 15,
        minSample: parseWholeNumber(draft.failureRateMinSample) ?? 100,
      }
    case 'queue_stalled':
      return {
        stalledMinutes: parseWholeNumber(draft.stalledMinutes) ?? 10,
      }
    case 'job_failed':
      return {
        maxIssuesPerPoll: parseWholeNumber(draft.jobFailedMaxIssuesPerPoll) ?? 100,
      }
    default:
      return {}
  }
}

export function normalizeNotificationEmails(emails: string[]): string[] {
  return Array.from(new Set(emails.map((email) => email.trim()).filter(Boolean)))
}

export function normalizeQueueNames(queueNames: string[]): string[] {
  return Array.from(new Set(queueNames.map((queueName) => queueName.trim()).filter(Boolean)))
}

function parseWholeNumber(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}
