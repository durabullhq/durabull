import { z } from 'zod'
import type {
  AlertRuleMutationInput,
  AlertRuleRecord,
  AlertRuleType,
  QueueFilterMode,
} from '@/hooks/use-alerts'

const emailSchema = z.string().email()

export const REDIS_HEALTH_METRIC_OPTIONS = [
  {
    value: 'memory_usage_percent',
    label: 'Memory usage',
    description: 'Redis allocation as a percentage of its configured maxmemory limit.',
    unit: '%',
    defaultThreshold: '80',
  },
  {
    value: 'used_memory_megabytes',
    label: 'Memory allocated',
    description: 'Memory allocated by Redis, useful when maxmemory is not configured.',
    unit: ' MiB',
    defaultThreshold: '1024',
  },
  {
    value: 'resident_memory_megabytes',
    label: 'Resident memory',
    description: 'Physical memory currently occupied by the Redis process.',
    unit: ' MiB',
    defaultThreshold: '1024',
  },
  {
    value: 'cpu_usage_percent',
    label: 'CPU usage',
    description: 'Process CPU consumed between consecutive INFO samples.',
    unit: '%',
    defaultThreshold: '80',
  },
  {
    value: 'memory_fragmentation_ratio',
    label: 'Allocator fragmentation',
    description: 'Allocator overhead ratio; tiny byte overheads are ignored to reduce noise.',
    unit: '×',
    defaultThreshold: '1.5',
  },
  {
    value: 'connected_clients_percent',
    label: 'Client capacity',
    description: 'Connected clients as a percentage of the configured maxclients limit.',
    unit: '%',
    defaultThreshold: '80',
  },
  {
    value: 'blocked_clients',
    label: 'Blocked clients',
    description: 'Clients waiting on blocking Redis operations.',
    unit: 'clients',
    defaultThreshold: '10',
  },
  {
    value: 'evicted_keys_per_minute',
    label: 'Key evictions',
    description: 'Keys evicted because Redis reached its maxmemory limit.',
    unit: 'keys/min',
    defaultThreshold: '1',
  },
  {
    value: 'rejected_connections_per_minute',
    label: 'Rejected connections',
    description: 'Connections rejected because Redis reached maxclients.',
    unit: 'connections/min',
    defaultThreshold: '1',
  },
] as const

export type RedisHealthMetric = (typeof REDIS_HEALTH_METRIC_OPTIONS)[number]['value']

function isRedisHealthMetric(value: unknown): value is RedisHealthMetric {
  return REDIS_HEALTH_METRIC_OPTIONS.some((option) => option.value === value)
}

