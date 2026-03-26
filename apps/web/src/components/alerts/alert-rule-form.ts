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
  type: 'email'
  target: string
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
  }
}

function extractNotificationRoutes(rule?: AlertRuleRecord | null): NotificationRouteDraft[] {
  if (!rule?.notificationChannels || !Array.isArray(rule.notificationChannels)) {
    return [createNotificationRouteDraft()]
  }

  const emails = rule.notificationChannels
    .map((channel) => (typeof channel.target === 'string' ? channel.target : ''))
    .filter(Boolean)

  return emails.length > 0
    ? emails.map((email, index) => createNotificationRouteDraft(index + 1, email))
    : [createNotificationRouteDraft()]
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

  const notificationEmails = normalizeNotificationEmails(
    draft.notificationRoutes.map((route) => route.target)
  )
  if (notificationEmails.length > 10) {
    return 'You can configure up to 10 notification email recipients.'
  }

  for (const email of notificationEmails) {
    const result = emailSchema.safeParse(email)
    if (!result.success) {
      return `Invalid notification email: ${email}`
    }
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
    default:
      return 'Unsupported alert type.'
  }
}

export function serializeAlertRuleDraft(draft: AlertRuleDraft): AlertRuleMutationInput {
  const type = draft.type
  const baseName = draft.name.trim()
  const notificationChannels = normalizeNotificationEmails(
    draft.notificationRoutes.map((route) => route.target)
  ).map((target) => ({
    type: 'email' as const,
    target,
  }))
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
