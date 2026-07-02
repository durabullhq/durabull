import type { QueryClient } from '@tanstack/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useActiveOrganization } from '@/hooks/use-organization'
import { api, handleRes, type InferResponseType } from '@/lib/api'

type ConnectionAlertsEndpoint = (typeof api.c)[':connectionId']['alerts']

type AlertSummaryResponse = InferResponseType<(typeof api.alerts.summary)['$get'], 200>
type GlobalAlertEventsResponse = InferResponseType<(typeof api.alerts.events)['$get'], 200>
type ConnectionAlertRulesResponse = InferResponseType<
  ConnectionAlertsEndpoint['rules']['$get'],
  200
>
type ConnectionAlertEventsResponse = InferResponseType<
  ConnectionAlertsEndpoint['events']['$get'],
  200
>
type CreateAlertRuleResponse = InferResponseType<ConnectionAlertsEndpoint['rules']['$post'], 201>
type UpdateAlertRuleResponse = InferResponseType<
  ConnectionAlertsEndpoint['rules'][':ruleId']['$patch'],
  200
>
type DeleteAlertRuleResponse = InferResponseType<
  ConnectionAlertsEndpoint['rules'][':ruleId']['$delete'],
  200
>
type SnoozeAlertRuleResponse = InferResponseType<
  ConnectionAlertsEndpoint['rules'][':ruleId']['snooze']['$post'],
  200
>
type UnsnoozeAlertRuleResponse = InferResponseType<
  ConnectionAlertsEndpoint['rules'][':ruleId']['snooze']['$delete'],
  200
>
type ResolveAlertEventResponse = InferResponseType<
  ConnectionAlertsEndpoint['events'][':eventId']['resolve']['$post'],
  200
>
type AcknowledgeAlertEventResponse = InferResponseType<
  ConnectionAlertsEndpoint['events'][':eventId']['acknowledge']['$post'],
  200
>
type UnacknowledgeAlertEventResponse = InferResponseType<
  ConnectionAlertsEndpoint['events'][':eventId']['acknowledge']['$delete'],
  200
>
type RetryAlertDeliveryResponse = InferResponseType<
  ConnectionAlertsEndpoint['events'][':eventId']['deliveries'][':deliveryId']['retry']['$post'],
  200
>
type TestAlertRuleResponse = InferResponseType<
  ConnectionAlertsEndpoint['rules'][':ruleId']['test']['$post'],
  200
>
type LinearIntegrationResponse = InferResponseType<
  (typeof api.alerts.integrations.linear)['$get'],
  200
>
type LinearConnectResponse = InferResponseType<
  (typeof api.alerts.integrations.linear.connect)['$post'],
  200
>
type LinearMetadataResponse = InferResponseType<
  (typeof api.alerts.integrations.linear.metadata)['$get'],
  200
>
type AlertDestinationsResponse = InferResponseType<(typeof api.alerts.destinations)['$get'], 200>
type AlertDestinationResponse = InferResponseType<(typeof api.alerts.destinations)['$post'], 201>
type UpdateAlertDestinationResponse = InferResponseType<
  (typeof api.alerts.destinations)[':destinationId']['$patch'],
  200
>
type TestAlertDestinationResponse = InferResponseType<
  (typeof api.alerts.destinations)[':destinationId']['test']['$post'],
  200
>
type WebhookDestinationsResponse = InferResponseType<
  (typeof api.alerts)['webhook-destinations']['$get'],
  200
>
type WebhookDestinationResponse = InferResponseType<
  (typeof api.alerts)['webhook-destinations']['$post'],
  201
>
type TestWebhookDestinationResponse = InferResponseType<
  (typeof api.alerts)['webhook-destinations'][':destinationId']['test']['$post'],
  200
>

export type AlertSummaryConnection = AlertSummaryResponse['connections'][number]
export type AlertRuleType = 'failure_threshold' | 'failure_rate' | 'queue_stalled' | 'job_failed'
export type QueueFilterMode = 'include' | 'exclude'
export type AlertEventStatus = 'firing' | 'resolved' | 'suppressed'
export type AlertRuleState = 'active' | 'snoozed' | 'disabled'

export type AlertNotificationChannel =
  | { type: 'destination'; destinationId: string }
  | { type: 'email'; target: string }
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
      secretConfigured?: boolean
      secretLast4?: string
    }
  | {
      type: 'webhook'
      destinationId: string
    }

export interface AlertDeliveryRecord {
  id: string
  channelType: 'email' | 'linear' | 'webhook'
  status: 'pending' | 'claimed' | 'delivered' | 'failed'
  target: string
  attemptCount?: number | null
  externalIdentifier?: string | null
  externalUrl?: string | null
  lastError?: string | null
  providerMetadata?: Record<string, unknown>
}

