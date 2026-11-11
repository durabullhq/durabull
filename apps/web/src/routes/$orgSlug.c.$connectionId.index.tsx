import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { AlertCircle, Layers, Loader2, Radar } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAppTopBar } from '@/components/app-top-bar'
import { PageTitle } from '@/components/page-title'
import { QueueTable } from '@/components/queue-table'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Metric, MetricStrip } from '@/components/ui/metric'
import { Panel } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import {
  QUEUE_SORT_FIELDS,
  type QueueSortField,
  type QueueSortOrder,
  type QueueStatusFilter,
  useDiscoverQueues,
  useQueueDiscoveryStatus,
  useQueues,
} from '@/hooks/use-queues'
import { REDIS_CONNECTION_ERROR_MESSAGE } from '@/lib/api'
import { PAGINATION } from '@/lib/constants'
import {
  getDefaultQueuesView,
  isSameQueuesView,
  saveDefaultQueuesView,
} from '@/lib/queues-default-view'
import { cn, formatNumber } from '@/lib/utils'

const AUTO_DISCOVERY_MIN_INTERVAL_MS = 5 * 60 * 1000
const QUEUE_DISCOVERY_TOAST_ID = 'queue-discovery'
const RELATIVE_TIME_TICK_MS = 30 * 1000

/** "just now", "2m ago", "3h ago", "5d ago" — the full timestamp lives in the title. */
function formatRelativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function isRedisConnectionFailure(message: string): boolean {
  const normalized = message.toLowerCase()
  return [
    'failed to connect to redis',
    'unable to connect to redis',
    'redis connection failed recently',
    'invalid username-password pair',
    'authentication failed',
    'wrongpass',
    'noauth',
    'allowlist',
    'econnrefused',
    'enotfound',
    'etimedout',
  ].some((indicator) => normalized.includes(indicator))
}

// Missing/invalid params fall back to the user's saved default view
const dashboardSearchSchema = z.object({
  page: z.number().int().positive().catch(1),
  q: z.string().catch(() => getDefaultQueuesView().q),
  status: z.enum(['', 'active', 'paused']).catch(() => getDefaultQueuesView().status),
  sortBy: z.enum(QUEUE_SORT_FIELDS).catch(() => getDefaultQueuesView().sortBy),
  sortOrder: z.enum(['asc', 'desc']).catch(() => getDefaultQueuesView().sortOrder),
})

export const Route = createFileRoute('/$orgSlug/c/$connectionId/')({
  validateSearch: zodValidator(dashboardSearchSchema),
  component: Dashboard,
})

