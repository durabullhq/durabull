/**
 * Queue-related hooks using Hono RPC client
 * Types are inferred from the server via InferResponseType
 */

import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useConnection } from '@/components/connection-provider'
import { ApiError, api, fetchApi, handleRes, type InferResponseType } from '@/lib/api'
import { PAGINATION } from '@/lib/constants'
import type { JobOptionsInput } from '@/lib/job-options'

// Re-export ApiError for backward compatibility
export { ApiError }

// Type aliases for cleaner type inference
type QueuesEndpoint = (typeof api.c)[':connectionId']['queues']
type QueueEndpoint = (typeof api.c)[':connectionId']['queues'][':queueName']
type QueueDiscoveryEndpoint = (typeof api.c)[':connectionId']['queues']['discovery']
type JobEndpoint = (typeof api.c)[':connectionId']['queues'][':queueName']['jobs'][':jobId']
type ScheduledJobsEndpoint = (typeof api.c)[':connectionId']['scheduled-jobs']
type QueueScheduledJobsEndpoint = ScheduledJobsEndpoint['queue'][':queueName']
type ScheduledJobEndpoint = QueueScheduledJobsEndpoint[':schedulerId']
type MetricsEndpoint = (typeof api.c)[':connectionId']['metrics']
type WorkersEndpoint = (typeof api.c)[':connectionId']['workers']
type CanDeleteEndpoint = (typeof api.c)[':connectionId']['queues'][':queueName']['can-delete']
type PurgeQueueEndpoint = (typeof api.c)[':connectionId']['queues'][':queueName']['purge']

// Type helpers using Hono's InferResponseType
type ListQueuesResponse = InferResponseType<QueuesEndpoint['$get'], 200>
type GetQueueResponse = InferResponseType<QueueEndpoint['$get'], 200>
type QueueDiscoveryStatusResponse = InferResponseType<QueueDiscoveryEndpoint['$get'], 200>
type GetJobResponse = InferResponseType<JobEndpoint['$get'], 200>
type ListScheduledJobsResponse = InferResponseType<ScheduledJobsEndpoint['$get'], 200>
type GetScheduledJobResponse = InferResponseType<ScheduledJobEndpoint['$get'], 200>
type ListMetricsResponse = InferResponseType<MetricsEndpoint['$get'], 200>
type ListWorkersResponse = InferResponseType<WorkersEndpoint['$get'], 200>
type CanDeleteQueueResponse = InferResponseType<CanDeleteEndpoint['$get'], 200>
type PurgeQueueResponse = InferResponseType<PurgeQueueEndpoint['$post'], 200>

export interface QueueMetricsPoint {
  metricIndex: number
  minuteOffset: number
  timestamp: number
  completed: number
  failed: number
  total: number
  successRate: number
  failureRate: number
}

export interface QueueNativeMetricsResponse {
  queueName: string
  range: {
    granularityMinutes: 1
    requestedWindowMinutes: number | null
    start: number
    end: number
    returnedPoints: number
    newestFirst: boolean
    retainedPoints: number
    oldestPointTimestamp: number | null
    newestPointTimestamp: number | null
    latestPointAgeMs: number | null
    requestedWindowCoverage: number | null
  }
  series: {
    completed: {
      meta: { count: number; prevTS: number; prevCount: number }
      data: number[]
      count: number
    }
    failed: {
      meta: { count: number; prevTS: number; prevCount: number }
      data: number[]
      count: number
    }
    points: QueueMetricsPoint[]
    totals: {
      completedInWindow: number
      failedInWindow: number
      finishedInWindow: number
      minutesInWindow: number
      minutesWithCompletionsInWindow: number
      minutesWithFailuresInWindow: number
      minutesWithFinishedJobsInWindow: number
      avgCompletedPerMinuteInWindow: number
      avgFailedPerMinuteInWindow: number
      avgFinishedPerMinuteInWindow: number
      peakCompletedPerMinuteInWindow: number
      peakFailedPerMinuteInWindow: number
      peakFinishedPerMinuteInWindow: number
      longestFailureStreakMinutesInWindow: number
      longestCompletionStreakMinutesInWindow: number
      successRateInWindow: number
      failureRateInWindow: number
      completedLifetime: number
      failedLifetime: number
      finishedLifetime: number
      successRateLifetime: number
      failureRateLifetime: number
      estimatedDrainMinutes: number | null
    }
  }
  queue: {
    isPaused: boolean
    isMaxed: boolean
    waitingToProcess: number
    workersCount: number
    schedulersCount: number
    workers: Array<{
      id: string
      name: string
      address: string
      ageMs: number
      idleMs: number
      raw: Record<string, string>
    }>
    queueEventsCount: number
    queueEvents: Array<{
      id: string
      name: string
      address: string
      ageMs: number
      idleMs: number
      raw: Record<string, string>
    }>
  }
  counts: {
    waiting: number
    active: number
    delayed: number
    completed: number
    failed: number
    paused: number
    prioritized: number
    waitingChildren: number
  }
  controls: {
    rateLimitTtlMs: number
    rateLimited: boolean
    globalConcurrency: number | null
    globalRateLimit: { max: number; durationMs: number } | null
  }
  priorities: {
    sampled: number[]
    counts: Record<string, number>
  }
  meta: {
    concurrency: number | null
    max: number | null
    duration: number | null
    maxLenEvents: number | null
    paused: boolean | null
    version: string | null
  }
  prometheus: {
    included: boolean
    metrics: string | null
  }
  warnings: string[]
}