export interface AlertRuleRecord {
  id: string
  organizationId: string
  connectionId: string
  queueName: string | null
  queueFilterMode: QueueFilterMode | null
  filterQueueNames: string[]
  name: string
  type: AlertRuleType
  config: Record<string, unknown>
  enabled: boolean
  notificationChannels: AlertNotificationChannel[]
  cooldownMinutes: number
  mutedUntil: string | Date | null
  state: AlertRuleState
  createdAt?: string | Date
  updatedAt?: string | Date
}

export interface AlertEventRecord {
  id: string
  alertRuleId: string
  organizationId: string
  connectionId: string
  queueName: string
  type: AlertRuleType
  status: AlertEventStatus
  summary: string
  context: Record<string, unknown>
  firedAt: string | Date
  resolvedAt?: string | Date | null
  notificationSentAt?: string | Date | null
  acknowledgedAt: string | Date | null
  acknowledgedBy: string | null
  acknowledgedByName: string | null
  deliveries: AlertDeliveryRecord[]
}

export interface LinearIntegrationRecord {
  id: string
  connected: boolean
  validationStatus: 'valid' | 'invalid' | 'unknown'
  scopes: string
  linearOrganizationName?: string | null
  accessTokenExpiresAt?: string | Date | null
  defaultTeamId?: string | null
  defaultProjectId?: string | null
  defaultLabelIds: string[]
  defaultAssigneeId?: string | null
  defaultStateId?: string | null
  defaultPriority?: number | null
  lastValidatedAt?: string | Date | null
}

export interface LinearMetadataRecord {
  teams: Array<{ id: string; name: string; key: string }>
  projects: Array<{ id: string; name: string }>
  labels: Array<{ id: string; name: string }>
  users: Array<{ id: string; name: string; email?: string | null }>
  states: Array<{ id: string; name: string; teamId: string }>
}

export type AlertDestinationType = 'webhook' | 'email' | 'linear'

export interface LinearDestinationConfig {
  teamId?: string
  projectId?: string
  labelIds?: string[]
  assigneeId?: string
  stateId?: string
  priority?: number
}

export interface AlertDestinationRecord {
  id: string
  organizationId: string
  name: string
  type: AlertDestinationType
  url: string | null
  config: Record<string, unknown>
  enabled: boolean
  secretConfigured: boolean
  secretLast4?: string
  inUseByRuleCount: number
  createdAt?: string | Date
  updatedAt?: string | Date
}

/** Minimal destination shape returned as a sidecar on the rules list. */
export interface AlertRuleDestinationSummary {
  id: string
  name: string
  type: AlertDestinationType
  enabled: boolean
}

export type AlertDestinationCreateInput =
  | {
      type: 'webhook'
      name: string
      url: string
      signingSecret?: string | null
      enabled?: boolean
    }
  | { type: 'email'; name: string; config: { target: string }; enabled?: boolean }
  | { type: 'linear'; name: string; config?: LinearDestinationConfig; enabled?: boolean }

export interface AlertDestinationUpdateInput {
  name?: string
  url?: string
  signingSecret?: string | null
  config?: Record<string, unknown>
  enabled?: boolean
}

export interface AlertDestinationTestResult {
  success: boolean
  httpStatus?: number | null
  durationMs?: number
  organizationName?: string
  error?: string
}

export interface AlertWebhookDestinationRecord {
  id: string
  organizationId: string
  name: string
  url: string
  enabled: boolean
  secretConfigured: boolean
  secretLast4?: string
  createdAt?: string | Date
  updatedAt?: string | Date
}

export interface AlertWebhookDestinationInput {
  name: string
  url: string
  signingSecret?: string | null
  enabled?: boolean
}

export interface AlertTestResult {
  evaluation: {
    triggered: boolean
    summary: string
    context: Record<string, unknown>
  }
  snapshot: {
    queueName: string
    connectionName: string
    jobCounts: { failed: number; waiting: number; active: number; completed: number }
    failedMetrics: { count: number; dataPoints: number[] }
    completedMetrics: { count: number; dataPoints: number[] }
  }
  webhookTests?: Array<{
    url: string
    success: boolean
    httpStatus: number | null
    durationMs: number
    error?: string
  }>
}

export interface WebhookTestResult {
  success: boolean
  httpStatus: number | null
  durationMs: number
  error?: string
}

export interface AlertRuleMutationInput {
  name: string
  type: AlertRuleType
  queueName?: string | null
  queueFilterMode?: QueueFilterMode | null
  filterQueueNames?: string[]
  config: Record<string, unknown>
  notificationChannels: AlertNotificationChannel[]
  cooldownMinutes: number
  enabled: boolean
}

export interface AlertEventFilterOptions {
  status?: AlertEventStatus
  acknowledged?: boolean
  limit?: number
  offset?: number
  queueName?: string
  jobId?: string
}