function Dashboard() {
  const routeParams = useParams({ strict: false }) as { connectionId?: string }
  const connectionId = routeParams.connectionId ?? ''
  const { page, q, status, sortBy, sortOrder } = Route.useSearch()
  const navigate = useNavigate()

  const updateSearch = useCallback(
    (patch: Partial<z.infer<typeof dashboardSearchSchema>>) => {
      void navigate({
        from: Route.fullPath,
        search: (prev) => ({ ...prev, ...patch }),
        replace: true,
      })
    },
    [navigate]
  )

  const setPage = useCallback(
    (nextPage: number) => updateSearch({ page: nextPage }),
    [updateSearch]
  )

  // Any change to filters or sorting invalidates the current page offset
  const handleSortChange = useCallback(
    (nextSortBy: QueueSortField, nextSortOrder: QueueSortOrder) =>
      updateSearch({ sortBy: nextSortBy, sortOrder: nextSortOrder, page: 1 }),
    [updateSearch]
  )
  const handleSearchChange = useCallback(
    (nextSearch: string) => updateSearch({ q: nextSearch, page: 1 }),
    [updateSearch]
  )
  const handleStatusFilterChange = useCallback(
    (nextStatus: QueueStatusFilter | '') => updateSearch({ status: nextStatus, page: 1 }),
    [updateSearch]
  )

  const [savedView, setSavedView] = useState(getDefaultQueuesView)
  const currentView = useMemo(
    () => ({ q, status, sortBy, sortOrder }),
    [q, status, sortBy, sortOrder]
  )
  const isCurrentViewSaved = isSameQueuesView(currentView, savedView)
  const handleSaveDefaultView = useCallback(() => {
    trackEvent(AnalyticsEvents.QUEUE_LIST_DEFAULT_VIEW_SAVED, {
      sort_by: currentView.sortBy,
      sort_order: currentView.sortOrder,
      status: currentView.status || 'all',
      has_search: currentView.q !== '',
    })
    saveDefaultQueuesView(currentView)
    setSavedView(currentView)
  }, [currentView])

  const { data, isLoading, error, isPlaceholderData } = useQueues({
    page,
    pageSize: PAGINATION.QUEUES_PAGE_SIZE,
    sortBy,
    sortOrder,
    search: q || undefined,
    status: status || undefined,
  })
  const discoveryQuery = useQueueDiscoveryStatus()
  const discoverMutation = useDiscoverQueues()
  const hasAutoTriggeredDiscovery = useRef(false)
  const wasDiscoveryRunningRef = useRef(false)
  const lastDiscoveryErrorShownRef = useRef<string | null>(null)
  const discoveryPendingCount = Math.max(
    discoveryQuery.data?.indexed.pending ?? 0,
    data?.discovery?.indexed.pending ?? 0
  )
  const backendDiscoveryRunning =
    (discoveryQuery.data?.running ?? false) || (data?.discovery?.running ?? false)
  const discoveryRunning =
    discoverMutation.isPending || backendDiscoveryRunning || discoveryPendingCount > 0
  const discoveryErrorMessage = discoveryQuery.data?.lastError ?? data?.discovery?.lastError ?? null
  const lastDiscoveryAt =
    discoveryQuery.data?.indexed.lastDiscoveredAt ??
    data?.discovery?.indexed.lastDiscoveredAt ??
    discoveryQuery.data?.completedAt ??
    data?.discovery?.completedAt ??
    null
  const hasRecentDiscovery =
    lastDiscoveryAt !== null && Date.now() - lastDiscoveryAt < AUTO_DISCOVERY_MIN_INTERVAL_MS
  // Re-render on a slow tick so the relative discovery time stays honest between polls.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), RELATIVE_TIME_TICK_MS)
    return () => clearInterval(interval)
  }, [])
  const lastDiscoveryLabel = lastDiscoveryAt
    ? `Discovered ${formatRelativeTime(lastDiscoveryAt, now)}`
    : 'Not discovered yet'
  const lastDiscoveryTitle = lastDiscoveryAt
    ? `Last discovery: ${new Date(lastDiscoveryAt).toLocaleString()}`
    : 'Discovery has not run for this connection yet'

  useEffect(() => {
    if (!connectionId) return
    hasAutoTriggeredDiscovery.current = false
    setPage(1)
  }, [connectionId, setPage])

  useEffect(() => {
    if (hasAutoTriggeredDiscovery.current) return
    if (isLoading) return
    if (!data) return
    if (discoveryRunning) return
    if (hasRecentDiscovery) return

    hasAutoTriggeredDiscovery.current = true
    discoverMutation.mutate()
  }, [data, discoverMutation, discoveryRunning, hasRecentDiscovery, isLoading])

  useEffect(() => {
    if (discoveryRunning) {
      lastDiscoveryErrorShownRef.current = null
      toast.loading(
        'Discovering queues in Redis. Pending queues will appear dimmed until confirmed.',
        { id: QUEUE_DISCOVERY_TOAST_ID }
      )
      wasDiscoveryRunningRef.current = true
      return
    }

    if (wasDiscoveryRunningRef.current) {
      toast.dismiss(QUEUE_DISCOVERY_TOAST_ID)
      wasDiscoveryRunningRef.current = false

      if (discoveryErrorMessage) {
        lastDiscoveryErrorShownRef.current = discoveryErrorMessage
        toast.error(`Discovery failed: ${discoveryErrorMessage}`)
      }
      return
    }

    if (discoveryErrorMessage && discoveryErrorMessage !== lastDiscoveryErrorShownRef.current) {
      lastDiscoveryErrorShownRef.current = discoveryErrorMessage
      toast.error(`Discovery failed: ${discoveryErrorMessage}`)
    }
  }, [discoveryRunning, discoveryErrorMessage])

  useEffect(() => {
    return () => {
      toast.dismiss(QUEUE_DISCOVERY_TOAST_ID)
    }
  }, [connectionId])

  const queueTotal = data?.total
  const queueTotalUnfiltered = data?.totalUnfiltered ?? data?.total
  const handleDiscover = useCallback(() => discoverMutation.mutate(), [discoverMutation])

  const topBarConfig = useMemo(
    () => ({
      left: (
        <PageTitle
          title="Queues"
          meta={
            queueTotalUnfiltered !== undefined ? (
              <span
                className="font-mono text-xs tabular-nums text-muted-foreground"
                title={
                  queueTotal !== queueTotalUnfiltered
                    ? `${queueTotal} of ${queueTotalUnfiltered} queues match the current filters`
                    : `${queueTotalUnfiltered} queues`
                }
              >
                {queueTotal !== undefined && queueTotal !== queueTotalUnfiltered
                  ? `${formatNumber(queueTotal)} of ${formatNumber(queueTotalUnfiltered)}`
                  : formatNumber(queueTotalUnfiltered)}
              </span>
            ) : null
          }
        />
      ),
      actions: (
        <>
          <span
            className={cn(
              'hidden whitespace-nowrap text-xs lg:inline',
              discoveryErrorMessage && !discoveryRunning
                ? 'text-status-danger'
                : 'text-muted-foreground'
            )}
            title={
              discoveryErrorMessage && !discoveryRunning
                ? `Discovery failed: ${discoveryErrorMessage}`
                : lastDiscoveryTitle
            }
          >
            {discoveryErrorMessage && !discoveryRunning ? 'Discovery failed' : lastDiscoveryLabel}
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={handleDiscover}
            disabled={discoveryRunning}
            aria-busy={discoveryRunning}
            title="Scan Redis for BullMQ queues"
          >
            {discoveryRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Radar className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {discoveryRunning ? 'Discovering…' : 'Discover'}
          </Button>
        </>
      ),
      mobileActions: (
        <DropdownMenuItem onClick={handleDiscover} disabled={discoveryRunning}>
          <Radar />
          {discoveryRunning ? 'Discovering…' : 'Discover queues'}
        </DropdownMenuItem>
      ),
    }),
    [
      discoveryErrorMessage,
      discoveryRunning,
      handleDiscover,
      lastDiscoveryLabel,
      lastDiscoveryTitle,
      queueTotal,
      queueTotalUnfiltered,
    ]
  )

  useAppTopBar(topBarConfig)

  const shouldShowConnectionFailure =
    !error &&
    !isLoading &&
    (data?.totalUnfiltered ?? data?.total ?? 0) === 0 &&
    !discoveryRunning &&
    !!discoveryErrorMessage &&
    isRedisConnectionFailure(discoveryErrorMessage)

  if (error || shouldShowConnectionFailure) {
    const message = error?.message ?? REDIS_CONNECTION_ERROR_MESSAGE
    return (
      <EmptyState
        icon={AlertCircle}
        tone="danger"
        title="Failed to load queues"
        description={message}
        actions={
          error ? undefined : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDiscover}
              disabled={discoveryRunning}
            >
              <Radar className="h-4 w-4" aria-hidden="true" />
              Retry discovery
            </Button>
          )
        }
      />
    )
  }

  const queues = data?.queues ?? []
  const totals = data?.totalJobCounts ?? {
    waiting: 0,
    active: 0,
    failed: 0,
    delayed: 0,
    completed: 0,
    prioritized: 0,
  }
  const hasNoQueues = !isLoading && (data?.totalUnfiltered ?? data?.total ?? 0) === 0

  return (
    // md+: the page fills the viewport and the table scrolls inside its panel.
    // Below md the page scrolls as a whole so the table is not squeezed under the metrics.
    <div className="flex flex-col gap-4 max-md:pb-4 md:h-full md:min-h-0">
      {/* Fleet totals across every queue on this connection, not just the current page */}
      <MetricStrip className="shrink-0">
        <Metric
          label="Waiting"
          value={formatNumber(totals.waiting)}
          loading={isLoading}
          title="Jobs waiting to be processed"
        />
        <Metric
          label="Prioritized"
          value={formatNumber(totals.prioritized)}
          tone="priority"
          loading={isLoading}
          title="Prioritized jobs waiting ahead of the standard queue"
        />
        <Metric
          label="Active"
          value={formatNumber(totals.active)}
          tone="active"
          pulse={totals.active > 0}
          loading={isLoading}
          title="Jobs currently being processed"
        />
        <Metric
          label="Delayed"
          value={formatNumber(totals.delayed)}
          tone="delayed"
          loading={isLoading}
          title="Jobs scheduled for later"
        />
        <Metric
          label="Completed"
          value={formatNumber(totals.completed)}
          tone="success"
          loading={isLoading}
          title="Successfully completed jobs"
        />
        <Metric
          label="Failed"
          value={formatNumber(totals.failed)}
          tone="danger"
          emphasis={totals.failed > 0}
          loading={isLoading}
          title="Jobs that failed to process"
        />
      </MetricStrip>

      {isLoading ? (
        <Panel aria-busy="true">
          <div className="flex h-11 items-center gap-2 border-b px-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-8 w-40" />
          </div>
          <div className="divide-y">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="flex h-10 items-center gap-6 px-4">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3.5 w-14" />
                <div className="ml-auto flex items-center gap-10">
                  {[1, 2, 3, 4, 5, 6].map((j) => (
                    <Skeleton key={j} className="hidden h-3.5 w-10 sm:block" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : hasNoQueues ? (
        <EmptyState
          icon={Layers}
          title="No queues found"
          description="No BullMQ queues were detected on this connection. Queues appear here once your application creates them — check that the Redis connection and key prefix match your workers, then run discovery again."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={handleDiscover}
              disabled={discoveryRunning}
            >
              {discoveryRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Radar className="h-4 w-4" aria-hidden="true" />
              )}
              {discoveryRunning ? 'Discovering…' : 'Discover queues'}
            </Button>
          }
        />
      ) : (
        <QueueTable
          queues={queues}
          page={data?.page ?? 1}
          totalPages={data?.totalPages ?? 1}
          total={data?.total ?? 0}
          isPlaceholderData={isPlaceholderData}
          onPageChange={setPage}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          search={q}
          onSearchChange={handleSearchChange}
          statusFilter={status}
          onStatusFilterChange={handleStatusFilterChange}
          onSaveDefaultView={isCurrentViewSaved ? undefined : handleSaveDefaultView}
        />
      )}
    </div>
  )
}