export interface QueueMetricsOptions {
  windowMinutes?: number
  start?: number
  end?: number
  includePrometheus?: boolean
  priorities?: number[]
}

export const PURGE_QUEUE_STATUSES = [
  'waiting',
  'active',
  'delayed',
  'completed',
  'failed',
  'paused',
  'prioritized',
] as const

export type PurgeQueueStatus = (typeof PURGE_QUEUE_STATUSES)[number]
export type PurgeQueueStatusOption = PurgeQueueStatus | 'all'

export const RETRY_QUEUE_STATUSES = ['failed', 'completed'] as const
export type RetryQueueStatus = (typeof RETRY_QUEUE_STATUSES)[number]
export type RetryQueueStatusOption = RetryQueueStatus | 'all'

// Re-export response types for consumers
export type {
  ListQueuesResponse,
  GetQueueResponse,
  QueueDiscoveryStatusResponse,
  GetJobResponse,
  ListScheduledJobsResponse,
  GetScheduledJobResponse,
  ListWorkersResponse,
}

/**
 * Query key factory for queue-related queries
 * Includes connection ID for proper cache isolation
 */
export const QUEUE_SORT_FIELDS = [
  'name',
  'status',
  'waiting',
  'prioritized',
  'active',
  'delayed',
  'completed',
  'failed',
] as const
export type QueueSortField = (typeof QUEUE_SORT_FIELDS)[number]
export type QueueSortOrder = 'asc' | 'desc'
export type QueueStatusFilter = 'active' | 'paused'

export interface UseQueuesOptions {
  page?: number
  pageSize?: number
  sortBy?: QueueSortField
  sortOrder?: QueueSortOrder
  search?: string
  status?: QueueStatusFilter
}

export const queryKeys = {
  queues: (connectionId: string, options?: UseQueuesOptions) =>
    options && Object.values(options).some((value) => value !== undefined)
      ? (['queues', connectionId, options] as const)
      : (['queues', connectionId] as const),
  queueDiscovery: (connectionId: string) => ['queues', connectionId, 'discovery'] as const,
  queue: (connectionId: string, name: string) => ['queue', connectionId, name] as const,
  queueMetrics: (connectionId: string, name: string, options?: QueueMetricsOptions) =>
    ['queue', connectionId, name, 'metrics', options] as const,
  jobs: (
    connectionId: string,
    queueName: string,
    filters?: { status?: string; name?: string; jobId?: string; data?: string; pageSize?: number }
  ) => ['jobs', connectionId, queueName, filters] as const,
  job: (connectionId: string, queueName: string, jobId: string) =>
    ['job', connectionId, queueName, jobId] as const,
  jobLogs: (connectionId: string, queueName: string, jobId: string) =>
    ['job', connectionId, queueName, jobId, 'logs'] as const,
  jobLogTail: (connectionId: string, queueName: string, jobId: string, start: number) =>
    ['job', connectionId, queueName, jobId, 'logs', 'tail', start] as const,
  jobStacktraces: (connectionId: string, queueName: string, jobId: string) =>
    ['job', connectionId, queueName, jobId, 'stacktraces'] as const,
  scheduledJobs: (connectionId: string) => ['scheduledJobs', connectionId] as const,
  queueScheduledJobs: (connectionId: string, queueName: string) =>
    ['scheduledJobs', connectionId, queueName] as const,
  queueScheduledJob: (connectionId: string, queueName: string, schedulerId: string) =>
    ['scheduledJobs', connectionId, queueName, schedulerId] as const,
  allMetrics: (connectionId: string) => ['metrics', connectionId] as const,
  allWorkers: (connectionId: string) => ['workers', connectionId] as const,
}

export function useConnectionIdFromContextOrRoute(): string | undefined {
  const { currentConnection } = useConnection()
  const { connectionId } = useParams({ strict: false }) as { connectionId?: string }
  return currentConnection?.id ?? connectionId
}