export const alertKeys = {
  all: ['alerts'] as const,
  summary: () => ['alerts', 'summary'] as const,
  globalEvents: (filters: AlertEventFilterOptions = {}) =>
    ['alerts', 'global-events', filters] as const,
  linearIntegration: (organizationId?: string | null) =>
    ['alerts', 'integrations', 'linear', organizationId ?? 'unknown'] as const,
  linearMetadata: (organizationId?: string | null) =>
    ['alerts', 'integrations', 'linear', organizationId ?? 'unknown', 'metadata'] as const,
  webhookDestinations: (organizationId?: string | null) =>
    ['alerts', 'webhook-destinations', organizationId ?? 'unknown'] as const,
  destinations: (organizationId?: string | null, type?: AlertDestinationType) =>
    type
      ? (['alerts', 'destinations', organizationId ?? 'unknown', type] as const)
      : (['alerts', 'destinations', organizationId ?? 'unknown'] as const),
  connectionRules: (connectionId: string) =>
    ['alerts', 'connection', connectionId, 'rules'] as const,
  connectionEvents: (connectionId: string, filters: AlertEventFilterOptions = {}) =>
    ['alerts', 'connection', connectionId, 'events', filters] as const,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAlertRuleType(value: unknown): value is AlertRuleType {
  return (
    value === 'failure_threshold' ||
    value === 'failure_rate' ||
    value === 'queue_stalled' ||
    value === 'job_failed'
  )
}

function isAlertEventStatus(value: unknown): value is AlertEventStatus {
  return value === 'firing' || value === 'resolved' || value === 'suppressed'
}

function normalizeNotificationChannels(value: unknown): AlertNotificationChannel[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry): AlertNotificationChannel[] => {
    if (!isRecord(entry)) return []
    if (entry.type === 'linear' && entry.target === 'org-default') {
      return [
        {
          type: 'linear',
          target: 'org-default',
          teamId: typeof entry.teamId === 'string' ? entry.teamId : undefined,
          projectId: typeof entry.projectId === 'string' ? entry.projectId : undefined,
          labelIds: normalizeStringArray(entry.labelIds),
          assigneeId: typeof entry.assigneeId === 'string' ? entry.assigneeId : undefined,
          stateId: typeof entry.stateId === 'string' ? entry.stateId : undefined,
          priority: typeof entry.priority === 'number' ? entry.priority : undefined,
        },
      ]
    }
    if (entry.type === 'webhook' && typeof entry.url === 'string') {
      return [
        {
          type: 'webhook',
          url: entry.url,
          secretConfigured: entry.secretConfigured === true,
          secretLast4: typeof entry.secretLast4 === 'string' ? entry.secretLast4 : undefined,
        },
      ]
    }
    if (entry.type === 'webhook' && typeof entry.destinationId === 'string') {
      return [
        {
          type: 'webhook',
          destinationId: entry.destinationId,
        },
      ]
    }
    if (entry.type === 'destination' && typeof entry.destinationId === 'string') {
      return [
        {
          type: 'destination',
          destinationId: entry.destinationId,
        },
      ]
    }
    if (entry.type !== 'email' || typeof entry.target !== 'string') return []
    return [{ type: 'email', target: entry.target }]
  })
}

function isAlertDestinationType(value: unknown): value is AlertDestinationType {
  return value === 'webhook' || value === 'email' || value === 'linear'
}

function normalizeAlertDestination(value: unknown): AlertDestinationRecord {
  const source = isRecord(value) ? value : {}
  return {
    id: typeof source.id === 'string' ? source.id : '',
    organizationId: typeof source.organizationId === 'string' ? source.organizationId : '',
    name: typeof source.name === 'string' ? source.name : 'Destination',
    type: isAlertDestinationType(source.type) ? source.type : 'webhook',
    url: typeof source.url === 'string' ? source.url : null,
    config: isRecord(source.config) ? source.config : {},
    enabled: source.enabled !== false,
    secretConfigured: source.secretConfigured === true,
    secretLast4: typeof source.secretLast4 === 'string' ? source.secretLast4 : undefined,
    inUseByRuleCount: toNumber(source.inUseByRuleCount, 0),
    createdAt:
      typeof source.createdAt === 'string' || source.createdAt instanceof Date
        ? source.createdAt
        : undefined,
    updatedAt:
      typeof source.updatedAt === 'string' || source.updatedAt instanceof Date
        ? source.updatedAt
        : undefined,
  }
}

function normalizeAlertRuleDestinationSummary(value: unknown): AlertRuleDestinationSummary {
  const source = isRecord(value) ? value : {}
  return {
    id: typeof source.id === 'string' ? source.id : '',
    name: typeof source.name === 'string' ? source.name : 'Destination',
    type: isAlertDestinationType(source.type) ? source.type : 'webhook',
    enabled: source.enabled !== false,
  }
}

