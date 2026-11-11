import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Check,
  Copy,
  Eraser,
  Gauge,
  Layers,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  SearchX,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { z } from 'zod'
import { AddJobDialog } from '@/components/add-job-dialog'
import { SERIES_COLOR } from '@/components/analytics/chart-panel'
import { useAppTopBar } from '@/components/app-top-bar'
import { DeleteQueueDialog } from '@/components/delete-queue-dialog'
import { JobRemoveButton } from '@/components/job-remove-button'
import { PageTitle } from '@/components/page-title'
import { PurgeQueueDialog } from '@/components/purge-queue-dialog'
import { RetryQueueDialog } from '@/components/retry-queue-dialog'
import { StatusIndicator } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Metric, MetricStrip } from '@/components/ui/metric'
import { Panel, PanelHeader } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  type ListScheduledJobsResponse,
  useInvokeJobs,
  useJobs,
  usePauseQueue,
  useQueue,
  useQueueMetrics,
  useQueueScheduledJobs,
  useRemoveJobs,
  useResumeQueue,
  useRetryJobs,
} from '@/hooks/use-queues'
import { getScheduleExpression, getScheduleSummary } from '@/lib/scheduled-jobs'
import { cn, formatDate, formatNumber, getTimezoneAbbreviation } from '@/lib/utils'

const queueSearchSchema = z.object({
  section: z.enum(['jobs', 'observability']).catch('jobs'),
  tab: z.enum(['jobs', 'scheduled']).catch('jobs'),
  status: z.enum(['', 'waiting', 'active', 'delayed', 'completed', 'failed']).catch(''),
  jobId: z.string().catch(''),
  name: z.string().catch(''),
  data: z.string().catch(''),
  hideScheduled: z
    .union([z.literal(0), z.literal(1), z.literal('0'), z.literal('1')])
    .transform((value) => (value === 1 || value === '1' ? 1 : 0))
    .catch(0),
  page: z.number().int().positive().catch(1),
})

const METRICS_WINDOWS = [
  { label: '1H', value: '1h', minutes: 60 },
  { label: '6H', value: '6h', minutes: 360 },
  { label: '24H', value: '24h', minutes: 1440 },
  { label: '7D', value: '7d', minutes: 10080 },
  { label: '14D', value: '14d', minutes: 20160 },
  { label: '30D', value: '30d', minutes: 43200 },
  { label: 'ALL', value: 'all', minutes: null },
] as const

const PRIORITY_BUCKETS = [1, 2, 5, 10, 20, 50]

const chartConfig = {
  completed: { label: 'Completed/min', color: SERIES_COLOR.completed },
  failed: { label: 'Failed/min', color: SERIES_COLOR.failed },
  // Total is not a job state, so it takes a categorical colour.
  total: { label: 'Finished/min', color: 'var(--color-chart-2)' },
} satisfies ChartConfig

type JobStatusFilter = z.infer<typeof queueSearchSchema>['status']

/** Sticky header cells need an opaque fill that still reads as the standard muted table header. */
const STICKY_HEAD_CLASS =
  'sticky top-0 z-10 [background:color-mix(in_srgb,var(--color-muted)_40%,var(--color-card))] shadow-[inset_0_-1px_0_0_var(--color-border)]'

const CHECKBOX_CLASS = 'h-3.5 w-3.5 shrink-0 cursor-pointer accent-foreground'

/** Seven cells leave a hole in the 2- and 3-column strip layouts; the last cell fills its row. */
const STRIP_LAST_OF_SEVEN_CLASS = 'col-span-2 sm:col-span-3 lg:col-span-1'

export const Route = createFileRoute('/$orgSlug/c/$connectionId/queues/$queueName')({
  validateSearch: zodValidator(queueSearchSchema),
  component: QueueDetailPage,
})