// Queue Queries
export function useQueues(options?: UseQueuesOptions) {
  const connectionId = useConnectionIdFromContextOrRoute()
  const { page, pageSize, sortBy, sortOrder, search, status } = options ?? {}

  return useQuery({
    queryKey: queryKeys.queues(connectionId ?? '', options),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (page !== undefined) params.set('page', String(page))
      if (pageSize !== undefined) params.set('pageSize', String(pageSize))
      if (sortBy !== undefined) params.set('sortBy', sortBy)
      if (sortOrder !== undefined) params.set('sortOrder', sortOrder)
      if (search) params.set('search', search)
      if (status !== undefined) params.set('status', status)
      const query = params.toString()

      return fetchApi<ListQueuesResponse>(
        `/api/c/${connectionId}/queues${query ? `?${query}` : ''}`
      )
    },
    refetchInterval: (query) => {
      const hasPendingDiscoveryRows = (query.state.data?.discovery?.indexed.pending ?? 0) > 0
      return query.state.data?.discovery?.running || hasPendingDiscoveryRows ? 2000 : 10_000
    },
    placeholderData: (previousData) => previousData,
    enabled: !!connectionId,
  })
}

export function useQueueDiscoveryStatus() {
  const connectionId = useConnectionIdFromContextOrRoute()

  return useQuery({
    queryKey: queryKeys.queueDiscovery(connectionId ?? ''),
    queryFn: async () => {
      const res = await api.c[':connectionId'].queues.discovery.$get({
        param: { connectionId: connectionId! },
      })
      return handleRes<QueueDiscoveryStatusResponse>(res)
    },
    enabled: !!connectionId,
    refetchInterval: (query) => {
      const hasPendingDiscoveryRows = (query.state.data?.indexed.pending ?? 0) > 0
      return query.state.data?.running || hasPendingDiscoveryRows ? 2000 : false
    },
  })
}

export function useQueue(queueName: string) {
  const connectionId = useConnectionIdFromContextOrRoute()

  return useQuery({
    queryKey: queryKeys.queue(connectionId ?? '', queueName),
    queryFn: async () => {
      const res = await api.c[':connectionId'].queues[':queueName'].$get({
        param: { connectionId: connectionId!, queueName },
      })
      return handleRes<GetQueueResponse>(res)
    },
    enabled: !!queueName && !!connectionId,
  })
}

export function useDiscoverQueues() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async () => {
      const res = await api.c[':connectionId'].queues.discovery.$post({
        param: { connectionId: connectionId! },
      })
      return handleRes<QueueDiscoveryStatusResponse>(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queueDiscovery(connectionId ?? '') })
      queryClient.invalidateQueries({ queryKey: queryKeys.queues(connectionId ?? '') })
    },
  })
}

export function useQueueMetrics(queueName: string, options?: QueueMetricsOptions) {
  const connectionId = useConnectionIdFromContextOrRoute()

  return useQuery({
    queryKey: queryKeys.queueMetrics(connectionId ?? '', queueName, options),
    queryFn: async () => {
      const params = new URLSearchParams()

      if (options?.windowMinutes !== undefined) {
        params.set('windowMinutes', String(options.windowMinutes))
      }

      if (options?.start !== undefined) {
        params.set('start', String(options.start))
      }

      if (options?.end !== undefined) {
        params.set('end', String(options.end))
      }

      if (options?.includePrometheus) {
        params.set('includePrometheus', '1')
      }

      if (options?.priorities?.length) {
        params.set('priorities', options.priorities.join(','))
      }

      const query = params.toString()
      const url = `/api/c/${connectionId}/queues/${encodeURIComponent(queueName)}/metrics${query ? `?${query}` : ''}`

      return fetchApi<QueueNativeMetricsResponse>(url)
    },
    placeholderData: (previousData) => previousData,
    enabled: !!queueName && !!connectionId,
  })
}

// Job Queries - uses fetchApi since route doesn't have zValidator for query params
export function useJobs(
  queueName: string,
  filters?: { status?: string; name?: string; jobId?: string; data?: string; pageSize?: number }
) {
  const connectionId = useConnectionIdFromContextOrRoute()

  return useInfiniteQuery({
    queryKey: queryKeys.jobs(connectionId ?? '', queueName, filters),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.name) params.set('name', filters.name)
      if (filters?.jobId) params.set('jobId', filters.jobId)
      if (filters?.data) params.set('data', filters.data)
      if (filters?.pageSize) params.set('pageSize', filters.pageSize.toString())
      if (pageParam) params.set('cursor', pageParam)
      const query = params.toString()

      const url = `/api/c/${connectionId}/queues/${encodeURIComponent(queueName)}/jobs${query ? `?${query}` : ''}`
      return fetchApi<{
        jobs: Array<{
          id: string
          name: string
          status: string
          data: Record<string, unknown>
          progress: number | string | object | boolean
          attemptsMade: number
          maxAttempts: number
          failedReason?: string
          processedOn?: number
          finishedOn?: number
          timestamp: number
          delay: number
          priority: number
        }>
        total: number
        page: number
        cursor: string
        nextCursor: string | null
        hasMore: boolean
        pageSize: number
        totalPages: number
      }>(url)
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.nextCursor) {
        return undefined
      }
      // Guard against server bugs that return a non-advancing cursor.
      return lastPage.nextCursor === lastPage.cursor ? undefined : lastPage.nextCursor
    },
    initialPageParam: undefined as string | undefined,
    enabled: !!queueName && !!connectionId,
  })
}