function normalizeWebhookDestination(value: unknown): AlertWebhookDestinationRecord {
  const source = isRecord(value) ? value : {}
  return {
    id: typeof source.id === 'string' ? source.id : '',
    organizationId: typeof source.organizationId === 'string' ? source.organizationId : '',
    name: typeof source.name === 'string' ? source.name : 'Webhook destination',
    url: typeof source.url === 'string' ? source.url : '',
    enabled: source.enabled !== false,
    secretConfigured: source.secretConfigured === true,
    secretLast4: typeof source.secretLast4 === 'string' ? source.secretLast4 : undefined,
    createdAt:
      typeof source.createdAt === 'string' || source.createdAt instanceof Date
        ? source.createdAt
        : undefined,
    updatedAt:
      typeof source.updatedAt === 'string' || source.updatedAt instanceof Date
        ? source.updatedAt
        : undefined,
  }
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function isQueueFilterMode(value: unknown): value is QueueFilterMode {
  return value === 'include' || value === 'exclude'
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function isAlertRuleState(value: unknown): value is AlertRuleState {
  return value === 'active' || value === 'snoozed' || value === 'disabled'
}

function normalizeNullableDate(value: unknown): string | Date | null {
  return typeof value === 'string' || value instanceof Date ? value : null
}

function computeRuleState(enabled: boolean, mutedUntil: string | Date | null): AlertRuleState {
  if (!enabled) return 'disabled'
  if (mutedUntil && new Date(mutedUntil).getTime() > Date.now()) return 'snoozed'
  return 'active'
}

function normalizeAlertRule(value: unknown): AlertRuleRecord {
  const source = isRecord(value) ? value : {}
  const enabled = source.enabled !== false
  const mutedUntil = normalizeNullableDate(source.mutedUntil)

  return {
    id: typeof source.id === 'string' ? source.id : '',
    organizationId: typeof source.organizationId === 'string' ? source.organizationId : '',
    connectionId: typeof source.connectionId === 'string' ? source.connectionId : '',
    queueName: typeof source.queueName === 'string' ? source.queueName : null,
    queueFilterMode: isQueueFilterMode(source.queueFilterMode) ? source.queueFilterMode : null,
    filterQueueNames: normalizeStringArray(source.filterQueueNames),
    name: typeof source.name === 'string' ? source.name : 'Alert rule',
    type: isAlertRuleType(source.type) ? source.type : 'failure_threshold',
    config: isRecord(source.config) ? source.config : {},
    enabled,
    notificationChannels: normalizeNotificationChannels(source.notificationChannels),
    cooldownMinutes: toNumber(source.cooldownMinutes, 30),
    mutedUntil,
    state: isAlertRuleState(source.state) ? source.state : computeRuleState(enabled, mutedUntil),
    createdAt:
      typeof source.createdAt === 'string' || source.createdAt instanceof Date
        ? source.createdAt
        : undefined,
    updatedAt:
      typeof source.updatedAt === 'string' || source.updatedAt instanceof Date
        ? source.updatedAt
        : undefined,
  }
}

function normalizeAlertEvent(value: unknown): AlertEventRecord {
  const source = isRecord(value) ? value : {}

  return {
    id: typeof source.id === 'string' ? source.id : '',
    alertRuleId: typeof source.alertRuleId === 'string' ? source.alertRuleId : '',
    organizationId: typeof source.organizationId === 'string' ? source.organizationId : '',
    connectionId: typeof source.connectionId === 'string' ? source.connectionId : '',
    queueName: typeof source.queueName === 'string' ? source.queueName : '',
    type: isAlertRuleType(source.type) ? source.type : 'failure_threshold',
    status: isAlertEventStatus(source.status) ? source.status : 'firing',
    summary: typeof source.summary === 'string' ? source.summary : '',
    context: isRecord(source.context) ? source.context : {},
    firedAt:
      typeof source.firedAt === 'string' || source.firedAt instanceof Date
        ? source.firedAt
        : new Date(0).toISOString(),
    resolvedAt:
      typeof source.resolvedAt === 'string' || source.resolvedAt instanceof Date
        ? source.resolvedAt
        : null,
    notificationSentAt:
      typeof source.notificationSentAt === 'string' || source.notificationSentAt instanceof Date
        ? source.notificationSentAt
        : null,
    acknowledgedAt: normalizeNullableDate(source.acknowledgedAt),
    acknowledgedBy: typeof source.acknowledgedBy === 'string' ? source.acknowledgedBy : null,
    acknowledgedByName:
      typeof source.acknowledgedByName === 'string' ? source.acknowledgedByName : null,
    deliveries: normalizeAlertDeliveries(source.deliveries),
  }
}

function normalizeAlertDeliveries(value: unknown): AlertDeliveryRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    if (
      entry.channelType !== 'email' &&
      entry.channelType !== 'linear' &&
      entry.channelType !== 'webhook'
    ) {
      return []
    }
    return [
      {
        id: typeof entry.id === 'string' ? entry.id : '',
        channelType: entry.channelType,
        status:
          entry.status === 'pending' ||
          entry.status === 'claimed' ||
          entry.status === 'delivered' ||
          entry.status === 'failed'
            ? entry.status
            : 'pending',
        target: typeof entry.target === 'string' ? entry.target : '',
        attemptCount: typeof entry.attemptCount === 'number' ? entry.attemptCount : null,
        externalIdentifier:
          typeof entry.externalIdentifier === 'string' ? entry.externalIdentifier : null,
        externalUrl: typeof entry.externalUrl === 'string' ? entry.externalUrl : null,
        lastError: typeof entry.lastError === 'string' ? entry.lastError : null,
        providerMetadata: isRecord(entry.providerMetadata) ? entry.providerMetadata : undefined,
      },
    ]
  })
}