function QueueDetailPage() {
  const { orgSlug, connectionId, queueName } = Route.useParams()
  const {
    section,
    tab,
    status,
    jobId,
    name = '',
    data: dataSearch = '',
    hideScheduled,
    page,
  } = Route.useSearch()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set())
  const [jobIdInput, setJobIdInput] = useState(jobId)
  const [nameInput, setNameInput] = useState(name)
  const [dataInput, setDataInput] = useState(dataSearch)
  const [addJobDialogOpen, setAddJobDialogOpen] = useState(false)
  const [retryDialogOpen, setRetryDialogOpen] = useState(false)
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [metricsWindowValue, setMetricsWindowValue] =
    useState<(typeof METRICS_WINDOWS)[number]['value']>('6h')
  const [includePrometheusMetrics, setIncludePrometheusMetrics] = useState(false)
  const [prometheusCopied, setPrometheusCopied] = useState(false)
  const [prometheusExpanded, setPrometheusExpanded] = useState(false)
  const selectedMetricsWindow = useMemo(
    () =>
      METRICS_WINDOWS.find((window) => window.value === metricsWindowValue) ?? METRICS_WINDOWS[1],
    [metricsWindowValue]
  )
  const metricsWindowMinutes = selectedMetricsWindow.minutes
  const usingAllRetainedWindow = metricsWindowValue === 'all'

  const isOnChildRoute =
    matchRoute({
      to: '/$orgSlug/c/$connectionId/queues/$queueName/jobs/$jobId',
      fuzzy: true,
    }) ||
    matchRoute({
      to: '/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/new',
      fuzzy: true,
    }) ||
    matchRoute({
      to: '/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/$schedulerId',
      fuzzy: true,
    })

  const { data: queue, isLoading: queueLoading, error: queueError } = useQueue(queueName)
  const {
    data: jobsData,
    isLoading: jobsLoading,
    error: jobsError,
    isFetchingNextPage: jobsFetchingNextPage,
    hasNextPage: hasMoreJobs,
    fetchNextPage: fetchNextJobsPage,
  } = useJobs(queueName, {
    status: status || undefined,
    jobId: jobId || undefined,
    name: name || undefined,
    data: dataSearch || undefined,
    pageSize: 20,
  })
  const {
    data: metrics,
    isLoading: metricsLoading,
    isFetching: metricsFetching,
    refetch: refetchMetrics,
  } = useQueueMetrics(queueName, {
    windowMinutes: metricsWindowMinutes ?? undefined,
    start: usingAllRetainedWindow ? 0 : undefined,
    end: usingAllRetainedWindow ? -1 : undefined,
    includePrometheus: includePrometheusMetrics,
    priorities: PRIORITY_BUCKETS,
  })
  const { data: scheduledJobs } = useQueueScheduledJobs(queueName)

  const pauseMutation = usePauseQueue()
  const resumeMutation = useResumeQueue()
  const retryMutation = useRetryJobs()
  const removeMutation = useRemoveJobs()
  const invokeMutation = useInvokeJobs()
  const hideScheduledJobs = hideScheduled === 1
  const hasClientSideJobFilter = Boolean(jobId || name || dataSearch)
  const [visibleJobCount, setVisibleJobCount] = useState(20)
  const allJobs = useMemo(
    () => jobsData?.pages.flatMap((pageData) => pageData.jobs) ?? [],
    [jobsData]
  )
  const filteredVisibleJobs = useMemo(
    () => allJobs.filter((job) => (hideScheduledJobs ? !job.id.startsWith('repeat:') : true)) ?? [],
    [allJobs, hideScheduledJobs]
  )
  const visibleJobs = useMemo(
    () =>
      hasClientSideJobFilter ? filteredVisibleJobs.slice(0, visibleJobCount) : filteredVisibleJobs,
    [filteredVisibleJobs, hasClientSideJobFilter, visibleJobCount]
  )
  const hasMoreVisibleJobs = hasClientSideJobFilter
    ? visibleJobs.length < filteredVisibleJobs.length
    : hasMoreJobs

  useEffect(() => {
    setVisibleJobCount(20)
  }, [jobId, name, dataSearch, status, hideScheduled, queueName])
  const jobsScrollRef = useRef<HTMLDivElement | null>(null)
  const metricsPoints = metrics?.series.points ?? []
  const metricsTotals = metrics?.series.totals
  const selectedWindowLabel = selectedMetricsWindow.label
  const chartWindowMinutes =
    metricsWindowMinutes ?? Math.max(metrics?.range.returnedPoints ?? 0, 1440)
  const windowStartTimestamp = metrics?.range.oldestPointTimestamp ?? null
  const windowEndTimestamp = metrics?.range.newestPointTimestamp ?? null
  const latestPointAgeMs = metrics?.range.latestPointAgeMs ?? null
  const requestedWindowCoverage = metrics?.range.requestedWindowCoverage
  const retainedMetricBuckets =
    metrics?.range.retainedPoints ??
    Math.max(metrics?.series.completed.count ?? 0, metrics?.series.failed.count ?? 0)
  const failedOutsideWindow = Math.max(
    (metricsTotals?.failedLifetime ?? 0) - (metricsTotals?.failedInWindow ?? 0),
    0
  )
  const backlogPerWorker =
    (metrics?.queue.workersCount ?? 0) > 0
      ? (metrics?.queue.waitingToProcess ?? 0) / (metrics?.queue.workersCount ?? 1)
      : null
  const metricsStale = latestPointAgeMs !== null ? latestPointAgeMs > 5 * 60 * 1000 : false
  const prometheusText = metrics?.prometheus.metrics ?? null
  const prometheusLineCount = useMemo(
    () =>
      prometheusText
        ? prometheusText.split('\n').filter((line) => line.trim().length > 0).length
        : 0,
    [prometheusText]
  )
  const prometheusByteSize = prometheusText ? new Blob([prometheusText]).size : 0
  const priorityRows = useMemo(
    () =>
      Object.entries(metrics?.priorities.counts ?? {})
        .map(([priority, count]) => ({
          priority: Number(priority),
          count,
        }))
        .filter((entry) => Number.isFinite(entry.priority))
        .sort((a, b) => a.priority - b.priority),
    [metrics?.priorities.counts]
  )
  const highestPriorityBucket = useMemo(
    () => priorityRows.reduce((max, row) => Math.max(max, row.count), 0),
    [priorityRows]
  )

  useEffect(() => {
    trackEvent(AnalyticsEvents.QUEUE_VIEWED, { queue_name: queueName })
  }, [queueName])

  useEffect(() => {
    if (section !== 'observability') {
      return
    }

    const interval = setInterval(() => {
      void refetchMetrics()
    }, 15000)

    return () => clearInterval(interval)
  }, [section, refetchMetrics])

  useEffect(() => {
    setJobIdInput(jobId)
  }, [jobId])

  useEffect(() => {
    setNameInput(name)
  }, [name])

  useEffect(() => {
    setDataInput(dataSearch)
  }, [dataSearch])

  const handleCopyPrometheus = useCallback(async () => {
    if (!prometheusText || typeof navigator === 'undefined' || !navigator.clipboard) {
      return
    }

    await navigator.clipboard.writeText(prometheusText)
    setPrometheusCopied(true)
    setTimeout(() => setPrometheusCopied(false), 1200)
  }, [prometheusText])

  useEffect(() => {
    const normalizedJobId = jobIdInput.trim()

    if (normalizedJobId === jobId) {
      return
    }

    const timer = setTimeout(() => {
      navigate({
        to: '.',
        search: {
          section,
          tab,
          status,
          jobId: normalizedJobId,
          name,
          data: dataSearch,
          hideScheduled,
          page: 1,
        },
        replace: true,
      })
    }, 300)

    return () => clearTimeout(timer)
  }, [jobIdInput, jobId, section, tab, status, name, dataSearch, hideScheduled, navigate])

  useEffect(() => {
    const normalizedName = nameInput.trim()

    if (normalizedName === name) {
      return
    }

    const timer = setTimeout(() => {
      navigate({
        to: '.',
        search: {
          section,
          tab,
          status,
          jobId,
          name: normalizedName,
          data: dataSearch,
          hideScheduled,
          page: 1,
        },
        replace: true,
      })
    }, 300)

    return () => clearTimeout(timer)
  }, [nameInput, name, section, tab, status, jobId, dataSearch, hideScheduled, navigate])

  useEffect(() => {
    const normalizedData = dataInput.trim()

    if (normalizedData === dataSearch) {
      return
    }

    const timer = setTimeout(() => {
      navigate({
        to: '.',
        search: { section, tab, status, jobId, name, data: normalizedData, hideScheduled, page: 1 },
        replace: true,
      })
    }, 300)

    return () => clearTimeout(timer)
  }, [dataInput, dataSearch, section, tab, status, jobId, name, hideScheduled, navigate])

  const loadMoreJobs = useCallback(() => {
    if (hasClientSideJobFilter) {
      if (visibleJobs.length >= filteredVisibleJobs.length) {
        return
      }
      setVisibleJobCount((current) => Math.min(current + 20, filteredVisibleJobs.length))
      return
    }

    if (!hasMoreJobs || jobsFetchingNextPage) {
      return
    }

    void fetchNextJobsPage()
  }, [
    fetchNextJobsPage,
    hasMoreJobs,
    jobsFetchingNextPage,
    hasClientSideJobFilter,
    filteredVisibleJobs.length,
    visibleJobs.length,
  ])

  useEffect(() => {
    const container = jobsScrollRef.current
    if (!container || section !== 'jobs' || tab !== 'jobs') {
      return
    }

    const onScroll = () => {
      const nearBottom =
        container.scrollTop + container.clientHeight >= container.scrollHeight - 240
      if (nearBottom) {
        loadMoreJobs()
      }
    }

    container.addEventListener('scroll', onScroll)
    return () => container.removeEventListener('scroll', onScroll)
  }, [loadMoreJobs, section, tab])

  const updateSearch = useCallback(
    (patch: Partial<z.infer<typeof queueSearchSchema>>) =>
      navigate({
        to: '.',
        search: {
          section,
          tab,
          status,
          jobId,
          name,
          data: dataSearch,
          hideScheduled,
          page,
          ...patch,
        },
        replace: true,
      }),
    [navigate, section, tab, status, jobId, name, dataSearch, hideScheduled, page]
  )

  // Metric cells are the status filter: one click to filter, the same click again to clear.
  const handleStatusFilter = useCallback(
    (nextStatus: JobStatusFilter) => {
      trackEvent(AnalyticsEvents.JOB_STATUS_FILTERED, {
        queue_name: queueName,
        filter_status: nextStatus || 'all',
      })
      updateSearch({ section: 'jobs', tab: 'jobs', status: nextStatus, page: 1 })
    },
    [queueName, updateSearch]
  )

  const hasActiveFilters = Boolean(status || jobId || name || dataSearch)
  const clearFilters = useCallback(
    (options?: { includeHideScheduled?: boolean }) => {
      setJobIdInput('')
      setNameInput('')
      setDataInput('')
      updateSearch({
        status: '',
        jobId: '',
        name: '',
        data: '',
        page: 1,
        ...(options?.includeHideScheduled ? { hideScheduled: 0 as const } : {}),
      })
    },
    [updateSearch]
  )

  const handleTogglePause = useCallback(() => {
    if (queue?.isPaused) {
      resumeMutation.mutate(queueName)
    } else {
      pauseMutation.mutate(queueName)
    }
  }, [pauseMutation, queue?.isPaused, queueName, resumeMutation])

  const handleRetrySelected = () => {
    if (selectedJobs.size > 0) {
      retryMutation.mutate(
        { queueName, jobIds: Array.from(selectedJobs) },
        { onSuccess: () => setSelectedJobs(new Set()) }
      )
    }
  }

  const handleOpenScheduledJobCreate = useCallback(() => {
    navigate({
      to: '/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/new',
      params: { orgSlug, connectionId, queueName },
    })
  }, [connectionId, navigate, orgSlug, queueName])

  const workerCount = queue?.workers.length ?? 0
  const backlogCount =
    (queue?.jobCounts.waiting ?? 0) +
    (queue?.jobCounts.prioritized ?? 0) +
    (queue?.jobCounts.active ?? 0)
  // A backlog with nobody to work it is the one worker fact worth colouring.
  const isUnattended = !queueLoading && workerCount === 0 && backlogCount > 0
  const isPaused = queue?.isPaused ?? false
  const isTogglingPause = pauseMutation.isPending || resumeMutation.isPending

  const topBarConfig = useMemo(
    () => ({
      left: (
        <PageTitle
          crumbs={[{ label: 'Queues', to: `/${orgSlug}/c/${connectionId}` }]}
          title={queueName}
          mono
          meta={
            queueLoading ? (
              <Skeleton className="h-4 w-24" />
            ) : (
              <>
                <StatusIndicator status={isPaused ? 'paused' : 'active'} />
                <span
                  className={cn(
                    'hidden whitespace-nowrap text-xs sm:inline',
                    isUnattended ? 'text-status-warning' : 'text-muted-foreground'
                  )}
                  title={
                    isUnattended
                      ? 'Jobs are queued but no workers are connected to process them'
                      : `${workerCount} worker${workerCount === 1 ? '' : 's'} connected`
                  }
                >
                  <span className="font-mono tabular-nums">{formatNumber(workerCount)}</span>{' '}
                  {workerCount === 1 ? 'worker' : 'workers'}
                </span>
              </>
            )
          }
        />
      ),
      actions: (
        <>
          <Button
            variant="outline"
            size="xs"
            onClick={handleTogglePause}
            disabled={isTogglingPause}
          >
            {isPaused ? (
              <>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                Pause
              </>
            )}
          </Button>
          <Button size="xs" onClick={() => setAddJobDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add job
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="xs" className="w-7 px-0" aria-label="Queue actions">
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={handleOpenScheduledJobCreate}>
                <Repeat />
                Schedule job
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRetryDialogOpen(true)}>
                <RefreshCw />
                Retry jobs
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPurgeDialogOpen(true)}>
                <Eraser />
                Purge / Retain jobs
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 />
                Delete queue
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ),
      mobileActions: (
        <>
          <DropdownMenuItem onClick={() => setAddJobDialogOpen(true)}>
            <Plus />
            Add job
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleOpenScheduledJobCreate}>
            <Repeat />
            Schedule job
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleTogglePause} disabled={isTogglingPause}>
            {isPaused ? (
              <>
                <Play />
                Resume queue
              </>
            ) : (
              <>
                <Pause />
                Pause queue
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setRetryDialogOpen(true)}>
            <RefreshCw />
            Retry jobs
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPurgeDialogOpen(true)}>
            <Eraser />
            Purge / Retain jobs
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDeleteDialogOpen(true)}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 />
            Delete queue
          </DropdownMenuItem>
        </>
      ),
    }),
    [
      connectionId,
      orgSlug,
      isPaused,
      isTogglingPause,
      isUnattended,
      queueLoading,
      queueName,
      workerCount,
      handleOpenScheduledJobCreate,
      handleTogglePause,
    ]
  )

  useAppTopBar(topBarConfig)

  if (queueError) {
    return (
      <EmptyState
        icon={AlertCircle}
        tone="danger"
        title="Queue not found"
        description={queueError.message}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({ to: '/$orgSlug/c/$connectionId', params: { orgSlug, connectionId } })
            }
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to queues
          </Button>
        }
      />
    )
  }

  const handleRemoveSelected = (removeScheduler = false) => {
    if (selectedJobs.size > 0) {
      removeMutation.mutate(
        { queueName, jobIds: Array.from(selectedJobs), removeScheduler },
        { onSuccess: () => setSelectedJobs(new Set()) }
      )
    }
  }

  const handleInvokeSelected = () => {
    if (selectedJobs.size > 0) {
      invokeMutation.mutate(
        { queueName, jobIds: Array.from(selectedJobs) },
        { onSuccess: () => setSelectedJobs(new Set()) }
      )
    }
  }

  const toggleJobSelection = (jobId: string) => {
    const newSelected = new Set(selectedJobs)
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId)
    } else {
      newSelected.add(jobId)
    }
    setSelectedJobs(newSelected)
  }

  const toggleAllJobs = () => {
    if (!visibleJobs.length) return
    if (selectedJobs.size === visibleJobs.length) {
      setSelectedJobs(new Set())
    } else {
      setSelectedJobs(new Set(visibleJobs.map((j) => j.id)))
    }
  }

  // If we're on a child route (job detail), render the child via Outlet
  if (isOnChildRoute) {
    return <Outlet />
  }

  const isJobsList = section === 'jobs' && tab === 'jobs'
  const scheduledTotal = scheduledJobs?.total ?? 0
  const jobsTotal = jobsData?.pages[0]?.total ?? 0
  const hasSelection = selectedJobs.size > 0
  const selectionHasScheduledJobs = Array.from(selectedJobs).some((id) => id.startsWith('repeat:'))
  const timezone = getTimezoneAbbreviation()
  const warnings = metrics?.warnings ?? []

  const statusMetric = (filterStatus: Exclude<JobStatusFilter, ''>) => {
    const isActive = isJobsList && status === filterStatus
    return {
      onClick: () => handleStatusFilter(isActive ? '' : filterStatus),
      active: isActive,
      title: isActive ? 'Clear the status filter' : `Show only ${filterStatus} jobs`,
      'data-testid': `job-status-filter-${filterStatus}`,
    }
  }

  return (
    // Jobs on md+: the page fills the viewport and the table scrolls inside its panel.
    // Below md the page scrolls as a whole (the footer's "Load more" pages the list).
    <div
      className={
        section === 'jobs'
          ? 'flex flex-col gap-4 max-md:pb-4 md:h-full md:min-h-0'
          : 'space-y-4 max-md:pb-4'
      }
    >
      {/* Level 1: which view of the queue. Page-level, so it reads as text tabs on a hairline. */}
      <Tabs
        className="shrink-0"
        value={section}
        onValueChange={(newSection) => updateSearch({ section: newSection as typeof section })}
      >
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b">
          <TabsList className="h-9 gap-5 rounded-none border-0 bg-transparent p-0">
            <TabsTrigger
              value="jobs"
              aria-label="Queue section Jobs"
              className={sectionTabClass(section === 'jobs')}
            >
              Jobs
            </TabsTrigger>
            <TabsTrigger
              value="observability"
              aria-label="Queue section Observability"
              className={sectionTabClass(section === 'observability')}
            >
              Observability
            </TabsTrigger>
          </TabsList>

          {section === 'observability' ? (
            <div className="flex flex-wrap items-center gap-2 pb-1.5">
              <span className="hidden text-xs text-muted-foreground lg:inline">
                {metricsFetching ? 'Refreshing…' : 'Auto-refresh 15s'}
              </span>
              <Tabs
                value={metricsWindowValue}
                onValueChange={(value) =>
                  setMetricsWindowValue(value as (typeof METRICS_WINDOWS)[number]['value'])
                }
              >
                <TabsList role="group" aria-label="Metrics window" className="h-7">
                  {METRICS_WINDOWS.map((window) => (
                    <TabsTrigger
                      key={window.value}
                      value={window.value}
                      aria-pressed={metricsWindowValue === window.value}
                      className="px-2 font-mono text-[11px]"
                    >
                      {window.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Button
                size="xs"
                variant="outline"
                className="w-7 px-0"
                onClick={() => void refetchMetrics()}
                disabled={metricsFetching}
                aria-label="Refresh metrics"
                title="Refresh metrics"
              >
                <RefreshCw
                  className={cn('h-3.5 w-3.5', metricsFetching && 'animate-spin')}
                  aria-hidden="true"
                />
              </Button>
            </div>
          ) : null}
        </div>
      </Tabs>

      {section === 'jobs' && (
        <MetricStrip className="shrink-0">
          <Metric
            label="Waiting"
            value={formatNumber(queue?.jobCounts.waiting ?? 0)}
            loading={queueLoading}
            {...statusMetric('waiting')}
          />
          <Metric
            label="Active"
            value={formatNumber(queue?.jobCounts.active ?? 0)}
            tone="active"
            pulse={(queue?.jobCounts.active ?? 0) > 0}
            loading={queueLoading}
            {...statusMetric('active')}
          />
          <Metric
            label="Delayed"
            value={formatNumber(queue?.jobCounts.delayed ?? 0)}
            tone="delayed"
            loading={queueLoading}
            {...statusMetric('delayed')}
          />
          <Metric
            label="Completed"
            value={formatNumber(queue?.jobCounts.completed ?? 0)}
            tone="success"
            loading={queueLoading}
            {...statusMetric('completed')}
          />
          <Metric
            label="Failed"
            value={formatNumber(queue?.jobCounts.failed ?? 0)}
            tone="danger"
            emphasis={(queue?.jobCounts.failed ?? 0) > 0}
            loading={queueLoading}
            {...statusMetric('failed')}
          />
          <Metric
            label="Prioritized"
            value={formatNumber(queue?.jobCounts.prioritized ?? 0)}
            tone="priority"
            loading={queueLoading}
            title="Prioritized jobs waiting ahead of the standard queue"
          />
          <Metric
            label="Waiting children"
            value={formatNumber(metrics?.counts.waitingChildren ?? 0)}
            loading={metricsLoading}
            title="Parent jobs waiting for their child jobs to finish"
            className={STRIP_LAST_OF_SEVEN_CLASS}
          />
        </MetricStrip>
      )}

      {section === 'observability' && (
        <div className="space-y-4">
          {warnings.length ? (
            <div className="rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
              Some metrics were unavailable in this Redis environment: {warnings.join('; ')}
            </div>
          ) : null}

          <MetricStrip>
            <Metric
              label={`Finished · ${selectedWindowLabel}`}
              value={formatNumber(metricsTotals?.finishedInWindow ?? 0)}
              loading={metricsLoading}
              title="Completed + failed in the selected window"
            />
            <Metric
              label="Completed"
              value={formatNumber(metricsTotals?.completedInWindow ?? 0)}
              tone="success"
              loading={metricsLoading}
              title="BullMQ completed/min buckets in the selected window"
            />
            <Metric
              label="Failed"
              value={formatNumber(metricsTotals?.failedInWindow ?? 0)}
              tone="danger"
              emphasis={(metricsTotals?.failedInWindow ?? 0) > 0}
              loading={metricsLoading}
              title="BullMQ failed/min buckets in the selected window"
            />
            <Metric
              label="Success rate"
              value={formatPercentage(metricsTotals?.successRateInWindow)}
              loading={metricsLoading}
              title="From completed/failed buckets in the selected window"
            />
            <Metric
              label="Avg / min"
              value={formatRatePerMinute(metricsTotals?.avgFinishedPerMinuteInWindow)}
              loading={metricsLoading}
              title="Average finished jobs per minute"
            />
            <Metric
              label="Peak / min"
              value={formatNumber(metricsTotals?.peakFinishedPerMinuteInWindow ?? 0)}
              loading={metricsLoading}
              title="Highest finished count in one minute"
            />
            <Metric
              label="Drain ETA"
              value={formatMinutesDuration(metricsTotals?.estimatedDrainMinutes)}
              loading={metricsLoading}
              title="Waiting to process ÷ average throughput"
              className={STRIP_LAST_OF_SEVEN_CLASS}
            />
          </MetricStrip>

          <Panel>
            <PanelHeader>
              <div className="flex min-w-0 items-baseline gap-2">
                <h2 className="text-[13px] font-semibold tracking-tight">Throughput</h2>
                <span className="truncate text-xs text-muted-foreground">
                  1-minute buckets from BullMQ <code className="font-mono">getMetrics</code>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={metricsStale ? 'warning' : 'success'}>
                  Sample {formatAgeFromMs(latestPointAgeMs).toLowerCase()}
                </Badge>
                <Badge variant="outline">
                  Coverage {formatPercentage(requestedWindowCoverage ?? undefined)}
                </Badge>
              </div>
            </PanelHeader>
            <div className="p-4">
              {metricsLoading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : !metricsPoints.length ? (
                <EmptyState
                  size="inline"
                  icon={Gauge}
                  title="No native metrics yet"
                  description="Enable BullMQ worker metrics to populate this chart over time."
                  className="h-[280px]"
                  actions={
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href="https://docs.bullmq.io/guide/metrics"
                        target="_blank"
                        rel="noreferrer"
                      >
                        BullMQ metrics setup
                      </a>
                    </Button>
                  }
                />
              ) : (
                <ChartContainer config={chartConfig} className="h-[280px] w-full">
                  <AreaChart
                    data={metricsPoints}
                    margin={{ left: 8, right: 12, top: 10, bottom: 10 }}
                  >
                    <defs>
                      <linearGradient id="fill-total" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-total)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-total)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="fill-completed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="fill-failed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-failed)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="var(--color-failed)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                      tickFormatter={(value) =>
                        formatMetricAxisTime(Number(value), chartWindowMinutes)
                      }
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={42}
                      tickFormatter={(value) => formatCompactCount(Number(value))}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(value) => formatMetricTooltipLabel(Number(value))}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Area
                      dataKey="total"
                      type="monotone"
                      fill="url(#fill-total)"
                      fillOpacity={1}
                      stroke="var(--color-total)"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Area
                      dataKey="completed"
                      type="monotone"
                      fill="url(#fill-completed)"
                      fillOpacity={1}
                      stroke="var(--color-completed)"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Area
                      dataKey="failed"
                      type="monotone"
                      fill="url(#fill-failed)"
                      fillOpacity={1}
                      stroke="var(--color-failed)"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
              {windowStartTimestamp !== null && windowEndTimestamp !== null ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {selectedWindowLabel} window covers{' '}
                  <span className="font-mono">
                    {formatMetricTooltipLabel(windowStartTimestamp)}
                  </span>{' '}
                  to{' '}
                  <span className="font-mono">{formatMetricTooltipLabel(windowEndTimestamp)}</span>.
                  The jobs list is not time-filtered, so it can include failures older than this
                  range.
                </p>
              ) : null}
            </div>
          </Panel>

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="space-y-4">
              <FactPanel title={`Window detail · ${selectedWindowLabel}`}>
                <FactRow
                  label="Failure rate"
                  value={formatPercentage(metricsTotals?.failureRateInWindow)}
                />
                <FactRow
                  label="Peak failures / min"
                  value={formatNumber(metricsTotals?.peakFailedPerMinuteInWindow ?? 0)}
                />
                <FactRow
                  label="Minutes with failures"
                  value={formatNumber(metricsTotals?.minutesWithFailuresInWindow ?? 0)}
                />
                <FactRow
                  label="Longest failure streak"
                  value={formatMinutesDuration(metricsTotals?.longestFailureStreakMinutesInWindow)}
                />
                <FactRow label="Failed outside window" value={formatNumber(failedOutsideWindow)} />
                <FactRow
                  label="Finished (lifetime)"
                  value={formatNumber(metricsTotals?.finishedLifetime ?? 0)}
                />
                <FactRow
                  label="Failed (lifetime)"
                  value={formatNumber(metricsTotals?.failedLifetime ?? 0)}
                />
                <FactRow
                  label="Waiting to process"
                  value={formatNumber(metrics?.queue.waitingToProcess ?? 0)}
                />
                <FactRow label="Backlog / worker" value={formatDecimal(backlogPerWorker)} />
                <FactRow label="Retained buckets" value={formatNumber(retainedMetricBuckets)} />
              </FactPanel>

              <FactPanel title="Priority mix">
                {!priorityRows.length ? (
                  <p className="text-xs text-muted-foreground">
                    No jobs were found in the sampled priority buckets.
                  </p>
                ) : (
                  priorityRows.map((entry) => {
                    const width =
                      highestPriorityBucket > 0 ? (entry.count / highestPriorityBucket) * 100 : 0

                    return (
                      <div key={entry.priority} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-muted-foreground">P{entry.priority}</span>
                          <span className="font-mono tabular-nums">
                            {formatNumber(entry.count)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-status-priority transition-[width] duration-300"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </FactPanel>
            </div>

            <FactPanel title="Queue state">
              <FactRow
                label="Workers"
                value={formatNumber(metrics?.queue.workersCount ?? queue?.workers.length ?? 0)}
              />
              <FactRow
                label="Schedulers"
                value={formatNumber(
                  metrics?.queue.schedulersCount ?? queue?.scheduledJobsCount ?? 0
                )}
              />
              <FactRow label="Waiting (set)" value={formatNumber(metrics?.counts.waiting ?? 0)} />
              <FactRow label="Active (set)" value={formatNumber(metrics?.counts.active ?? 0)} />
              <FactRow label="Delayed (set)" value={formatNumber(metrics?.counts.delayed ?? 0)} />
              <FactRow
                label="Completed (set)"
                value={formatNumber(metrics?.counts.completed ?? 0)}
              />
              <FactRow label="Failed (set)" value={formatNumber(metrics?.counts.failed ?? 0)} />
              <FactRow
                label="Prioritized (set)"
                value={formatNumber(metrics?.counts.prioritized ?? 0)}
              />
              <FactRow label="Paused (set)" value={formatNumber(metrics?.counts.paused ?? 0)} />
              <FactRow
                label="Waiting children (set)"
                value={formatNumber(metrics?.counts.waitingChildren ?? 0)}
              />
              <FactRow
                label="Queue event clients"
                value={formatNumber(metrics?.queue.queueEventsCount ?? 0)}
              />
              <FactRow label="Rate limited" value={metrics?.controls.rateLimited ? 'Yes' : 'No'} />
              <FactRow
                label="Rate limit TTL"
                value={formatDurationFromMs(metrics?.controls.rateLimitTtlMs)}
              />
              <FactRow
                label="Global concurrency"
                value={metrics?.controls.globalConcurrency ?? 'Not set'}
              />
              <FactRow
                label="Global rate limit"
                value={formatGlobalRateLimit(metrics?.controls.globalRateLimit)}
              />
              <FactRow label="Queue maxed" value={metrics?.queue.isMaxed ? 'Yes' : 'No'} />
            </FactPanel>

            <FactPanel title="Native queue meta">
              <FactRow label="Requested window" value={selectedWindowLabel} />
              <FactRow label="All retained mode" value={usingAllRetainedWindow ? 'Yes' : 'No'} />
              <FactRow
                label="Returned buckets"
                value={formatNumber(metrics?.range.returnedPoints ?? 0)}
              />
              <FactRow label="Retained buckets" value={formatNumber(retainedMetricBuckets)} />
              <FactRow
                label="Window coverage"
                value={formatPercentage(requestedWindowCoverage ?? undefined)}
              />
              <FactRow label="Latest sample age" value={formatAgeFromMs(latestPointAgeMs)} />
              <FactRow
                label="Completed prevTS"
                value={formatMetricSourceTimestamp(metrics?.series.completed.meta.prevTS)}
              />
              <FactRow
                label="Failed prevTS"
                value={formatMetricSourceTimestamp(metrics?.series.failed.meta.prevTS)}
              />
              <FactRow
                label="Completed prevCount"
                value={formatNumber(metrics?.series.completed.meta.prevCount ?? 0)}
              />
              <FactRow
                label="Failed prevCount"
                value={formatNumber(metrics?.series.failed.meta.prevCount ?? 0)}
              />
              <FactRow label="Paused (meta)" value={formatNullableBoolean(metrics?.meta.paused)} />
              <FactRow label="Version" value={metrics?.meta.version ?? 'Unknown'} />
              <FactRow label="Concurrency (meta)" value={metrics?.meta.concurrency ?? 'Not set'} />
              <FactRow label="max (meta)" value={metrics?.meta.max ?? 'Not set'} />
              <FactRow
                label="duration (meta)"
                value={formatDurationFromMs(metrics?.meta.duration)}
              />
              <FactRow
                label="maxLenEvents (meta)"
                value={metrics?.meta.maxLenEvents ?? 'Not set'}
              />
              <FactRow label="Warnings" value={String(warnings.length)} />
            </FactPanel>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <ClientListPanel
              title="Worker clients"
              clients={metrics?.queue.workers ?? []}
              fallbackName="worker"
              emptyText="No worker clients reported via Redis CLIENT LIST metadata."
              overflowLabel="additional workers"
            />
            <ClientListPanel
              title="Queue event clients"
              clients={metrics?.queue.queueEvents ?? []}
              fallbackName="queue-event-client"
              emptyText="No queue event clients detected for this queue."
              overflowLabel="additional clients"
            />
          </div>

          <Panel>
            <PanelHeader>
              <div className="flex min-w-0 items-baseline gap-2">
                <h2 className="text-[13px] font-semibold tracking-tight">Prometheus export</h2>
                {prometheusText ? (
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatNumber(prometheusLineCount)} lines · {formatBytes(prometheusByteSize)}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  aria-pressed={includePrometheusMetrics}
                  onClick={() => setIncludePrometheusMetrics((current) => !current)}
                  className={cn(includePrometheusMetrics && 'bg-accent text-accent-foreground')}
                >
                  {includePrometheusMetrics ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : null}
                  {includePrometheusMetrics ? 'Included' : 'Include'}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void handleCopyPrometheus()}
                  disabled={!prometheusText}
                >
                  {prometheusCopied ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {prometheusCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </PanelHeader>
            {!includePrometheusMetrics ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                Include <code className="font-mono">queue.exportPrometheusMetrics()</code> in this
                payload to inspect or copy the raw exposition text.
              </p>
            ) : !prometheusText ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                Prometheus export is enabled, but no payload was returned for this queue.
              </p>
            ) : (
              <Collapsible open={prometheusExpanded} onOpenChange={setPrometheusExpanded}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-9 w-full justify-start rounded-none border-0 px-4 text-xs"
                  >
                    {prometheusExpanded ? 'Hide raw payload' : 'Show raw payload'}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="max-h-[320px] overflow-auto border-t bg-muted/40 px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {prometheusText}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </Panel>
        </div>
      )}

      {/* Level 2: what the panel lists. Panel-level, so it is a segmented control in the toolbar. */}
      {section === 'jobs' && (
        <Tabs
          className="flex min-h-0 flex-col"
          value={tab}
          onValueChange={(newTab) => updateSearch({ tab: newTab as typeof tab })}
        >
          <Panel className="flex min-h-0 flex-col">
            <PanelHeader className="shrink-0 items-start justify-start gap-x-3 px-3">
              <TabsList className="shrink-0">
                <TabsTrigger value="jobs">Jobs</TabsTrigger>
                <TabsTrigger value="scheduled">
                  Scheduled
                  <span className="font-mono text-[11px] font-normal tabular-nums text-muted-foreground">
                    {formatNumber(scheduledTotal)}
                  </span>
                </TabsTrigger>
              </TabsList>

              {tab === 'scheduled' ? (
                <Button
                  variant="outline"
                  size="xs"
                  className="ml-auto self-center"
                  onClick={handleOpenScheduledJobCreate}
                >
                  <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                  Schedule job
                </Button>
              ) : hasSelection ? (
                <div className="flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="mr-1 text-[13px] font-medium tabular-nums">
                    {selectedJobs.size} selected
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={handleRetrySelected}
                    disabled={retryMutation.isPending}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Retry
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={handleInvokeSelected}
                    disabled={invokeMutation.isPending}
                  >
                    <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                    Invoke
                  </Button>
                  <JobRemoveButton
                    variant="outline"
                    size="xs"
                    className="text-status-danger hover:text-status-danger [&_svg]:mr-0 [&_svg]:h-3.5 [&_svg]:w-3.5"
                    isScheduledJob={selectionHasScheduledJobs}
                    isPending={removeMutation.isPending}
                    onRemoveJobOnly={() => handleRemoveSelected(false)}
                    onRemoveJobAndStopScheduler={() => handleRemoveSelected(true)}
                    subject={`${selectedJobs.size} selected job${selectedJobs.size === 1 ? '' : 's'}`}
                  />
                  <Button
                    variant="ghost"
                    size="xs"
                    className="ml-auto"
                    onClick={() => setSelectedJobs(new Set())}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Clear selection
                  </Button>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-x-3 gap-y-2 sm:basis-0">
                  {/* One control, three fields: the filters combine (AND) and each maps to its own URL param. */}
                  <search
                    aria-label="Search jobs"
                    className="flex h-8 w-full min-w-0 items-stretch divide-x overflow-hidden rounded-md border border-input bg-card shadow-xs transition-shadow focus-within:ring-2 focus-within:ring-ring/25 sm:w-auto"
                  >
                    <JobSearchField
                      label="ID"
                      ariaLabel="Search jobs by ID"
                      placeholder="job id"
                      value={jobIdInput}
                      onChange={setJobIdInput}
                      className="sm:w-36 xl:w-40"
                    />
                    <JobSearchField
                      label="Name"
                      ariaLabel="Search jobs by name"
                      placeholder="job name"
                      value={nameInput}
                      onChange={setNameInput}
                      className="sm:w-40 xl:w-44"
                    />
                    <JobSearchField
                      label="Data"
                      ariaLabel="Search jobs by data payload"
                      placeholder="text in payload"
                      value={dataInput}
                      onChange={setDataInput}
                      className="sm:w-44 xl:w-52"
                    />
                  </search>
                  <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={hideScheduledJobs}
                      onChange={(e) =>
                        updateSearch({ hideScheduled: e.target.checked ? 1 : 0, page: 1 })
                      }
                      className={CHECKBOX_CLASS}
                    />
                    Hide scheduled jobs
                  </label>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="ml-auto"
                      onClick={() => clearFilters()}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Clear filters
                    </Button>
                  )}
                </div>
              )}
            </PanelHeader>

            {tab === 'jobs' ? (
              <>
                <div
                  ref={jobsScrollRef}
                  className="overflow-x-auto md:min-h-0 md:flex-1 md:overflow-auto"
                >
                  <table className="w-full caption-bottom border-separate border-spacing-0 text-[13px]">
                    <TableHeader className="border-b-0 bg-transparent">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className={cn(STICKY_HEAD_CLASS, 'w-9 pl-3 pr-0')}>
                          <input
                            type="checkbox"
                            aria-label="Select all loaded jobs"
                            checked={
                              visibleJobs.length > 0 && selectedJobs.size === visibleJobs.length
                            }
                            onChange={toggleAllJobs}
                            disabled={visibleJobs.length === 0}
                            className={cn(CHECKBOX_CLASS, 'block')}
                          />
                        </TableHead>
                        <TableHead className={cn(STICKY_HEAD_CLASS, 'w-full min-w-48')}>
                          Name
                        </TableHead>
                        <TableHead className={cn(STICKY_HEAD_CLASS, 'hidden sm:table-cell')}>
                          ID
                        </TableHead>
                        <TableHead className={STICKY_HEAD_CLASS}>Status</TableHead>
                        <TableHead
                          className={cn(STICKY_HEAD_CLASS, 'hidden text-right sm:table-cell')}
                        >
                          Attempts
                        </TableHead>
                        <TableHead className={cn(STICKY_HEAD_CLASS, 'hidden xl:table-cell')}>
                          Created ({timezone})
                        </TableHead>
                        <TableHead className={STICKY_HEAD_CLASS}>Finished ({timezone})</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y-0 [&>tr:not(:last-child)>td]:border-b">
                      {jobsLoading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <TableRow key={i} className="hover:bg-transparent">
                            <TableCell colSpan={7} className="h-9 py-0">
                              <Skeleton className="h-3.5 w-full" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : visibleJobs.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={7} className="p-0">
                            {jobsError ? (
                              <EmptyState
                                size="inline"
                                icon={AlertCircle}
                                tone="danger"
                                title="Couldn't load jobs"
                                description={jobsError.message}
                                actions={
                                  hasActiveFilters ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => clearFilters()}
                                    >
                                      Clear filters
                                    </Button>
                                  ) : undefined
                                }
                              />
                            ) : hasActiveFilters || hideScheduledJobs ? (
                              <EmptyState
                                size="inline"
                                icon={SearchX}
                                title={
                                  status && !hasClientSideJobFilter
                                    ? `No ${status} jobs`
                                    : 'No jobs match these filters'
                                }
                                description={
                                  status && !hasClientSideJobFilter
                                    ? `Nothing in this queue is ${status} right now.`
                                    : 'Try a different status or a broader search.'
                                }
                                actions={
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => clearFilters({ includeHideScheduled: true })}
                                  >
                                    Show all jobs
                                  </Button>
                                }
                              />
                            ) : (
                              <EmptyState
                                size="inline"
                                icon={Layers}
                                title="No jobs yet"
                                description="Jobs appear here as soon as they are enqueued."
                                actions={
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setAddJobDialogOpen(true)}
                                  >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                    Add a job
                                  </Button>
                                }
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ) : (
                        visibleJobs.map((job) => (
                          <JobRow
                            key={job.id}
                            job={job}
                            orgSlug={orgSlug}
                            connectionId={connectionId}
                            queueName={queueName}
                            selected={selectedJobs.has(job.id)}
                            onToggleSelect={() => toggleJobSelection(job.id)}
                          />
                        ))
                      )}
                      {jobsFetchingNextPage && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={7} className="h-9 py-0">
                            <Skeleton className="h-3.5 w-full" />
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </table>
                </div>
                <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-t px-3 text-xs text-muted-foreground">
                  {jobsLoading ? (
                    <span>Loading jobs…</span>
                  ) : jobsError && visibleJobs.length === 0 ? (
                    <span>Jobs unavailable</span>
                  ) : (
                    <>
                      <span>
                        <span className="font-mono tabular-nums text-foreground">
                          {formatNumber(jobsTotal)}
                        </span>{' '}
                        total
                        {visibleJobs.length > 0 && visibleJobs.length < jobsTotal ? (
                          <>
                            {' · '}
                            <span className="font-mono tabular-nums">
                              {formatNumber(visibleJobs.length)}
                            </span>{' '}
                            loaded
                          </>
                        ) : null}
                      </span>
                      {hasMoreVisibleJobs ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          className="-mr-1.5 h-6 border-0"
                          onClick={loadMoreJobs}
                          disabled={jobsFetchingNextPage}
                        >
                          {jobsFetchingNextPage ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : null}
                          {jobsFetchingNextPage ? 'Loading…' : 'Load more'}
                        </Button>
                      ) : jobsError ? null : (
                        <span>All jobs loaded</span>
                      )}
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="overflow-x-auto md:min-h-0 md:flex-1 md:overflow-auto">
                <table className="w-full min-w-[44rem] caption-bottom border-separate border-spacing-0 text-[13px]">
                  <TableHeader className="border-b-0 bg-transparent">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={STICKY_HEAD_CLASS}>Job</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Schedule</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Next run ({timezone})</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y-0 [&>tr:not(:last-child)>td]:border-b">
                    {!scheduledJobs?.scheduledJobs.length ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={4} className="p-0">
                          <EmptyState
                            size="inline"
                            icon={CalendarClock}
                            title="No scheduled jobs"
                            description="Schedulers enqueue a job on a cron pattern or a fixed interval."
                            actions={
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleOpenScheduledJobCreate}
                              >
                                <Repeat className="h-4 w-4" aria-hidden="true" />
                                Create the first scheduler
                              </Button>
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      scheduledJobs.scheduledJobs.map(
                        (job: ListScheduledJobsResponse['scheduledJobs'][number]) => (
                          <ScheduledJobRow
                            key={job.schedulerId}
                            job={job}
                            orgSlug={orgSlug}
                            connectionId={connectionId}
                            queueName={queueName}
                          />
                        )
                      )
                    )}
                  </TableBody>
                </table>
              </div>
            )}
          </Panel>
        </Tabs>
      )}

      <AddJobDialog
        queueName={queueName}
        open={addJobDialogOpen}
        onOpenChange={setAddJobDialogOpen}
      />

      <RetryQueueDialog
        queueName={queueName}
        queueJobCounts={queue?.jobCounts}
        open={retryDialogOpen}
        onOpenChange={setRetryDialogOpen}
      />

      <PurgeQueueDialog
        queueName={queueName}
        queueJobCounts={queue?.jobCounts}
        open={purgeDialogOpen}
        onOpenChange={setPurgeDialogOpen}
      />

      <DeleteQueueDialog
        queueName={queueName}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
  )
}

function formatMetricAxisTime(timestamp: number, windowMinutes: number) {
  const date = new Date(timestamp)

  if (windowMinutes >= 1440) {
    return date.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
    })
  }

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatMetricTooltipLabel(timestamp: number) {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatCompactCount(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

function formatDurationFromMs(ms: number | null | undefined) {
  if (ms === null || ms === undefined || ms < 0) {
    return 'Not active'
  }

  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`
  return `${(ms / 86400000).toFixed(1)}d`
}

function formatGlobalRateLimit(rateLimit: { max: number; durationMs: number } | null | undefined) {
  if (!rateLimit) {
    return 'Not set'
  }

  const durationSeconds = rateLimit.durationMs / 1000
  return `${formatNumber(rateLimit.max)} / ${durationSeconds.toFixed(0)}s`
}

function formatPercentage(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) {
    return '—'
  }

  return `${(value * 100).toFixed(1)}%`
}

function formatRatePerMinute(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—'
  }

  if (value >= 100) return value.toFixed(0)
  if (value >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

function formatMinutesDuration(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—'
  }

  if (value < 1) {
    return '<1m'
  }

  if (value < 60) {
    return `${value.toFixed(1)}m`
  }

  if (value < 1440) {
    return `${(value / 60).toFixed(1)}h`
  }

  return `${(value / 1440).toFixed(1)}d`
}

function formatAgeFromMs(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Unknown'
  }

  if (value < 0) {
    return '0s'
  }

  return `${formatDurationFromMs(value)} ago`
}

function formatDecimal(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—'
  }

  if (value >= 1000) {
    return formatNumber(Math.round(value))
  }

  if (value >= 100) {
    return value.toFixed(0)
  }

  return value.toFixed(1)
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeMetricSourceTimestamp(value: number | null | undefined) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return value < 1_000_000_000_000 ? value * 1000 : value
}

function formatMetricSourceTimestamp(value: number | null | undefined) {
  const normalized = normalizeMetricSourceTimestamp(value)
  if (normalized === null) {
    return 'Unknown'
  }

  return formatMetricTooltipLabel(normalized)
}

function formatNullableBoolean(value: boolean | null | undefined) {
  if (value === null || value === undefined) {
    return 'Unknown'
  }

  return value ? 'Yes' : 'No'
}

/** Page-level tab: text on the section hairline, marked by an underline instead of a pill. */
function sectionTabClass(selected: boolean) {
  return cn(
    '-mb-px h-9 rounded-none bg-transparent px-0 shadow-none ring-0',
    selected && 'shadow-[inset_0_-2px_0_0_var(--color-foreground)]'
  )
}

/** One field of the joined job search control. */
function JobSearchField({
  label,
  ariaLabel,
  placeholder,
  value,
  onChange,
  className,
}: {
  label: string
  ariaLabel: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <label
      className={cn(
        'flex min-w-0 flex-1 cursor-text items-center gap-2 px-2.5 transition-colors focus-within:bg-muted/60',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
          value ? 'text-foreground' : 'text-faint'
        )}
      >
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        className="h-full w-full min-w-0 bg-transparent font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-faint"
      />
    </label>
  )
}

function FactPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel>
      <PanelHeader>
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
      </PanelHeader>
      <div className="space-y-2 px-4 py-3 text-[13px]">{children}</div>
    </Panel>
  )
}

function FactRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs tabular-nums">{value}</span>
    </div>
  )
}

interface QueueClient {
  id: string
  name: string
  address: string
  idleMs: number | null
  ageMs: number | null
}

function ClientListPanel({
  title,
  clients,
  fallbackName,
  emptyText,
  overflowLabel,
}: {
  title: string
  clients: QueueClient[]
  fallbackName: string
  emptyText: string
  overflowLabel: string
}) {
  return (
    <Panel>
      <PanelHeader>
        <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
          {title}
          <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
            {formatNumber(clients.length)}
          </span>
        </h2>
      </PanelHeader>
      {!clients.length ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y text-xs">
          {clients.slice(0, 8).map((client) => (
            <li
              key={`${client.id}:${client.address}`}
              className="flex items-center justify-between gap-3 px-4 py-2"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-foreground">
                  {client.name || client.id || fallbackName}
                </p>
                <p className="truncate font-mono text-muted-foreground">
                  {client.address || 'unknown address'}
                </p>
              </div>
              <div className="shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                <p>idle {formatDurationFromMs(client.idleMs)}</p>
                <p>age {formatDurationFromMs(client.ageMs)}</p>
              </div>
            </li>
          ))}
          {clients.length > 8 ? (
            <li className="px-4 py-2 text-muted-foreground">
              +{formatNumber(clients.length - 8)} {overflowLabel}
            </li>
          ) : null}
        </ul>
      )}
    </Panel>
  )
}

type JobStatus = 'waiting' | 'active' | 'delayed' | 'completed' | 'failed'

function shouldSkipRowNavigation(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.closest(
      'a,button,input,select,textarea,[role="menuitem"],[role="checkbox"],[data-row-nav-ignore="true"]'
    )
  )
}

// Job summary type - matches API response
interface JobSummary {
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
}

function JobRow({
  job,
  orgSlug,
  connectionId,
  queueName,
  selected,
  onToggleSelect,
}: {
  job: JobSummary
  orgSlug: string
  connectionId: string
  queueName: string
  selected: boolean
  onToggleSelect: () => void
}) {
  const [copied, setCopied] = useState(false)
  const navigate = useNavigate()
  const statusMap: Record<string, JobStatus> = {
    waiting: 'waiting',
    active: 'active',
    delayed: 'delayed',
    completed: 'completed',
    failed: 'failed',
  }

  // Detect if this is a scheduled/repeat job based on ID prefix
  const isScheduledJob = job.id.startsWith('repeat:')
  const status = statusMap[job.status] || 'waiting'
  // Long ids keep both ends: the prefix names the producer, the suffix is what differs.
  const isTruncated = job.id.length > 32
  const displayId = isTruncated ? `${job.id.slice(0, 14)}…${job.id.slice(-12)}` : job.id
  // Below xl the column is narrower, so the id keeps less of its prefix.
  const shortId = job.id.length > 18 ? `${job.id.slice(0, 6)}…${job.id.slice(-9)}` : job.id

  const handleCopy = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(job.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const navigateToJob = useCallback(() => {
    void navigate({
      to: '/$orgSlug/c/$connectionId/queues/$queueName/jobs/$jobId',
      params: { orgSlug, connectionId, queueName, jobId: job.id },
      search: {},
    })
  }, [connectionId, job.id, navigate, orgSlug, queueName])

  const handleRowClick = useCallback(
    (event: MouseEvent<HTMLTableRowElement>) => {
      if (shouldSkipRowNavigation(event.target)) {
        return
      }

      navigateToJob()
    },
    [navigateToJob]
  )

  const handleRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key !== 'Enter' || shouldSkipRowNavigation(event.target)) {
        return
      }

      event.preventDefault()
      navigateToJob()
    },
    [navigateToJob]
  )

  return (
    <TableRow
      className="group cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none"
      aria-label={`Open job ${job.id}`}
      data-testid={`job-row-${job.id}`}
      data-state={selected ? 'selected' : undefined}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      role="link"
      tabIndex={0}
    >
      <TableCell className="h-9 w-9 py-0 pl-3 pr-0">
        <input
          type="checkbox"
          aria-label={`Select job ${job.id}`}
          checked={selected}
          onChange={onToggleSelect}
          className={cn(CHECKBOX_CLASS, 'block')}
        />
      </TableCell>
      {/* Name takes the slack and truncates; a failed job shows why without opening it. */}
      <TableCell className="h-9 w-full max-w-0 py-0">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <Link
            to="/$orgSlug/c/$connectionId/queues/$queueName/jobs/$jobId"
            params={{ orgSlug, connectionId, queueName, jobId: job.id }}
            search={{}}
            tabIndex={-1}
            title={job.name}
            className={cn(
              'shrink-0 truncate font-mono font-medium underline-offset-4 group-hover:underline',
              status === 'failed' && job.failedReason ? 'max-w-[60%]' : 'max-w-full',
              job.name ? 'text-foreground' : 'text-faint'
            )}
          >
            {job.name || 'unnamed'}
          </Link>
          {status === 'failed' && job.failedReason ? (
            <span className="min-w-0 truncate text-xs text-status-danger" title={job.failedReason}>
              {job.failedReason}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="hidden h-9 whitespace-nowrap py-0 sm:table-cell">
        {isScheduledJob ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            title={job.id}
          >
            <Repeat className="h-3.5 w-3.5 shrink-0 text-status-priority" aria-hidden="true" />
            Scheduled
          </span>
        ) : isTruncated ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <code className="font-mono text-xs text-muted-foreground">
                  <span className="xl:hidden">{shortId}</span>
                  <span className="hidden xl:inline">{displayId}</span>
                </code>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="flex max-w-md items-center gap-2"
                data-row-nav-ignore="true"
              >
                <code className="break-all font-mono text-xs">{job.id}</code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 rounded-sm p-1 transition-colors hover:bg-primary-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-label="Copy job ID"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <code className="font-mono text-xs text-muted-foreground" title={job.id}>
            <span className="xl:hidden">{shortId}</span>
            <span className="hidden xl:inline">{job.id}</span>
          </code>
        )}
      </TableCell>
      <TableCell className="h-9 whitespace-nowrap py-0">
        <StatusIndicator status={status} showPulse={status === 'active'} />
      </TableCell>
      <TableCell className="hidden h-9 whitespace-nowrap py-0 text-right font-mono text-xs tabular-nums text-muted-foreground sm:table-cell">
        {job.attemptsMade}/{job.maxAttempts}
      </TableCell>
      <TimestampCell timestamp={job.timestamp} className="hidden xl:table-cell" />
      <TimestampCell timestamp={job.finishedOn} />
    </TableRow>
  )
}

/** Job timestamps drop the year while it is the current one; the full value stays in the title. */
function formatJobTimestamp(timestamp: number) {
  const date = new Date(timestamp)
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' as const }),
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

function TimestampCell({
  timestamp,
  className,
}: {
  timestamp: number | undefined
  className?: string
}) {
  return (
    <TableCell
      className={cn(
        'h-9 whitespace-nowrap py-0 font-mono text-xs tabular-nums text-muted-foreground',
        className
      )}
      title={timestamp ? formatDate(timestamp) : undefined}
    >
      {timestamp ? formatJobTimestamp(timestamp) : <span className="text-faint">—</span>}
    </TableCell>
  )
}

function ScheduledJobRow({
  job,
  orgSlug,
  connectionId,
  queueName,
}: {
  job: ListScheduledJobsResponse['scheduledJobs'][number]
  orgSlug: string
  connectionId: string
  queueName: string
}) {
  const navigate = useNavigate()

  const navigateToScheduler = useCallback(() => {
    void navigate({
      to: '/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/$schedulerId',
      params: { orgSlug, connectionId, queueName, schedulerId: job.schedulerId },
    })
  }, [connectionId, job.schedulerId, navigate, orgSlug, queueName])

  return (
    <TableRow
      className="group cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none"
      aria-label={`Open scheduled job ${job.schedulerId}`}
      onClick={(event) => {
        if (!shouldSkipRowNavigation(event.target)) navigateToScheduler()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || shouldSkipRowNavigation(event.target)) return
        event.preventDefault()
        navigateToScheduler()
      }}
      role="link"
      tabIndex={0}
    >
      <TableCell className="py-2">
        <Link
          to="/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/$schedulerId"
          params={{ orgSlug, connectionId, queueName, schedulerId: job.schedulerId }}
          tabIndex={-1}
          className="font-mono font-medium text-foreground underline-offset-4 group-hover:underline"
        >
          {job.jobName}
        </Link>
        <div className="font-mono text-xs text-muted-foreground">{job.schedulerId}</div>
      </TableCell>
      <TableCell className="py-2">
        <div>{getScheduleSummary(job)}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <code className="rounded-[4px] bg-muted px-1 py-px font-mono">
            {getScheduleExpression(job)}
          </code>
          {job.timezone ? <span>{job.timezone}</span> : null}
          {typeof job.limit === 'number' ? <span>limit {job.limit}</span> : null}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap py-2 font-mono text-xs tabular-nums text-muted-foreground">
        <div>{job.nextRun ? formatDate(job.nextRun) : <span className="text-faint">—</span>}</div>
        {job.startDate ? <div className="font-sans">Starts {formatDate(job.startDate)}</div> : null}
        {job.endDate ? <div className="font-sans">Ends {formatDate(job.endDate)}</div> : null}
      </TableCell>
      <TableCell className="py-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusIndicator status={job.enabled ? 'enabled' : 'disabled'} showPulse={false} />
          {(job.recentFailedCount ?? 0) > 0 ? (
            <Badge variant="warning">
              {formatNumber(job.recentFailedCount ?? 0)} failed recently
            </Badge>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  )
}