interface UsePollingQueryOptions {
  enabled?: boolean
  refetchInterval?: number | false
}

export interface JobLogTailResponse {
  logs: string[]
  count: number
  start: number
  hasMore: boolean
}

export async function fetchJobLogTail({
  connectionId,
  queueName,
  jobId,
  start,
}: {
  connectionId: string
  queueName: string
  jobId: string
  start: number
}) {
  const params = new URLSearchParams()
  params.set('start', String(start))

  const url = `/api/c/${connectionId}/queues/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}/logs?${params}`
  return fetchApi<JobLogTailResponse>(url)
}

export function useJob(queueName: string, jobId: string, options?: UsePollingQueryOptions) {
  const connectionId = useConnectionIdFromContextOrRoute()

  return useQuery({
    queryKey: queryKeys.job(connectionId ?? '', queueName, jobId),
    queryFn: async () => {
      const res = await api.c[':connectionId'].queues[':queueName'].jobs[':jobId'].$get({
        param: { connectionId: connectionId!, queueName, jobId },
      })
      return handleRes<GetJobResponse>(res)
    },
    enabled: !!queueName && !!jobId && !!connectionId && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval ?? false,
  })
}

export function useJobLogs(queueName: string, jobId: string) {
  const connectionId = useConnectionIdFromContextOrRoute()

  return useInfiniteQuery({
    queryKey: queryKeys.jobLogs(connectionId ?? '', queueName, jobId),
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams()
      params.set('page', String(pageParam))
      params.set('pageSize', String(PAGINATION.LOGS_PAGE_SIZE))

      const url = `/api/c/${connectionId}/queues/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}/logs?${params}`
      return fetchApi<{
        logs: string[]
        count: number
        page: number
        pageSize: number
        totalPages: number
        hasMore: boolean
      }>(url)
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    initialPageParam: 1,
    enabled: !!queueName && !!jobId && !!connectionId,
  })
}

export function useJobLogTail(
  queueName: string,
  jobId: string,
  start: number | null,
  options?: UsePollingQueryOptions
) {
  const connectionId = useConnectionIdFromContextOrRoute()
  const enabled =
    start != null && !!queueName && !!jobId && !!connectionId && (options?.enabled ?? true)

  return useQuery({
    queryKey: queryKeys.jobLogTail(connectionId ?? '', queueName, jobId, start ?? 0),
    queryFn: async () => {
      return fetchJobLogTail({
        connectionId: connectionId!,
        queueName,
        jobId,
        start: start ?? 0,
      })
    },
    enabled,
    refetchInterval: options?.refetchInterval ?? false,
  })
}

export function useJobStacktraces(queueName: string, jobId: string, enabled = true) {
  const connectionId = useConnectionIdFromContextOrRoute()

  return useInfiniteQuery({
    queryKey: queryKeys.jobStacktraces(connectionId ?? '', queueName, jobId),
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams()
      params.set('page', String(pageParam))
      params.set('pageSize', String(PAGINATION.STACKTRACES_PAGE_SIZE))

      const url = `/api/c/${connectionId}/queues/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}/stacktraces?${params}`
      return fetchApi<{
        items: Array<{ attemptNumber: number; stacktrace: string; isLatest: boolean }>
        total: number
        page: number
        pageSize: number
        totalPages: number
        hasMore: boolean
      }>(url)
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    initialPageParam: 1,
    enabled: !!queueName && !!jobId && !!connectionId && enabled,
  })
}

// Scheduled Jobs Queries
export function useScheduledJobs() {
  const connectionId = useConnectionIdFromContextOrRoute()

  return useQuery({
    queryKey: queryKeys.scheduledJobs(connectionId ?? ''),
    queryFn: async () => {
      const res = await api.c[':connectionId']['scheduled-jobs'].$get({
        param: { connectionId: connectionId! },
      })
      return handleRes<ListScheduledJobsResponse>(res)
    },
    enabled: !!connectionId,
  })
}

export function useQueueScheduledJobs(queueName: string) {
  const connectionId = useConnectionIdFromContextOrRoute()

  return useQuery({
    queryKey: queryKeys.queueScheduledJobs(connectionId ?? '', queueName),
    queryFn: async () => {
      const res = await api.c[':connectionId']['scheduled-jobs'].queue[':queueName'].$get({
        param: { connectionId: connectionId!, queueName },
      })
      return handleRes<ListScheduledJobsResponse>(res)
    },
    enabled: !!queueName && !!connectionId,
  })
}

export function useScheduledJob(queueName: string, schedulerId: string) {
  const connectionId = useConnectionIdFromContextOrRoute()

  return useQuery({
    queryKey: queryKeys.queueScheduledJob(connectionId ?? '', queueName, schedulerId),
    queryFn: async () => {
      const res = await api.c[':connectionId']['scheduled-jobs'].queue[':queueName'][
        ':schedulerId'
      ].$get({
        param: { connectionId: connectionId!, queueName, schedulerId },
      })
      return handleRes<GetScheduledJobResponse>(res)
    },
    enabled: !!queueName && !!schedulerId && !!connectionId,
  })
}