function invalidateAlertQueries(queryClient: QueryClient, connectionId?: string) {
  queryClient.invalidateQueries({ queryKey: alertKeys.summary() })
  queryClient.invalidateQueries({ queryKey: ['alerts', 'global-events'] })

  if (connectionId) {
    queryClient.invalidateQueries({ queryKey: ['alerts', 'connection', connectionId] })
  }
}

/** Open = firing incl. acknowledged; `count` is the legacy key kept for one release. */
function connectionOpenCount(entry: AlertSummaryConnection): number {
  return typeof entry.open === 'number' ? entry.open : entry.count
}

/** Open incident count for one connection, or org-wide when connectionId is omitted. */
export function getOpenAlertCount(
  connections: AlertSummaryConnection[] | undefined,
  connectionId?: string
): number {
  const entries = connections ?? []
  if (connectionId) {
    const entry = entries.find((candidate) => candidate.connectionId === connectionId)
    return entry ? connectionOpenCount(entry) : 0
  }
  return entries.reduce((sum, entry) => sum + connectionOpenCount(entry), 0)
}

export function useAlertSummary(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: alertKeys.summary(),
    queryFn: async () => {
      const res = await api.alerts.summary.$get()
      return handleRes<AlertSummaryResponse>(res)
    },
    refetchInterval: options?.refetchInterval ?? 60_000,
  })
}

export function useGlobalAlertEvents(filters: AlertEventFilterOptions = {}) {
  const normalizedFilters = {
    limit: filters.limit ?? 100,
    offset: filters.offset ?? 0,
    status: filters.status,
  } satisfies AlertEventFilterOptions

  return useQuery({
    queryKey: alertKeys.globalEvents(normalizedFilters),
    queryFn: async () => {
      const res = await api.alerts.events.$get({
        query: {
          limit: String(normalizedFilters.limit),
          offset: String(normalizedFilters.offset),
          ...(normalizedFilters.status ? { status: normalizedFilters.status } : {}),
        },
      })
      const data = await handleRes<GlobalAlertEventsResponse>(res)
      return {
        events: Array.isArray(data.events) ? data.events.map(normalizeAlertEvent) : [],
      }
    },
    refetchInterval: 15_000,
  })
}

export function useConnectionAlertRules(connectionId: string | undefined) {
  return useQuery({
    queryKey: alertKeys.connectionRules(connectionId ?? ''),
    queryFn: async () => {
      const res = await api.c[':connectionId'].alerts.rules.$get({
        param: { connectionId: connectionId! },
      })
      const data = await handleRes<ConnectionAlertRulesResponse>(res)
      const destinations = (data as { destinations?: unknown }).destinations
      return {
        rules: Array.isArray(data.rules) ? data.rules.map(normalizeAlertRule) : [],
        destinations: Array.isArray(destinations)
          ? destinations.map(normalizeAlertRuleDestinationSummary)
          : [],
      }
    },
    enabled: !!connectionId,
  })
}

export function useConnectionAlertEvents(
  connectionId: string | undefined,
  filters: AlertEventFilterOptions = {}
) {
  const normalizedFilters = {
    limit: filters.limit ?? 100,
    offset: filters.offset ?? 0,
    status: filters.status,
    acknowledged: filters.acknowledged,
    queueName: filters.queueName,
    jobId: filters.jobId,
  } satisfies AlertEventFilterOptions

  return useQuery({
    queryKey: alertKeys.connectionEvents(connectionId ?? '', normalizedFilters),
    queryFn: async () => {
      const res = await api.c[':connectionId'].alerts.events.$get({
        param: { connectionId: connectionId! },
        query: {
          limit: String(normalizedFilters.limit),
          offset: String(normalizedFilters.offset),
          ...(normalizedFilters.status ? { status: normalizedFilters.status } : {}),
          ...(normalizedFilters.acknowledged === undefined
            ? {}
            : { acknowledged: normalizedFilters.acknowledged ? 'true' : 'false' }),
          ...(normalizedFilters.queueName ? { queueName: normalizedFilters.queueName } : {}),
          ...(normalizedFilters.jobId ? { jobId: normalizedFilters.jobId } : {}),
        },
      })
      const data = await handleRes<ConnectionAlertEventsResponse>(res)
      return {
        events: Array.isArray(data.events) ? data.events.map(normalizeAlertEvent) : [],
      }
    },
    enabled: !!connectionId,
    refetchInterval: 15_000,
  })
}

