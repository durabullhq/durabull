import type { QueryClient } from '@tanstack/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
type ResolveAlertEventResponse = InferResponseType<
  ConnectionAlertsEndpoint['events'][':eventId']['resolve']['$post'],
  200
>
type TestAlertRuleResponse = InferResponseType<
  ConnectionAlertsEndpoint['rules'][':ruleId']['test']['$post'],
  200
>

export type AlertSummaryConnection = AlertSummaryResponse['connections'][number]
export type AlertRuleType = 'failure_threshold' | 'failure_rate' | 'queue_stalled'
export type QueueFilterMode = 'include' | 'exclude'
export type AlertEventStatus = 'firing' | 'resolved' | 'suppressed'

export interface AlertNotificationChannel {
  type: 'email'
  target: string
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
  limit?: number
  offset?: number
}

export const alertKeys = {
  all: ['alerts'] as const,
  summary: () => ['alerts', 'summary'] as const,
  globalEvents: (filters: AlertEventFilterOptions = {}) =>
    ['alerts', 'global-events', filters] as const,
  connectionRules: (connectionId: string) =>
    ['alerts', 'connection', connectionId, 'rules'] as const,
  connectionEvents: (connectionId: string, filters: AlertEventFilterOptions = {}) =>
    ['alerts', 'connection', connectionId, 'events', filters] as const,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAlertRuleType(value: unknown): value is AlertRuleType {
  return value === 'failure_threshold' || value === 'failure_rate' || value === 'queue_stalled'
}

function isAlertEventStatus(value: unknown): value is AlertEventStatus {
  return value === 'firing' || value === 'resolved' || value === 'suppressed'
}

function normalizeNotificationChannels(value: unknown): AlertNotificationChannel[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    if (entry.type !== 'email' || typeof entry.target !== 'string') return []
    return [{ type: 'email', target: entry.target }]
  })
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

function normalizeAlertRule(value: unknown): AlertRuleRecord {
  const source = isRecord(value) ? value : {}

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
    enabled: source.enabled !== false,
    notificationChannels: normalizeNotificationChannels(source.notificationChannels),
    cooldownMinutes: toNumber(source.cooldownMinutes, 30),
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
  }
}

function invalidateAlertQueries(queryClient: QueryClient, connectionId?: string) {
  queryClient.invalidateQueries({ queryKey: alertKeys.summary() })
  queryClient.invalidateQueries({ queryKey: ['alerts', 'global-events'] })

  if (connectionId) {
    queryClient.invalidateQueries({ queryKey: ['alerts', 'connection', connectionId] })
  }
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
      return {
        rules: Array.isArray(data.rules) ? data.rules.map(normalizeAlertRule) : [],
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

export function useTestAlertRule(connectionId: string | undefined) {
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const res = await api.c[':connectionId'].alerts.rules[':ruleId'].test.$post({
        param: { connectionId: connectionId!, ruleId },
      })
      const data = await handleRes<TestAlertRuleResponse>(res)
      return data as AlertTestResult
    },
  })
}