// Metrics Query
export function useAllMetrics() {
  const connectionId = useConnectionIdFromContextOrRoute()

  return useQuery({
    queryKey: queryKeys.allMetrics(connectionId ?? ''),
    queryFn: async () => {
      const res = await api.c[':connectionId'].metrics.$get({
        param: { connectionId: connectionId! },
        query: {},
      })
      return handleRes<ListMetricsResponse>(res)
    },
    enabled: !!connectionId,
  })
}

// Workers Query
export function useAllWorkers() {
  const connectionId = useConnectionIdFromContextOrRoute()

  return useQuery({
    queryKey: queryKeys.allWorkers(connectionId ?? ''),
    queryFn: async () => {
      const res = await api.c[':connectionId'].workers.$get({
        param: { connectionId: connectionId! },
      })
      return handleRes<ListWorkersResponse>(res)
    },
    enabled: !!connectionId,
  })
}

// Queue Mutations
export function usePauseQueue() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async (queueName: string) => {
      const res = await api.c[':connectionId'].queues[':queueName'].pause.$post({
        param: { connectionId: connectionId!, queueName },
      })
      return handleRes<{ success: boolean; message: string }>(res)
    },
    onSuccess: (_, queueName) => {
      trackEvent(AnalyticsEvents.QUEUE_PAUSED, {
        queue_name: queueName,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.queue(connectionId ?? '', queueName) })
      queryClient.invalidateQueries({ queryKey: queryKeys.queues(connectionId ?? '') })
    },
    onError: (_, queueName) => {
      trackEvent(AnalyticsEvents.QUEUE_PAUSED, {
        queue_name: queueName,
        success: false,
      })
    },
  })
}

export function useResumeQueue() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async (queueName: string) => {
      const res = await api.c[':connectionId'].queues[':queueName'].resume.$post({
        param: { connectionId: connectionId!, queueName },
      })
      return handleRes<{ success: boolean; message: string }>(res)
    },
    onSuccess: (_, queueName) => {
      trackEvent(AnalyticsEvents.QUEUE_RESUMED, {
        queue_name: queueName,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.queue(connectionId ?? '', queueName) })
      queryClient.invalidateQueries({ queryKey: queryKeys.queues(connectionId ?? '') })
    },
    onError: (_, queueName) => {
      trackEvent(AnalyticsEvents.QUEUE_RESUMED, {
        queue_name: queueName,
        success: false,
      })
    },
  })
}

export function useCleanQueue() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async ({
      queueName,
      status,
      gracePeriod,
      limit,
    }: {
      queueName: string
      status: string
      gracePeriod?: number
      limit?: number
    }) => {
      const res = await api.c[':connectionId'].queues[':queueName'].clean.$post({
        param: { connectionId: connectionId!, queueName },
        json: { status, gracePeriod, limit },
      })
      return handleRes<{ removed: number; removedJobIds: string[] }>(res)
    },
    onSuccess: (data, { queueName, status }) => {
      trackEvent(AnalyticsEvents.QUEUE_CLEANED, {
        queue_name: queueName,
        queue_status: status,
        job_count: data.removed,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.queue(connectionId ?? '', queueName) })
      queryClient.invalidateQueries({ queryKey: queryKeys.queues(connectionId ?? '') })
      queryClient.invalidateQueries({ queryKey: ['jobs', connectionId, queueName] })
    },
    onError: (_, { queueName, status }) => {
      trackEvent(AnalyticsEvents.QUEUE_CLEANED, {
        queue_name: queueName,
        queue_status: status,
        success: false,
      })
    },
  })
}

export function usePurgeQueue() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async ({
      queueName,
      confirmName,
      statuses,
      keepMostRecent = 0,
    }: {
      queueName: string
      confirmName: string
      statuses: PurgeQueueStatusOption[]
      keepMostRecent?: number
    }) => {
      const res = await api.c[':connectionId'].queues[':queueName'].purge.$post({
        param: { connectionId: connectionId!, queueName },
        json: { confirmName, statuses, keepMostRecent },
      })
      return handleRes<PurgeQueueResponse>(res)
    },
    onSuccess: (data, { queueName, statuses, keepMostRecent = 0 }) => {
      trackEvent(AnalyticsEvents.QUEUE_PURGED, {
        queue_name: queueName,
        queue_status: statuses.includes('all') ? 'all' : statuses.join(','),
        job_count: data.totalRemoved,
        keep_most_recent: keepMostRecent,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.queue(connectionId ?? '', queueName) })
      queryClient.invalidateQueries({ queryKey: queryKeys.queues(connectionId ?? '') })
      queryClient.invalidateQueries({ queryKey: ['jobs', connectionId, queueName] })
      queryClient.invalidateQueries({ queryKey: ['canDeleteQueue', connectionId, queueName] })
    },
    onError: (_, { queueName, statuses, keepMostRecent = 0 }) => {
      trackEvent(AnalyticsEvents.QUEUE_PURGED, {
        queue_name: queueName,
        queue_status: statuses.includes('all') ? 'all' : statuses.join(','),
        keep_most_recent: keepMostRecent,
        success: false,
      })
    },
  })
}