export function useCreateAlertRule(connectionId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AlertRuleMutationInput) => {
      const res = await api.c[':connectionId'].alerts.rules.$post({
        param: { connectionId: connectionId! },
        json: input,
      })
      const data = await handleRes<CreateAlertRuleResponse>(res)
      return { rule: normalizeAlertRule(data.rule) }
    },
    onSuccess: () => invalidateAlertQueries(queryClient, connectionId),
  })
}

export function useUpdateAlertRule(connectionId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      ruleId,
      input,
    }: {
      ruleId: string
      input: Partial<AlertRuleMutationInput>
    }) => {
      const res = await api.c[':connectionId'].alerts.rules[':ruleId'].$patch({
        param: { connectionId: connectionId!, ruleId },
        json: input,
      })
      const data = await handleRes<UpdateAlertRuleResponse>(res)
      return { rule: normalizeAlertRule(data.rule) }
    },
    onSuccess: () => invalidateAlertQueries(queryClient, connectionId),
  })
}

export function useDeleteAlertRule(connectionId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ruleId: string) => {
      const res = await api.c[':connectionId'].alerts.rules[':ruleId'].$delete({
        param: { connectionId: connectionId!, ruleId },
      })
      return handleRes<DeleteAlertRuleResponse>(res)
    },
    onSuccess: () => invalidateAlertQueries(queryClient, connectionId),
  })
}

export function useSnoozeAlertRule(connectionId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ruleId, minutes }: { ruleId: string; minutes: number }) => {
      const res = await api.c[':connectionId'].alerts.rules[':ruleId'].snooze.$post({
        param: { connectionId: connectionId!, ruleId },
        json: { minutes },
      })
      const data = await handleRes<SnoozeAlertRuleResponse>(res)
      return { rule: normalizeAlertRule(data.rule) }
    },
    onSuccess: () => invalidateAlertQueries(queryClient, connectionId),
  })
}

export function useUnsnoozeAlertRule(connectionId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ruleId: string) => {
      const res = await api.c[':connectionId'].alerts.rules[':ruleId'].snooze.$delete({
        param: { connectionId: connectionId!, ruleId },
      })
      const data = await handleRes<UnsnoozeAlertRuleResponse>(res)
      return { rule: normalizeAlertRule(data.rule) }
    },
    onSuccess: () => invalidateAlertQueries(queryClient, connectionId),
  })
}

export function useResolveAlertEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ connectionId, eventId }: { connectionId: string; eventId: string }) => {
      const res = await api.c[':connectionId'].alerts.events[':eventId'].resolve.$post({
        param: { connectionId, eventId },
      })
      const data = await handleRes<ResolveAlertEventResponse>(res)
      return { event: normalizeAlertEvent(data.event) }
    },
    onSuccess: (_, variables) => invalidateAlertQueries(queryClient, variables.connectionId),
  })
}

export function useAcknowledgeAlertEvent(connectionId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (eventId: string) => {
      const res = await api.c[':connectionId'].alerts.events[':eventId'].acknowledge.$post({
        param: { connectionId: connectionId!, eventId },
      })
      const data = await handleRes<AcknowledgeAlertEventResponse>(res)
      return { event: normalizeAlertEvent(data.event) }
    },
    onSuccess: () => invalidateAlertQueries(queryClient, connectionId),
  })
}

export function useUnacknowledgeAlertEvent(connectionId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (eventId: string) => {
      const res = await api.c[':connectionId'].alerts.events[':eventId'].acknowledge.$delete({
        param: { connectionId: connectionId!, eventId },
      })
      const data = await handleRes<UnacknowledgeAlertEventResponse>(res)
      return { event: normalizeAlertEvent(data.event) }
    },
    onSuccess: () => invalidateAlertQueries(queryClient, connectionId),
  })
}

export function useRetryAlertDelivery() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      connectionId,
      eventId,
      deliveryId,
    }: {
      connectionId: string
      eventId: string
      deliveryId: string
    }) => {
      const res = await api.c[':connectionId'].alerts.events[':eventId'].deliveries[
        ':deliveryId'
      ].retry.$post({
        param: { connectionId, eventId, deliveryId },
      })
      const data = await handleRes<RetryAlertDeliveryResponse>(res)
      return { event: normalizeAlertEvent(data.event) }
    },
    onSuccess: (_, variables) => invalidateAlertQueries(queryClient, variables.connectionId),
  })
}