export interface NotificationRouteDraft {
  id: string
  type: 'email' | 'linear' | 'webhook' | 'destination'
  target: string
  destinationId?: string
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
  redisHealthMetric: RedisHealthMetric
  redisHealthThreshold: string
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
    redisHealthMetric: isRedisHealthMetric(config.metric) ? config.metric : 'memory_usage_percent',
    redisHealthThreshold: stringifyNumber(config.threshold, 80),
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
    if (channel.type === 'destination' && typeof channel.destinationId === 'string') {
      return [createDestinationNotificationRouteDraft(index + 1, channel.destinationId)]
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

export function createDestinationNotificationRouteDraft(
  sequence = 0,
  destinationId = ''
): NotificationRouteDraft {
  return {
    id:
      sequence > 0
        ? `destination-route-${sequence}`
        : `destination-route-${Math.random().toString(36).slice(2, 10)}`,
    type: 'destination',
    target: destinationId,
    destinationId,
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

export type AlertRuleDraftField =
  | 'name'
  | 'cooldownMinutes'
  | 'queues'
  | 'type'
  | 'failureThresholdCount'
  | 'failureThresholdWindowMinutes'
  | 'failureRatePercent'
  | 'failureRateWindowMinutes'
  | 'failureRateMinSample'
  | 'stalledMinutes'
  | 'jobFailedMaxIssuesPerPoll'
  | 'redisHealthThreshold'
  | 'routes'
  | `route:${string}`

/**
 * Per-field validation. Insertion order mirrors the historical check order in
 * `validateAlertRuleDraft` so "first map value" stays the same first error.
 */
export function validateAlertRuleDraftFields(
  draft: AlertRuleDraft
): Partial<Record<AlertRuleDraftField, string>> {
  const errors: Partial<Record<AlertRuleDraftField, string>> = {}
  const setError = (field: AlertRuleDraftField, message: string) => {
    if (errors[field] === undefined) {
      errors[field] = message
    }
  }

  if (!draft.name.trim()) {
    setError('name', 'Rule name is required.')
  }

  const cooldownMinutes = parseWholeNumber(draft.cooldownMinutes)
  if (!cooldownMinutes || cooldownMinutes < 1 || cooldownMinutes > 1440) {
    setError('cooldownMinutes', 'Cooldown must be a whole number between 1 and 1440 minutes.')
  }

  const selectedQueueNames = normalizeQueueNames(draft.selectedQueueNames)
  if (
    draft.type !== 'redis_health' &&
    draft.queueFilterMode === 'include' &&
    selectedQueueNames.length === 0
  ) {
    setError('queues', 'Choose at least one queue or switch to "all except" mode.')
  }

  const emailRoutes = draft.notificationRoutes.filter((route) => route.type === 'email')
  const notificationEmails = normalizeNotificationEmails(emailRoutes.map((route) => route.target))
  if (notificationEmails.length > 10 && emailRoutes[0]) {
    setError(
      `route:${emailRoutes[0].id}`,
      'You can configure up to 10 notification email recipients.'
    )
  }

  for (const route of emailRoutes) {
    const email = route.target.trim()
    if (!email) continue
    const result = emailSchema.safeParse(email)
    if (!result.success) {
      setError(`route:${route.id}`, `Invalid notification email: ${email}`)
    }
  }

  for (const route of draft.notificationRoutes.filter((item) => item.type === 'linear')) {
    if (route.priority?.trim()) {
      const priority = parseWholeNumber(route.priority)
      if (priority === null || priority < 0 || priority > 4) {
        setError(`route:${route.id}`, 'Linear priority must be a whole number between 0 and 4.')
      }
    }
  }

  for (const route of draft.notificationRoutes.filter((item) => item.type === 'webhook')) {
    if (route.webhookMode === 'saved') {
      if (!route.webhookDestinationId?.trim()) {
        setError(`route:${route.id}`, 'Choose a saved webhook destination.')
      }
      continue
    }

    const url = route.webhookUrl?.trim() ?? route.target.trim()
    if (!url) {
      setError(`route:${route.id}`, 'Webhook URL is required.')
      continue
    }
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        setError(`route:${route.id}`, 'Webhook URL must use HTTP or HTTPS.')
        continue
      }
    } catch {
      setError(`route:${route.id}`, `Invalid webhook URL: ${url}`)
      continue
    }
    const secret = route.webhookSecret?.trim()
    if (secret && secret.length < 16) {
      setError(
        `route:${route.id}`,
        'Webhook signing secret must be at least 16 characters when provided.'
      )
    }
  }

  const routedDestinationIds = new Set<string>()
  for (const route of draft.notificationRoutes) {
    const destinationId =
      route.type === 'destination'
        ? route.destinationId?.trim()
        : route.type === 'webhook' && route.webhookMode === 'saved'
          ? route.webhookDestinationId?.trim()
          : undefined

    if (route.type === 'destination' && !destinationId) {
      setError(`route:${route.id}`, 'Choose a saved destination.')
      continue
    }
    if (!destinationId) continue
    if (routedDestinationIds.has(destinationId)) {
      setError(`route:${route.id}`, 'This destination is already routed on this rule.')
      continue
    }
    routedDestinationIds.add(destinationId)
  }

  // Keyed to a route-type-agnostic field: the first route may be a saved
  // destination handled by the multi-select, which has no inline error row.
  if (draft.notificationRoutes.length > 10) {
    setError('routes', 'You can configure up to 10 notification destinations.')
  }

  switch (draft.type) {
    case 'failure_threshold': {
      const count = parseWholeNumber(draft.failureThresholdCount)
      const windowMinutes = parseWholeNumber(draft.failureThresholdWindowMinutes)
      if (!count || count < 1 || count > 10000) {
        setError(
          'failureThresholdCount',
          'Failure threshold count must be a whole number between 1 and 10000.'
        )
      }
      if (!windowMinutes || windowMinutes < 1 || windowMinutes > 1440) {
        setError(
          'failureThresholdWindowMinutes',
          'Failure threshold window must be between 1 and 1440 minutes.'
        )
      }
      break
    }
    case 'failure_rate': {
      const ratePercent = Number(draft.failureRatePercent)
      const windowMinutes = parseWholeNumber(draft.failureRateWindowMinutes)
      const minSample = parseWholeNumber(draft.failureRateMinSample)
      if (!Number.isFinite(ratePercent) || ratePercent < 1 || ratePercent > 100) {
        setError('failureRatePercent', 'Failure rate must be between 1 and 100 percent.')
      }
      if (!windowMinutes || windowMinutes < 1 || windowMinutes > 1440) {
        setError(
          'failureRateWindowMinutes',
          'Failure rate window must be between 1 and 1440 minutes.'
        )
      }
      if (!minSample || minSample < 1 || minSample > 100000) {
        setError(
          'failureRateMinSample',
          'Minimum sample must be a whole number between 1 and 100000.'
        )
      }
      break
    }
    case 'queue_stalled': {
      const stalledMinutes = parseWholeNumber(draft.stalledMinutes)
      if (!stalledMinutes || stalledMinutes < 1 || stalledMinutes > 1440) {
        setError(
          'stalledMinutes',
          'Stalled window must be a whole number between 1 and 1440 minutes.'
        )
      }
      break
    }
    case 'job_failed': {
      const maxIssuesPerPoll = parseWholeNumber(draft.jobFailedMaxIssuesPerPoll)
      if (!maxIssuesPerPoll || maxIssuesPerPoll < 1 || maxIssuesPerPoll > 500) {
        setError(
          'jobFailedMaxIssuesPerPoll',
          'Max Linear issues per poll must be a whole number between 1 and 500.'
        )
      }
      break
    }
    case 'redis_health': {
      const threshold = Number(draft.redisHealthThreshold)
      const isFinitePositive = Number.isFinite(threshold) && threshold > 0
      switch (draft.redisHealthMetric) {
        case 'memory_usage_percent':
          if (!isFinitePositive || threshold < 0.1 || threshold > 100) {
            setError(
              'redisHealthThreshold',
              'Memory usage threshold must be between 0.1 and 100 percent.'
            )
          }
          break
        case 'used_memory_megabytes':
        case 'resident_memory_megabytes':
          if (!isFinitePositive || threshold > 1_000_000_000) {
            setError(
              'redisHealthThreshold',
              'Memory threshold must be greater than zero and no more than 1000000000 MiB.'
            )
          }
          break
        case 'cpu_usage_percent':
          if (!isFinitePositive || threshold < 0.1 || threshold > 1000) {
            setError(
              'redisHealthThreshold',
              'CPU usage threshold must be between 0.1 and 1000 percent.'
            )
          }
          break
        case 'memory_fragmentation_ratio':
          if (!isFinitePositive || threshold < 1 || threshold > 100) {
            setError('redisHealthThreshold', 'Fragmentation threshold must be between 1 and 100.')
          }
          break
        case 'connected_clients_percent':
          if (!isFinitePositive || threshold < 0.1 || threshold > 100) {
            setError(
              'redisHealthThreshold',
              'Client capacity threshold must be between 0.1 and 100 percent.'
            )
          }
          break
        case 'blocked_clients':
          if (!Number.isInteger(threshold) || threshold < 1 || threshold > 1_000_000) {
            setError(
              'redisHealthThreshold',
              'Blocked clients threshold must be a whole number between 1 and 1000000.'
            )
          }
          break
        case 'evicted_keys_per_minute':
        case 'rejected_connections_per_minute':
          if (!isFinitePositive || threshold > 1_000_000_000) {
            setError(
              'redisHealthThreshold',
              'Rate threshold must be greater than zero and no more than 1000000000.'
            )
          }
          break
      }
      break
    }
    default:
      setError('type', 'Unsupported alert type.')
  }

  return errors
}

export function validateAlertRuleDraft(draft: AlertRuleDraft): string | null {
  for (const message of Object.values(validateAlertRuleDraftFields(draft))) {
    if (message) return message
  }
  return null
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
    ...draft.notificationRoutes
      .filter((route) => route.type === 'destination')
      .map((route) => ({
        type: 'destination' as const,
        destinationId: route.destinationId?.trim() ?? route.target.trim(),
      })),
  ]
  const config = buildAlertRuleConfig(type, draft)
  const cooldownMinutes = parseWholeNumber(draft.cooldownMinutes) ?? 30

  return {
    name: baseName,
    type,
    queueName: null,
    queueFilterMode: type === 'redis_health' ? null : draft.queueFilterMode,
    filterQueueNames: type === 'redis_health' ? [] : normalizeQueueNames(draft.selectedQueueNames),
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
    case 'redis_health':
      return {
        metric: draft.redisHealthMetric,
        threshold: Number(draft.redisHealthThreshold) || 80,
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

/** Stable DOM ids for the builder panels; sentence tokens scroll/focus these. */
export const ALERT_RULE_PANEL_IDS = {
  template: 'rule-panel-template',
  condition: 'rule-panel-condition',
  queues: 'rule-panel-queues',
  notify: 'rule-panel-notify',
  name: 'rule-panel-name',
  advanced: 'rule-panel-advanced',
} as const

export interface SentenceToken {
  key: 'queues' | 'condition' | 'routes' | 'cooldown'
  label: string
  set: boolean
  invalid?: boolean
  targetId: string
}

function displayValue(value: string): string {
  const trimmed = value.trim()
  return trimmed ? trimmed : '?'
}

function buildConditionFragment(draft: AlertRuleDraft): string {
  switch (draft.type) {
    case 'failure_threshold':
      return `≥ ${displayValue(draft.failureThresholdCount)} new failures within ${displayValue(draft.failureThresholdWindowMinutes)} min`
    case 'failure_rate':
      return `failure rate ≥ ${displayValue(draft.failureRatePercent)}% over ${displayValue(draft.failureRateWindowMinutes)} min (min ${displayValue(draft.failureRateMinSample)} jobs)`
    case 'queue_stalled':
      return `no completions for ${displayValue(draft.stalledMinutes)} min while jobs wait`
    case 'job_failed':
      return 'any job failure (one Linear issue per job)'
    case 'redis_health': {
      const metric = REDIS_HEALTH_METRIC_OPTIONS.find(
        (option) => option.value === draft.redisHealthMetric
      )
      return `${metric?.label.toLowerCase() ?? 'Redis metric'} ≥ ${displayValue(draft.redisHealthThreshold)}${metric?.unit ?? ''}`
    }
    default:
      return 'an unsupported condition'
  }
}

const CONDITION_FIELDS: Record<AlertRuleType, AlertRuleDraftField[]> = {
  failure_threshold: ['failureThresholdCount', 'failureThresholdWindowMinutes'],
  failure_rate: ['failureRatePercent', 'failureRateWindowMinutes', 'failureRateMinSample'],
  queue_stalled: ['stalledMinutes'],
  job_failed: ['jobFailedMaxIssuesPerPoll'],
  redis_health: ['redisHealthThreshold'],
}

/**
 * Pure sentence-model for the builder: "When [queues] records [condition],
 * notify [routes] — [cooldown]." Pass the org destinations so saved-destination
 * routes read by name instead of by count.
 */
export function buildSentenceTokens(
  draft: AlertRuleDraft,
  destinations?: Array<{ id: string; name: string }>
): SentenceToken[] {
  const errors = validateAlertRuleDraftFields(draft)
  const selectedQueueNames = normalizeQueueNames(draft.selectedQueueNames)

  let queuesLabel: string
  let queuesSet = true
  if (draft.type === 'redis_health') {
    queuesLabel = 'Redis server'
  } else if (draft.queueFilterMode === 'exclude') {
    queuesLabel =
      selectedQueueNames.length === 0
        ? 'all queues'
        : `all queues except ${selectedQueueNames.length}`
  } else if (selectedQueueNames.length === 0) {
    queuesLabel = 'choose queues'
    queuesSet = false
  } else if (selectedQueueNames.length <= 2) {
    queuesLabel = selectedQueueNames.join(', ')
  } else {
    queuesLabel = `${selectedQueueNames.length} queues`
  }

  const conditionInvalid = (CONDITION_FIELDS[draft.type] ?? []).some(
    (field) => errors[field] !== undefined
  )

  const emailCount = normalizeNotificationEmails(
    draft.notificationRoutes.filter((route) => route.type === 'email').map((route) => route.target)
  ).length
  const linearCount = draft.notificationRoutes.filter((route) => route.type === 'linear').length
  const webhookCount = draft.notificationRoutes.filter((route) => {
    if (route.type !== 'webhook') return false
    if (route.webhookMode === 'saved') return Boolean(route.webhookDestinationId?.trim())
    return Boolean((route.webhookUrl ?? route.target).trim())
  }).length

  const destinationRouteIds = draft.notificationRoutes
    .filter((route) => route.type === 'destination')
    .map((route) => (route.destinationId ?? route.target).trim())
    .filter(Boolean)
  const destinationNames = destinationRouteIds.map(
    (destinationId) =>
      destinations?.find((destination) => destination.id === destinationId)?.name ?? null
  )
  const destinationPart =
    destinationRouteIds.length === 0
      ? null
      : destinationRouteIds.length <= 2 &&
          destinationNames.every((name): name is string => name !== null)
        ? destinationNames.join(', ')
        : `${destinationRouteIds.length} destination${destinationRouteIds.length === 1 ? '' : 's'}`

  const routeParts = [
    destinationPart,
    emailCount > 0 ? `${emailCount} email${emailCount === 1 ? '' : 's'}` : null,
    linearCount > 0 ? 'Linear' : null,
    webhookCount > 0 ? `${webhookCount} webhook${webhookCount === 1 ? '' : 's'}` : null,
  ].filter((part): part is string => part !== null)
  const routesSet = routeParts.length > 0
  const routesInvalid = Object.keys(errors).some((field) => field.startsWith('route:'))

  return [
    {
      key: 'queues',
      label: queuesLabel,
      set: queuesSet,
      invalid: queuesSet && errors.queues !== undefined,
      targetId: ALERT_RULE_PANEL_IDS.queues,
    },
    {
      key: 'condition',
      label: buildConditionFragment(draft),
      set: true,
      invalid: conditionInvalid,
      targetId: ALERT_RULE_PANEL_IDS.condition,
    },
    {
      key: 'routes',
      label: routesSet ? routeParts.join(' + ') : 'add destinations',
      set: routesSet,
      invalid: routesInvalid,
      targetId: ALERT_RULE_PANEL_IDS.notify,
    },
    {
      key: 'cooldown',
      label: `at most once every ${displayValue(draft.cooldownMinutes)} min`,
      set: true,
      invalid: errors.cooldownMinutes !== undefined,
      targetId: ALERT_RULE_PANEL_IDS.advanced,
    },
  ]
}

export interface AlertRuleTemplate {
  key: 'failure-spike' | 'error-rate' | 'stalled' | 'redis-memory' | 'linear-triage'
  name: string
  description: string
  type: AlertRuleType
  apply: (base: AlertRuleDraft, options?: { linearIntegrationValid?: boolean }) => AlertRuleDraft
}

export const ALERT_RULE_TEMPLATES: AlertRuleTemplate[] = [
  {
    key: 'failure-spike',
    name: 'Failure spike',
    description: 'Open an incident when 25 new failures land within 5 minutes on any queue.',
    type: 'failure_threshold',
    apply: (base) => ({
      ...base,
      type: 'failure_threshold',
      failureThresholdCount: '25',
      failureThresholdWindowMinutes: '5',
      cooldownMinutes: '30',
      queueFilterMode: 'exclude',
      selectedQueueNames: [],
    }),
  },
  {
    key: 'error-rate',
    name: 'Elevated error rate',
    description: 'Fire when the failure rate exceeds 10% over 15 minutes with at least 250 jobs.',
    type: 'failure_rate',
    apply: (base) => ({
      ...base,
      type: 'failure_rate',
      failureRatePercent: '10',
      failureRateWindowMinutes: '15',
      failureRateMinSample: '250',
      cooldownMinutes: '60',
      queueFilterMode: 'exclude',
      selectedQueueNames: [],
    }),
  },
  {
    key: 'stalled',
    name: 'Queue stalled',
    description: 'Detect queues where jobs keep waiting but completions stop for 10 minutes.',
    type: 'queue_stalled',
    apply: (base) => ({
      ...base,
      type: 'queue_stalled',
      stalledMinutes: '10',
      cooldownMinutes: '30',
      queueFilterMode: 'exclude',
      selectedQueueNames: [],
    }),
  },
  {
    key: 'redis-memory',
    name: 'Redis memory pressure',
    description: 'Alert when Redis consumes at least 80% of its configured memory capacity.',
    type: 'redis_health',
    apply: (base) => ({
      ...base,
      type: 'redis_health',
      redisHealthMetric: 'memory_usage_percent',
      redisHealthThreshold: '80',
      cooldownMinutes: '30',
      selectedQueueNames: [],
    }),
  },
  {
    key: 'linear-triage',
    name: 'Linear issue per failed job',
    description: 'Create one deduplicated Linear issue for every failed job for follow-up.',
    type: 'job_failed',
    apply: (base, options) => ({
      ...base,
      type: 'job_failed',
      jobFailedMaxIssuesPerPoll: '100',
      cooldownMinutes: '30',
      queueFilterMode: 'exclude',
      selectedQueueNames: [],
      notificationRoutes: options?.linearIntegrationValid
        ? [createLinearNotificationRouteDraft(1)]
        : base.notificationRoutes,
    }),
  },
]

export function getAlertRuleTemplate(key: string | undefined): AlertRuleTemplate | null {
  if (!key) return null
  return ALERT_RULE_TEMPLATES.find((template) => template.key === key) ?? null
}