export function useObliterateQueue() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async (queueName: string) => {
      const res = await api.c[':connectionId'].queues[':queueName'].obliterate.$post({
        param: { connectionId: connectionId!, queueName },
      })
      return handleRes<{ success: boolean; message: string }>(res)
    },
    onSuccess: (_, queueName) => {
      trackEvent(AnalyticsEvents.QUEUE_OBLITERATED, {
        queue_name: queueName,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.queue(connectionId ?? '', queueName) })
      queryClient.invalidateQueries({ queryKey: queryKeys.queues(connectionId ?? '') })
      queryClient.invalidateQueries({ queryKey: ['jobs', connectionId, queueName] })
    },
    onError: (_, queueName) => {
      trackEvent(AnalyticsEvents.QUEUE_OBLITERATED, {
        queue_name: queueName,
        success: false,
      })
    },
  })
}

// Job Mutations
export function useRetryJobs() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async (
      payload:
        | { queueName: string; jobIds: Array<string> }
        | { queueName: string; statuses: RetryQueueStatusOption[] }
    ) => {
      const json = 'jobIds' in payload ? { jobIds: payload.jobIds } : { statuses: payload.statuses }
      const res = await api.c[':connectionId'].queues[':queueName'].jobs.retry.$post({
        param: { connectionId: connectionId!, queueName: payload.queueName },
        json,
      })
      return handleRes<{
        success: number
        failed: number
        errors: Array<{ jobId: string; error: string }>
        statusesRetried?: RetryQueueStatus[]
        retriedByStatus?: Partial<Record<RetryQueueStatus, number>>
      }>(res)
    },
    onSuccess: (data, payload) => {
      const queueName = payload.queueName
      const jobIds = 'jobIds' in payload ? payload.jobIds : []
      const jobCount = 'jobIds' in payload ? jobIds.length : data.success + data.failed

      trackEvent(AnalyticsEvents.JOBS_RETRIED, {
        queue_name: queueName,
        job_ids: jobIds,
        job_count: jobCount,
        success: data.failed === 0,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.queue(connectionId ?? '', queueName) })
      queryClient.invalidateQueries({ queryKey: ['jobs', connectionId, queueName] })
    },
    onError: (_, payload) => {
      const queueName = payload.queueName
      const jobIds = 'jobIds' in payload ? payload.jobIds : []
      trackEvent(AnalyticsEvents.JOBS_RETRIED, {
        queue_name: queueName,
        job_ids: jobIds,
        job_count: jobIds.length,
        success: false,
      })
    },
  })
}

export function useRemoveJobs() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async ({
      queueName,
      jobIds,
      removeScheduler,
    }: {
      queueName: string
      jobIds: Array<string>
      removeScheduler?: boolean
    }) => {
      const res = await api.c[':connectionId'].queues[':queueName'].jobs.remove.$post({
        param: { connectionId: connectionId!, queueName },
        json: { jobIds, removeScheduler },
      })
      return handleRes<{
        success: number
        failed: number
        errors: Array<{ jobId: string; error: string }>
        schedulersRemoved?: number
        warnings?: Array<{ jobId: string; message: string }>
      }>(res)
    },
    onSuccess: (data, { queueName, jobIds }) => {
      trackEvent(AnalyticsEvents.JOBS_REMOVED, {
        queue_name: queueName,
        job_ids: jobIds,
        job_count: jobIds.length,
        success: data.failed === 0,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.queue(connectionId ?? '', queueName) })
      queryClient.invalidateQueries({ queryKey: queryKeys.queues(connectionId ?? '') })
      queryClient.invalidateQueries({ queryKey: ['jobs', connectionId, queueName] })
      queryClient.invalidateQueries({
        queryKey: queryKeys.queueScheduledJobs(connectionId ?? '', queueName),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs(connectionId ?? '') })
    },
    onError: (_, { queueName, jobIds }) => {
      trackEvent(AnalyticsEvents.JOBS_REMOVED, {
        queue_name: queueName,
        job_ids: jobIds,
        job_count: jobIds.length,
        success: false,
      })
    },
  })
}