export function useTestAlertRule(connectionId: string | undefined) {
  return useMutation({
    mutationFn: async ({ ruleId, deliver = false }: { ruleId: string; deliver?: boolean }) => {
      const res = await api.c[':connectionId'].alerts.rules[':ruleId'].test.$post({
        param: { connectionId: connectionId!, ruleId },
        query: deliver ? { deliver: 'true' } : {},
      })
      const data = await handleRes<TestAlertRuleResponse>(res)
      return data as AlertTestResult
    },
  })
}

export function useTestWebhook(connectionId: string | undefined) {
  return useMutation({
    mutationFn: async (input: { url: string; secret?: string; ruleId?: string }) => {
      const res = await api.c[':connectionId'].alerts.webhooks.test.$post({
        param: { connectionId: connectionId! },
        json: input,
      })
      return handleRes<WebhookTestResult>(res)
    },
  })
}

export function useAlertDestinations(options?: { type?: AlertDestinationType }) {
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useQuery({
    queryKey: alertKeys.destinations(organizationId, options?.type),
    queryFn: async () => {
      const res = await api.alerts.destinations.$get({
        query: options?.type ? { type: options.type } : {},
      })
      const data = await handleRes<AlertDestinationsResponse>(res)
      return {
        destinations: Array.isArray(data.destinations)
          ? data.destinations.map(normalizeAlertDestination)
          : [],
      }
    },
    enabled: !!organizationId,
  })
}

export function useCreateAlertDestination() {
  const queryClient = useQueryClient()
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useMutation({
    mutationFn: async (input: AlertDestinationCreateInput) => {
      const res = await api.alerts.destinations.$post({ json: input })
      const data = await handleRes<AlertDestinationResponse>(res)
      return { destination: normalizeAlertDestination(data.destination) }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: alertKeys.destinations(organizationId) }),
  })
}

export function useUpdateAlertDestination() {
  const queryClient = useQueryClient()
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useMutation({
    mutationFn: async ({
      destinationId,
      input,
    }: {
      destinationId: string
      input: AlertDestinationUpdateInput
    }) => {
      const res = await api.alerts.destinations[':destinationId'].$patch({
        param: { destinationId },
        json: input,
      })
      const data = await handleRes<UpdateAlertDestinationResponse>(res)
      return { destination: normalizeAlertDestination(data.destination) }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.destinations(organizationId) })
      queryClient.invalidateQueries({ queryKey: ['alerts', 'connection'] })
    },
  })
}

export function useDeleteAlertDestination() {
  const queryClient = useQueryClient()
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useMutation({
    mutationFn: async (destinationId: string) => {
      const res = await api.alerts.destinations[':destinationId'].$delete({
        param: { destinationId },
      })
      return handleRes<{ ok: boolean }>(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.destinations(organizationId) })
      queryClient.invalidateQueries({ queryKey: ['alerts', 'connection'] })
    },
  })
}

export function useTestAlertDestination() {
  return useMutation({
    mutationFn: async (destinationId: string) => {
      const res = await api.alerts.destinations[':destinationId'].test.$post({
        param: { destinationId },
      })
      // The response shape differs per destination type; widen to the shared result.
      const data = await handleRes<TestAlertDestinationResponse>(res)
      return data as AlertDestinationTestResult
    },
  })
}

export function useWebhookDestinations() {
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useQuery({
    queryKey: alertKeys.webhookDestinations(organizationId),
    queryFn: async () => {
      const res = await api.alerts['webhook-destinations'].$get()
      const data = await handleRes<WebhookDestinationsResponse>(res)
      return {
        destinations: Array.isArray(data.destinations)
          ? data.destinations.map(normalizeWebhookDestination)
          : [],
      }
    },
    enabled: !!organizationId,
  })
}

export function useCreateWebhookDestination() {
  const queryClient = useQueryClient()
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useMutation({
    mutationFn: async (input: AlertWebhookDestinationInput) => {
      const res = await api.alerts['webhook-destinations'].$post({ json: input })
      const data = await handleRes<WebhookDestinationResponse>(res)
      return { destination: normalizeWebhookDestination(data.destination) }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: alertKeys.webhookDestinations(organizationId) }),
  })
}

export function useUpdateWebhookDestination() {
  const queryClient = useQueryClient()
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useMutation({
    mutationFn: async ({
      destinationId,
      input,
    }: {
      destinationId: string
      input: Partial<AlertWebhookDestinationInput>
    }) => {
      const res = await api.alerts['webhook-destinations'][':destinationId'].$patch({
        param: { destinationId },
        json: input,
      })
      const data = await handleRes<WebhookDestinationResponse>(res)
      return { destination: normalizeWebhookDestination(data.destination) }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: alertKeys.webhookDestinations(organizationId) }),
  })
}

export function useDeleteWebhookDestination() {
  const queryClient = useQueryClient()
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useMutation({
    mutationFn: async (destinationId: string) => {
      const res = await api.alerts['webhook-destinations'][':destinationId'].$delete({
        param: { destinationId },
      })
      return handleRes<{ ok: boolean }>(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.webhookDestinations(organizationId) })
      queryClient.invalidateQueries({ queryKey: ['alerts', 'connection'] })
    },
  })
}

export function useTestWebhookDestination() {
  return useMutation({
    mutationFn: async (destinationId: string) => {
      const res = await api.alerts['webhook-destinations'][':destinationId'].test.$post({
        param: { destinationId },
      })
      return handleRes<TestWebhookDestinationResponse>(res)
    },
  })
}

function normalizeLinearIntegration(value: unknown): LinearIntegrationRecord | null {
  if (!isRecord(value)) return null
  return {
    id: typeof value.id === 'string' ? value.id : '',
    connected: value.connected !== false,
    validationStatus:
      value.validationStatus === 'valid' ||
      value.validationStatus === 'invalid' ||
      value.validationStatus === 'unknown'
        ? value.validationStatus
        : 'unknown',
    scopes: typeof value.scopes === 'string' ? value.scopes : '',
    linearOrganizationName:
      typeof value.linearOrganizationName === 'string' ? value.linearOrganizationName : null,
    accessTokenExpiresAt:
      typeof value.accessTokenExpiresAt === 'string' || value.accessTokenExpiresAt instanceof Date
        ? value.accessTokenExpiresAt
        : null,
    defaultTeamId: typeof value.defaultTeamId === 'string' ? value.defaultTeamId : null,
    defaultProjectId: typeof value.defaultProjectId === 'string' ? value.defaultProjectId : null,
    defaultLabelIds: normalizeStringArray(value.defaultLabelIds),
    defaultAssigneeId: typeof value.defaultAssigneeId === 'string' ? value.defaultAssigneeId : null,
    defaultStateId: typeof value.defaultStateId === 'string' ? value.defaultStateId : null,
    defaultPriority: typeof value.defaultPriority === 'number' ? value.defaultPriority : null,
    lastValidatedAt:
      typeof value.lastValidatedAt === 'string' || value.lastValidatedAt instanceof Date
        ? value.lastValidatedAt
        : null,
  }
}

export function useLinearIntegration() {
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useQuery({
    queryKey: alertKeys.linearIntegration(organizationId),
    queryFn: async () => {
      const res = await api.alerts.integrations.linear.$get()
      const data = await handleRes<LinearIntegrationResponse>(res)
      return { integration: normalizeLinearIntegration(data.integration) }
    },
  })
}

export function useLinearMetadata(enabled: boolean) {
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useQuery({
    queryKey: alertKeys.linearMetadata(organizationId),
    queryFn: async () => {
      const res = await api.alerts.integrations.linear.metadata.$get()
      const data = await handleRes<LinearMetadataResponse>(res)
      return data.metadata as LinearMetadataRecord
    },
    enabled,
  })
}

export function useConnectLinearIntegration() {
  const queryClient = useQueryClient()
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useMutation({
    mutationFn: async () => {
      const res = await api.alerts.integrations.linear.connect.$post()
      return handleRes<LinearConnectResponse>(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.linearIntegration(organizationId) })
    },
  })
}

export function useSaveLinearIntegration() {
  const queryClient = useQueryClient()
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useMutation({
    mutationFn: async (input: {
      defaultTeamId?: string | null
      defaultProjectId?: string | null
      defaultLabelIds?: string[]
      defaultAssigneeId?: string | null
      defaultStateId?: string | null
      defaultPriority?: number | null
    }) => {
      const res = await api.alerts.integrations.linear.$put({ json: input })
      const data = await handleRes<LinearIntegrationResponse>(res)
      return { integration: normalizeLinearIntegration(data.integration) }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.linearIntegration(organizationId) })
      queryClient.invalidateQueries({ queryKey: alertKeys.linearMetadata(organizationId) })
      queryClient.invalidateQueries({ queryKey: ['alerts', 'connection'] })
    },
  })
}

export function useDeleteLinearIntegration() {
  const queryClient = useQueryClient()
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useMutation({
    mutationFn: async () => {
      const res = await api.alerts.integrations.linear.$delete()
      return handleRes<{ success: boolean }>(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.linearIntegration(organizationId) })
      queryClient.invalidateQueries({ queryKey: alertKeys.linearMetadata(organizationId) })
      queryClient.invalidateQueries({ queryKey: ['alerts', 'connection'] })
    },
  })
}

export function useTestLinearIntegration() {
  const queryClient = useQueryClient()
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  return useMutation({
    mutationFn: async () => {
      const res = await api.alerts.integrations.linear.test.$post()
      return handleRes<{ ok: boolean; organizationName: string }>(res)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: alertKeys.linearIntegration(organizationId) }),
  })
}