export function useClearJobLogs() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async ({
      queueName,
      jobId,
      keepMostRecent = 0,
    }: {
      queueName: string
      jobId: string
      keepMostRecent?: number
    }) => {
      const res = await api.c[':connectionId'].queues[':queueName'].jobs[':jobId'].logs.clear.$post(
        {
          param: { connectionId: connectionId!, queueName, jobId },
          json: { keepMostRecent },
        }
      )
      return handleRes<{ success: boolean; removed: number }>(res)
    },
    onSuccess: (_, { queueName, jobId, keepMostRecent = 0 }) => {
      trackEvent(AnalyticsEvents.JOB_LOGS_CLEARED, {
        queue_name: queueName,
        job_id: jobId,
        keep_most_recent: keepMostRecent,
        success: true,
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.jobLogs(connectionId ?? '', queueName, jobId),
      })
    },
    onError: (error, { queueName, jobId }) => {
      trackEvent(AnalyticsEvents.JOB_LOGS_CLEARED, {
        queue_name: queueName,
        job_id: jobId,
        success: false,
        error_message: error.message,
      })
    },
  })
}

export function useClearJobStacktraces() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async ({
      queueName,
      jobId,
      keepMostRecent = 0,
    }: {
      queueName: string
      jobId: string
      keepMostRecent?: number
    }) => {
      const res = await api.c[':connectionId'].queues[':queueName'].jobs[
        ':jobId'
      ].stacktraces.clear.$post({
        param: { connectionId: connectionId!, queueName, jobId },
        json: { keepMostRecent },
      })
      return handleRes<{ success: boolean; removed: number; kept: number }>(res)
    },
    onSuccess: (_, { queueName, jobId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.jobStacktraces(connectionId ?? '', queueName, jobId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.job(connectionId ?? '', queueName, jobId),
      })
    },
  })
}

export function useInvokeJobs() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async ({
      queueName,
      jobIds,
      jobData,
    }: {
      queueName: string
      jobIds: Array<string>
      jobData?: Record<string, unknown>
    }) => {
      const res = await api.c[':connectionId'].queues[':queueName'].jobs.invoke.$post({
        param: { connectionId: connectionId!, queueName },
        json: { jobIds, jobData },
      })
      return handleRes<{
        success: number
        failed: number
        errors: Array<{ jobId: string; error: string }>
      }>(res)
    },
    onSuccess: (data, { queueName, jobIds }) => {
      trackEvent(AnalyticsEvents.JOBS_INVOKED, {
        queue_name: queueName,
        job_ids: jobIds,
        job_count: jobIds.length,
        success: data.failed === 0,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.queue(connectionId ?? '', queueName) })
      queryClient.invalidateQueries({ queryKey: ['jobs', connectionId, queueName] })
    },
    onError: (_, { queueName, jobIds }) => {
      trackEvent(AnalyticsEvents.JOBS_INVOKED, {
        queue_name: queueName,
        job_ids: jobIds,
        job_count: jobIds.length,
        success: false,
      })
    },
  })
}

export function useAddJob() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async ({
      queueName,
      name,
      jobData,
      options,
    }: {
      queueName: string
      name: string
      jobData: unknown
      options?: JobOptionsInput
    }) => {
      const res = await api.c[':connectionId'].queues[':queueName'].jobs.$post({
        param: { connectionId: connectionId!, queueName },
        json: { name, data: jobData, ...options },
      })
      return handleRes<{ jobId: string | undefined; queueName: string; jobName: string }>(res)
    },
    onSuccess: (data, { queueName }) => {
      trackEvent(AnalyticsEvents.JOB_ADDED, {
        queue_name: queueName,
        job_id: data.jobId,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.queue(connectionId ?? '', queueName) })
      queryClient.invalidateQueries({ queryKey: queryKeys.queues(connectionId ?? '') })
      queryClient.invalidateQueries({ queryKey: ['jobs', connectionId, queueName] })
    },
    onError: (_, { queueName }) => {
      trackEvent(AnalyticsEvents.JOB_ADDED, {
        queue_name: queueName,
        success: false,
      })
    },
  })
}

// Scheduled Job Mutations
export function useRemoveScheduledJob() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async ({ queueName, schedulerId }: { queueName: string; schedulerId: string }) => {
      const res = await api.c[':connectionId']['scheduled-jobs'].queue[':queueName'][
        ':schedulerId'
      ].$delete({
        param: { connectionId: connectionId!, queueName, schedulerId },
      })
      return handleRes<{ success: boolean; schedulerId: string; message: string }>(res)
    },
    onSuccess: (_, { queueName, schedulerId }) => {
      trackEvent(AnalyticsEvents.SCHEDULED_JOB_REMOVED, {
        queue_name: queueName,
        scheduler_id: schedulerId,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs(connectionId ?? '') })
      queryClient.invalidateQueries({
        queryKey: queryKeys.queueScheduledJobs(connectionId ?? '', queueName),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.queueScheduledJob(connectionId ?? '', queueName, schedulerId),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.queue(connectionId ?? '', queueName) })
    },
    onError: (_, { queueName, schedulerId }) => {
      trackEvent(AnalyticsEvents.SCHEDULED_JOB_REMOVED, {
        queue_name: queueName,
        scheduler_id: schedulerId,
        success: false,
      })
    },
  })
}

export type ScheduledJobScheduleInput =
  | {
      type: 'cron'
      pattern: string
      timezone?: string
      immediately?: boolean
      startDate?: string
      endDate?: string
      limit?: number
    }
  | {
      type: 'every'
      everyMs: number
      startDate?: string
      endDate?: string
      limit?: number
    }

export type ScheduledJobTemplateOptionsInput = Omit<JobOptionsInput, 'delay'>

export interface ScheduledJobMutationInput {
  queueName: string
  schedulerId: string
  name: string
  data: unknown
  schedule: ScheduledJobScheduleInput
  options?: ScheduledJobTemplateOptionsInput
}

export interface ScheduledJobMutationResponse {
  success: boolean
  scheduler: {
    schedulerId: string
    pattern?: string
    every?: number
    queueName: string
    jobName: string
    nextRun?: number
    enabled: boolean
    data?: unknown
    templateOptions?: Record<string, unknown>
    timezone?: string
    startDate?: number
    endDate?: number
    limit?: number
    iterationCount?: number
    recentFailedCount: number
    lastFailedAt?: number
  }
}

export function useCreateScheduledJob() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async ({
      queueName,
      schedulerId,
      name,
      data,
      schedule,
      options,
    }: ScheduledJobMutationInput) => {
      const res = await api.c[':connectionId']['scheduled-jobs'].queue[':queueName'].$post({
        param: { connectionId: connectionId!, queueName },
        json: { schedulerId, name, data, schedule, options },
      })
      return handleRes<ScheduledJobMutationResponse>(res)
    },
    onSuccess: (data, { queueName }) => {
      trackEvent(AnalyticsEvents.SCHEDULED_JOB_CREATED, {
        queue_name: queueName,
        scheduler_id: data.scheduler.schedulerId,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs(connectionId ?? '') })
      queryClient.invalidateQueries({
        queryKey: queryKeys.queueScheduledJobs(connectionId ?? '', queueName),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.queue(connectionId ?? '', queueName) })
      queryClient.invalidateQueries({ queryKey: queryKeys.queues(connectionId ?? '') })
    },
    onError: (_, { queueName, schedulerId }) => {
      trackEvent(AnalyticsEvents.SCHEDULED_JOB_CREATED, {
        queue_name: queueName,
        scheduler_id: schedulerId,
        success: false,
      })
    },
  })
}

export function useUpdateScheduledJob() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async ({
      queueName,
      schedulerId,
      name,
      data,
      schedule,
      options,
    }: ScheduledJobMutationInput) => {
      const res = await api.c[':connectionId']['scheduled-jobs'].queue[':queueName'][
        ':schedulerId'
      ].$put({
        param: { connectionId: connectionId!, queueName, schedulerId },
        json: { name, data, schedule, options },
      })
      return handleRes<ScheduledJobMutationResponse>(res)
    },
    onSuccess: (_data, { queueName, schedulerId }) => {
      trackEvent(AnalyticsEvents.SCHEDULED_JOB_UPDATED, {
        queue_name: queueName,
        scheduler_id: schedulerId,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledJobs(connectionId ?? '') })
      queryClient.invalidateQueries({
        queryKey: queryKeys.queueScheduledJobs(connectionId ?? '', queueName),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.queueScheduledJob(connectionId ?? '', queueName, schedulerId),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.queue(connectionId ?? '', queueName) })
      queryClient.invalidateQueries({ queryKey: queryKeys.queues(connectionId ?? '') })
    },
    onError: (_, { queueName, schedulerId }) => {
      trackEvent(AnalyticsEvents.SCHEDULED_JOB_UPDATED, {
        queue_name: queueName,
        scheduler_id: schedulerId,
        success: false,
      })
    },
  })
}

// Check if queue can be deleted
export function useCanDeleteQueue(queueName: string) {
  const connectionId = useConnectionIdFromContextOrRoute()

  return useQuery({
    queryKey: ['canDeleteQueue', connectionId, queueName],
    queryFn: async () => {
      const res = await api.c[':connectionId'].queues[':queueName']['can-delete'].$get({
        param: { connectionId: connectionId!, queueName },
      })
      return handleRes<CanDeleteQueueResponse>(res)
    },
    enabled: !!queueName && !!connectionId,
  })
}

// Delete queue mutation
export function useDeleteQueue() {
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()

  return useMutation({
    mutationFn: async ({ queueName, confirmName }: { queueName: string; confirmName: string }) => {
      const res = await api.c[':connectionId'].queues[':queueName'].$delete({
        param: { connectionId: connectionId!, queueName },
        json: { confirmName },
      })
      return handleRes<{ success: boolean; deleted: string }>(res)
    },
    onSuccess: (_, { queueName }) => {
      trackEvent(AnalyticsEvents.QUEUE_DELETED, {
        queue_name: queueName,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.queues(connectionId ?? '') })
    },
    onError: (_, { queueName }) => {
      trackEvent(AnalyticsEvents.QUEUE_DELETED, {
        queue_name: queueName,
        success: false,
      })
    },
  })
}
