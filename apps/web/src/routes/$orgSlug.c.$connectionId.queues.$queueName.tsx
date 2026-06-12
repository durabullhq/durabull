import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Database,
  Gauge,
  Layers,
  LineChart,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Rocket,
  Server,
  Settings,
  SquarePlay,
  TerminalSquare,
  Trash2,
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
import { useAppTopBar } from '@/components/app-top-bar'
import { DeleteQueueDialog } from '@/components/delete-queue-dialog'
import { JobRemoveButton } from '@/components/job-remove-button'
import { PurgeQueueDialog } from '@/components/purge-queue-dialog'
import { RetryQueueDialog } from '@/components/retry-queue-dialog'
import { StatusIndicator } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { formatDate, formatNumber, getTimezoneAbbreviation } from '@/lib/utils'

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
  completed: {
    label: 'Completed/min',
    theme: {
      light: 'hsl(146 55% 41%)',
      dark: 'hsl(146 62% 52%)',
    },
  },
  failed: {
    label: 'Failed/min',
    theme: {
      light: 'hsl(2 78% 52%)',
      dark: 'hsl(2 86% 65%)',
    },
  },
  total: {
    label: 'Finished/min',
    theme: {
      light: 'hsl(210 76% 42%)',
      dark: 'hsl(210 90% 64%)',
    },
  },
} satisfies ChartConfig

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

  useEffect(() => {
    const container = jobsScrollRef.current
    if (!container || section !== 'jobs' || tab !== 'jobs') {
      return
    }

    const onScroll = () => {
      const nearBottom =
        container.scrollTop + container.clientHeight >= container.scrollHeight - 240
      if (!nearBottom) {
        return
      }

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
    }

    container.addEventListener('scroll', onScroll)
    return () => container.removeEventListener('scroll', onScroll)
  }, [
    fetchNextJobsPage,
    hasMoreJobs,
    jobsFetchingNextPage,
    section,
    tab,
    hasClientSideJobFilter,
    filteredVisibleJobs.length,
    visibleJobs.length,
  ])

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

  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Layers className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex items-center gap-1.5">
            <Link
              to="/$orgSlug/c/$connectionId"
              params={{ orgSlug, connectionId }}
              className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Queues
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            <h1 className="truncate text-base font-semibold md:text-lg">{queueName}</h1>
            {queueLoading ? (
              <Skeleton className="h-5 w-14" />
            ) : (
              <StatusIndicator status={queue?.isPaused ? 'paused' : 'active'} />
            )}
          </div>
        </div>
      ),
      actions: (
        <>
          <Button variant="outline" size="xs" onClick={() => setAddJobDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Job
          </Button>
          <Button variant="outline" size="xs" onClick={handleOpenScheduledJobCreate}>
            <Repeat className="mr-2 h-4 w-4" />
            Schedule Job
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={handleTogglePause}
            disabled={pauseMutation.isPending || resumeMutation.isPending}
          >
            {queue?.isPaused ? (
              <>
                <Play className="mr-2 h-4 w-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </>
            )}
          </Button>
          <Button variant="outline" size="xs" onClick={() => setPurgeDialogOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Purge / Retain
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="xs" className="px-2.5">
                <Settings className="h-4 w-4" />
                <span className="sr-only">Queue settings</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setRetryDialogOpen(true)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry Jobs
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPurgeDialogOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Purge / Retain Jobs
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Queue
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ),
      mobileActions: (
        <>
          <DropdownMenuItem onClick={() => setAddJobDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Job
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleOpenScheduledJobCreate}>
            <Repeat className="mr-2 h-4 w-4" />
            Schedule Job
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleTogglePause}
            disabled={pauseMutation.isPending || resumeMutation.isPending}
          >
            {queue?.isPaused ? (
              <>
                <Play className="mr-2 h-4 w-4" />
                Resume Queue
              </>
            ) : (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Pause Queue
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setRetryDialogOpen(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry Jobs
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPurgeDialogOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Purge / Retain Jobs
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDeleteDialogOpen(true)}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Queue
          </DropdownMenuItem>
        </>
      ),
    }),
    [
      connectionId,
      orgSlug,
      pauseMutation.isPending,
      queue?.isPaused,
      queueLoading,
      queueName,
      resumeMutation.isPending,
      handleOpenScheduledJobCreate,
      handleTogglePause,
    ]
  )

  useAppTopBar(topBarConfig)

  if (queueError) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Queue not found</h2>
        <p className="text-muted-foreground mb-4">{queueError.message}</p>
        <Button
          variant="outline"
          onClick={() =>
            navigate({ to: '/$orgSlug/c/$connectionId', params: { orgSlug, connectionId } })
          }
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Queues
        </Button>
      </div>
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

  return (
    <div
      className={
        section === 'jobs' ? 'flex h-full min-h-0 flex-col gap-6 overflow-hidden' : 'space-y-6'
      }
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{queue?.workers.length ?? 0} workers connected</span>
      </div>

      <Tabs
        value={section}
        onValueChange={(newSection) =>
          navigate({
            to: '.',
            search: {
              section: newSection as typeof section,
              tab,
              status,
              jobId,
              name,
              data: dataSearch,
              hideScheduled,
              page,
            },
            replace: true,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="jobs" aria-label="Queue section Jobs">
            Jobs
          </TabsTrigger>
          <TabsTrigger value="observability" aria-label="Queue section Observability">
            Observability
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stats cards */}
      {section === 'jobs' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Card className="relative overflow-hidden">
            <span className="absolute inset-x-0 top-0 h-0.5 bg-status-neutral/40" aria-hidden="true" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
              <CardTitle className="eyebrow">Waiting</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {queueLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                  {formatNumber(queue?.jobCounts.waiting ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <span className="absolute inset-x-0 top-0 h-0.5 bg-status-active" aria-hidden="true" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
              <CardTitle className="eyebrow">Active</CardTitle>
              <Zap className="h-4 w-4 text-status-active" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {queueLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                  {formatNumber(queue?.jobCounts.active ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <span className="absolute inset-x-0 top-0 h-0.5 bg-status-warning" aria-hidden="true" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
              <CardTitle className="eyebrow">Delayed</CardTitle>
              <Clock className="h-4 w-4 text-status-warning" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {queueLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                  {formatNumber(queue?.jobCounts.delayed ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <span className="absolute inset-x-0 top-0 h-0.5 bg-status-priority" aria-hidden="true" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
              <CardTitle className="eyebrow">Prioritized</CardTitle>
              <Rocket className="h-4 w-4 text-status-priority" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {queueLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                  {formatNumber(queue?.jobCounts.prioritized ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <span className="absolute inset-x-0 top-0 h-0.5 bg-status-danger" aria-hidden="true" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
              <CardTitle className="eyebrow">Failed</CardTitle>
              <AlertCircle className="h-4 w-4 text-status-danger" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {queueLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                  {formatNumber(queue?.jobCounts.failed ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <span className="absolute inset-x-0 top-0 h-0.5 bg-status-success" aria-hidden="true" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
              <CardTitle className="eyebrow">Waiting Children</CardTitle>
              <BarChart3 className="h-4 w-4 text-status-success" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {metricsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                  {formatNumber(metrics?.counts.waitingChildren ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {section === 'observability' && (
        <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-background via-background to-muted/35">
          <CardHeader className="border-b bg-muted/20 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <LineChart className="h-4 w-4 text-muted-foreground" />
                  BullMQ Native Telemetry
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  1-minute buckets from BullMQ `getMetrics` plus queue-native state, limits, and
                  scheduler/worker telemetry.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {METRICS_WINDOWS.map((window) => (
                  <Button
                    key={window.value}
                    size="sm"
                    variant={metricsWindowValue === window.value ? 'default' : 'outline'}
                    className="h-8 px-2.5 text-xs"
                    onClick={() => setMetricsWindowValue(window.value)}
                  >
                    {window.label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant={includePrometheusMetrics ? 'default' : 'outline'}
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setIncludePrometheusMetrics((current) => !current)}
                >
                  Prometheus
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => void refetchMetrics()}
                  disabled={metricsFetching}
                >
                  <RefreshCw
                    className={`mr-1.5 h-3.5 w-3.5 ${metricsFetching ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </Button>
                <span className="inline-block w-28 text-right text-xs text-muted-foreground">
                  {metricsFetching ? 'Refreshing...' : 'Auto refresh 15s'}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={metricsStale ? 'warning' : 'success'}>
                Latest sample age: {formatAgeFromMs(latestPointAgeMs)}
              </Badge>
              <Badge variant="outline">Window: {selectedWindowLabel}</Badge>
              <Badge variant="outline">
                Coverage: {formatPercentage(requestedWindowCoverage ?? undefined)}
              </Badge>
              <Badge variant={includePrometheusMetrics ? 'secondary' : 'outline'}>
                Prometheus: {includePrometheusMetrics ? 'Included' : 'Off'}
              </Badge>
              <Badge variant={metrics?.warnings.length ? 'warning' : 'success'}>
                Warnings: {formatNumber(metrics?.warnings.length ?? 0)}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricTile
                title="Finished (window)"
                value={formatNumber(metricsTotals?.finishedInWindow ?? 0)}
                subtitle="Completed + failed in selected range"
              />
              <MetricTile
                title="Completed (window)"
                value={formatNumber(metricsTotals?.completedInWindow ?? 0)}
                subtitle="BullMQ completed/min buckets in range"
              />
              <MetricTile
                title="Failed (window)"
                value={formatNumber(metricsTotals?.failedInWindow ?? 0)}
                subtitle="BullMQ failed/min buckets in range"
              />
              <MetricTile
                title="Success Rate (window)"
                value={formatPercentage(metricsTotals?.successRateInWindow)}
                subtitle="From completed/failed buckets"
              />
              <MetricTile
                title="Failure Rate (window)"
                value={formatPercentage(metricsTotals?.failureRateInWindow)}
                subtitle="Failed / finished in selected range"
              />
              <MetricTile
                title="Avg Throughput (/min)"
                value={formatRatePerMinute(metricsTotals?.avgFinishedPerMinuteInWindow)}
                subtitle="Average finished jobs per minute"
              />
              <MetricTile
                title="Peak Throughput (/min)"
                value={formatNumber(metricsTotals?.peakFinishedPerMinuteInWindow ?? 0)}
                subtitle="Highest finished count in one minute"
              />
              <MetricTile
                title="Peak Failures (/min)"
                value={formatNumber(metricsTotals?.peakFailedPerMinuteInWindow ?? 0)}
                subtitle="Highest failed count in one minute"
              />
              <MetricTile
                title="Failure Minutes"
                value={formatNumber(metricsTotals?.minutesWithFailuresInWindow ?? 0)}
                subtitle="Minutes with failed > 0"
              />
              <MetricTile
                title="Longest Failure Streak"
                value={formatMinutesDuration(metricsTotals?.longestFailureStreakMinutesInWindow)}
                subtitle="Consecutive failed minutes in range"
              />
              <MetricTile
                title="Failed (outside window)"
                value={formatNumber(failedOutsideWindow)}
                subtitle="Lifetime failed minus selected range"
              />
              <MetricTile
                title="Finished (lifetime)"
                value={formatNumber(metricsTotals?.finishedLifetime ?? 0)}
                subtitle="BullMQ cumulative counters since metrics started"
              />
              <MetricTile
                title="Failed (lifetime)"
                value={formatNumber(metricsTotals?.failedLifetime ?? 0)}
                subtitle="BullMQ cumulative failed counter"
              />
              <MetricTile
                title="Waiting To Process"
                value={formatNumber(metrics?.queue.waitingToProcess ?? 0)}
                subtitle="BullMQ queue.count()"
              />
              <MetricTile
                title="Retained Buckets"
                value={formatNumber(retainedMetricBuckets)}
                subtitle="1-minute points retained by worker metrics"
              />
              <MetricTile
                title="Drain ETA"
                value={formatMinutesDuration(metricsTotals?.estimatedDrainMinutes)}
                subtitle="waitingToProcess / avg throughput"
              />
              <MetricTile
                title="Backlog / Worker"
                value={formatDecimal(backlogPerWorker)}
                subtitle="waitingToProcess divided by workers"
              />
            </div>
            {windowStartTimestamp !== null && windowEndTimestamp !== null ? (
              <p className="text-xs text-muted-foreground">
                {selectedWindowLabel} view covers {formatMetricTooltipLabel(windowStartTimestamp)}{' '}
                to {formatMetricTooltipLabel(windowEndTimestamp)}. Jobs list is not time-filtered,
                so it can include older failures outside this chart range.
              </p>
            ) : null}

            {metricsLoading ? (
              <div className="h-[320px] w-full">
                <Skeleton className="h-full w-full" />
              </div>
            ) : !metricsPoints.length ? (
              <div className="flex h-[320px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-border/60 bg-muted/10 px-6 text-center">
                <Gauge className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">No native metrics yet</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Enable BullMQ worker metrics to populate this chart over time.
                </p>
                <a
                  href="https://docs.bullmq.io/guide/metrics"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  View BullMQ metrics setup documentation
                </a>
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[320px] w-full">
                <AreaChart
                  data={metricsPoints}
                  margin={{ left: 8, right: 12, top: 10, bottom: 10 }}
                >
                  <defs>
                    <linearGradient id="fill-total" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-total)" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="var(--color-total)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="fill-completed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="fill-failed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-failed)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--color-failed)" stopOpacity={0.03} />
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
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    dataKey="completed"
                    type="monotone"
                    fill="url(#fill-completed)"
                    fillOpacity={1}
                    stroke="var(--color-completed)"
                    strokeWidth={1.8}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    dataKey="failed"
                    type="monotone"
                    fill="url(#fill-failed)"
                    fillOpacity={1}
                    stroke="var(--color-failed)"
                    strokeWidth={1.8}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ChartContainer>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Queue Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <MetricRow
                    label="Workers"
                    value={formatNumber(metrics?.queue.workersCount ?? queue?.workers.length ?? 0)}
                  />
                  <MetricRow
                    label="Schedulers"
                    value={formatNumber(
                      metrics?.queue.schedulersCount ?? queue?.scheduledJobsCount ?? 0
                    )}
                  />
                  <MetricRow
                    label="Waiting (set)"
                    value={formatNumber(metrics?.counts.waiting ?? 0)}
                  />
                  <MetricRow
                    label="Active (set)"
                    value={formatNumber(metrics?.counts.active ?? 0)}
                  />
                  <MetricRow
                    label="Delayed (set)"
                    value={formatNumber(metrics?.counts.delayed ?? 0)}
                  />
                  <MetricRow
                    label="Completed (set)"
                    value={formatNumber(metrics?.counts.completed ?? 0)}
                  />
                  <MetricRow
                    label="Failed (set)"
                    value={formatNumber(metrics?.counts.failed ?? 0)}
                  />
                  <MetricRow
                    label="Prioritized (set)"
                    value={formatNumber(metrics?.counts.prioritized ?? 0)}
                  />
                  <MetricRow
                    label="Paused (set)"
                    value={formatNumber(metrics?.counts.paused ?? 0)}
                  />
                  <MetricRow
                    label="Waiting Children (set)"
                    value={formatNumber(metrics?.counts.waitingChildren ?? 0)}
                  />
                  <MetricRow
                    label="Queue Event Clients"
                    value={formatNumber(metrics?.queue.queueEventsCount ?? 0)}
                  />
                  <MetricRow
                    label="Rate Limited"
                    value={metrics?.controls.rateLimited ? 'Yes' : 'No'}
                  />
                  <MetricRow
                    label="Rate Limit TTL"
                    value={formatDurationFromMs(metrics?.controls.rateLimitTtlMs)}
                  />
                  <MetricRow
                    label="Global Concurrency"
                    value={metrics?.controls.globalConcurrency ?? 'Not set'}
                  />
                  <MetricRow
                    label="Global Rate Limit"
                    value={formatGlobalRateLimit(metrics?.controls.globalRateLimit)}
                  />
                  <MetricRow label="Queue Maxed" value={metrics?.queue.isMaxed ? 'Yes' : 'No'} />
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Native Queue Meta</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <MetricRow label="Requested Window" value={selectedWindowLabel} />
                  <MetricRow
                    label="All Retained Mode"
                    value={usingAllRetainedWindow ? 'Yes' : 'No'}
                  />
                  <MetricRow
                    label="Returned Buckets"
                    value={formatNumber(metrics?.range.returnedPoints ?? 0)}
                  />
                  <MetricRow label="Retained Buckets" value={formatNumber(retainedMetricBuckets)} />
                  <MetricRow
                    label="Window Coverage"
                    value={formatPercentage(requestedWindowCoverage ?? undefined)}
                  />
                  <MetricRow label="Latest Sample Age" value={formatAgeFromMs(latestPointAgeMs)} />
                  <MetricRow
                    label="Completed prevTS"
                    value={formatMetricSourceTimestamp(metrics?.series.completed.meta.prevTS)}
                  />
                  <MetricRow
                    label="Failed prevTS"
                    value={formatMetricSourceTimestamp(metrics?.series.failed.meta.prevTS)}
                  />
                  <MetricRow
                    label="Completed prevCount"
                    value={formatNumber(metrics?.series.completed.meta.prevCount ?? 0)}
                  />
                  <MetricRow
                    label="Failed prevCount"
                    value={formatNumber(metrics?.series.failed.meta.prevCount ?? 0)}
                  />
                  <MetricRow
                    label="Paused (meta)"
                    value={formatNullableBoolean(metrics?.meta.paused)}
                  />
                  <MetricRow label="Version" value={metrics?.meta.version ?? 'Unknown'} />
                  <MetricRow
                    label="Concurrency (meta)"
                    value={metrics?.meta.concurrency ?? 'Not set'}
                  />
                  <MetricRow label="max (meta)" value={metrics?.meta.max ?? 'Not set'} />
                  <MetricRow
                    label="duration (meta)"
                    value={formatDurationFromMs(metrics?.meta.duration)}
                  />
                  <MetricRow
                    label="maxLenEvents (meta)"
                    value={metrics?.meta.maxLenEvents ?? 'Not set'}
                  />
                  <MetricRow
                    label="Warnings"
                    value={metrics?.warnings.length ? String(metrics.warnings.length) : '0'}
                  />
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Priority Mix</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!priorityRows.length ? (
                    <p className="text-xs text-muted-foreground">
                      No jobs were found in the sampled priority buckets.
                    </p>
                  ) : (
                    priorityRows.map((entry) => {
                      const width =
                        highestPriorityBucket > 0 ? (entry.count / highestPriorityBucket) * 100 : 0

                      return (
                        <div key={entry.priority} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono text-muted-foreground">
                              P{entry.priority}
                            </span>
                            <span className="font-mono tabular-nums">
                              {formatNumber(entry.count)}
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-[var(--color-sidebar-primary)] transition-[width] duration-300"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    Worker Clients
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {!metrics?.queue.workers.length ? (
                    <p className="text-muted-foreground">
                      No worker clients reported via Redis CLIENT LIST metadata.
                    </p>
                  ) : (
                    <>
                      {metrics.queue.workers.slice(0, 8).map((worker) => (
                        <div
                          key={`${worker.id}:${worker.address}`}
                          className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate font-mono">
                              {worker.name || worker.id || 'worker'}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              idle {formatDurationFromMs(worker.idleMs)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-muted-foreground">
                            {worker.address || 'unknown address'}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            age {formatDurationFromMs(worker.ageMs)}
                          </p>
                        </div>
                      ))}
                      {metrics.queue.workers.length > 8 ? (
                        <p className="text-muted-foreground">
                          +{formatNumber(metrics.queue.workers.length - 8)} additional workers
                        </p>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    Queue Event Clients
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {!metrics?.queue.queueEvents.length ? (
                    <p className="text-muted-foreground">
                      No queue event clients detected for this queue.
                    </p>
                  ) : (
                    <>
                      {metrics.queue.queueEvents.slice(0, 8).map((eventClient) => (
                        <div
                          key={`${eventClient.id}:${eventClient.address}`}
                          className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate font-mono">
                              {eventClient.name || eventClient.id || 'queue-event-client'}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              idle {formatDurationFromMs(eventClient.idleMs)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-muted-foreground">
                            {eventClient.address || 'unknown address'}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            age {formatDurationFromMs(eventClient.ageMs)}
                          </p>
                        </div>
                      ))}
                      {metrics.queue.queueEvents.length > 8 ? (
                        <p className="text-muted-foreground">
                          +{formatNumber(metrics.queue.queueEvents.length - 8)} additional clients
                        </p>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                    Prometheus Export
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant={includePrometheusMetrics ? 'secondary' : 'outline'}>
                      {includePrometheusMetrics ? 'Included' : 'Not included'}
                    </Badge>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void handleCopyPrometheus()}
                      disabled={!prometheusText}
                    >
                      {prometheusCopied ? (
                        <>
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!includePrometheusMetrics ? (
                  <p className="text-xs text-muted-foreground">
                    Enable the Prometheus toggle to include `queue.exportPrometheusMetrics()` in
                    this payload.
                  </p>
                ) : !prometheusText ? (
                  <p className="text-xs text-muted-foreground">
                    Prometheus export is enabled, but no payload was returned for this queue.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatNumber(prometheusLineCount)} lines</span>
                      <span>{formatBytes(prometheusByteSize)}</span>
                    </div>
                    <Collapsible
                      open={prometheusExpanded}
                      onOpenChange={setPrometheusExpanded}
                      className="rounded-md border border-border/60"
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-8 w-full justify-start rounded-none text-xs"
                        >
                          {prometheusExpanded ? 'Hide raw payload' : 'Show raw payload'}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="max-h-[320px] overflow-auto border-t border-border/60 bg-muted/20 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                          {prometheusText}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  </>
                )}
              </CardContent>
            </Card>

            {metrics?.warnings.length ? (
              <div className="rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
                Some metrics were unavailable in this Redis environment:{' '}
                {metrics.warnings.join('; ')}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      {section === 'jobs' && (
        <Tabs
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          value={tab}
          onValueChange={(newTab) =>
            navigate({
              to: '.',
              search: {
                section,
                tab: newTab as typeof tab,
                status,
                jobId,
                name,
                data: dataSearch,
                hideScheduled,
                page,
              },
              replace: true,
            })
          }
        >
          {/* Toolbar: filters on left, tab toggle on right */}
          {/* pt-1.5 keeps focus rings from being clipped by the Tabs' overflow-hidden */}
          <div className="flex items-center justify-between gap-3 pt-1.5">
            <div className="flex items-center gap-2">
              {tab === 'jobs' && (
                <>
                  <Select
                    value={status}
                    onChange={(e) => {
                      const newStatus = e.target.value as typeof status
                      trackEvent(AnalyticsEvents.JOB_STATUS_FILTERED, {
                        queue_name: queueName,
                        filter_status: newStatus || 'all',
                      })
                      navigate({
                        to: '.',
                        search: {
                          section,
                          tab,
                          status: newStatus,
                          jobId,
                          name,
                          data: dataSearch,
                          hideScheduled,
                          page: 1,
                        },
                        replace: true,
                      })
                    }}
                    className="w-40"
                  >
                    <option value="">All statuses</option>
                    <option value="waiting">Waiting</option>
                    <option value="active">Active</option>
                    <option value="delayed">Delayed</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                  </Select>
                  <Input
                    value={jobIdInput}
                    onChange={(e) => setJobIdInput(e.target.value)}
                    placeholder="Search by job ID"
                    className="w-48 max-w-full"
                    aria-label="Search jobs by ID"
                  />
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Search by job name"
                    className="w-48 max-w-full"
                    aria-label="Search jobs by name"
                  />
                  <Input
                    value={dataInput}
                    onChange={(e) => setDataInput(e.target.value)}
                    placeholder="Search in job data"
                    className="w-48 max-w-full"
                    aria-label="Search jobs by data payload"
                  />
                  <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={hideScheduledJobs}
                      onChange={(e) =>
                        navigate({
                          to: '.',
                          search: {
                            section,
                            tab,
                            status,
                            jobId,
                            name,
                            data: dataSearch,
                            hideScheduled: e.target.checked ? 1 : 0,
                            page: 1,
                          },
                          replace: true,
                        })
                      }
                      className="rounded border-gray-300"
                    />
                    Hide scheduled jobs
                  </label>
                </>
              )}
            </div>
            <TabsList className="shrink-0">
              <TabsTrigger value="jobs">Jobs</TabsTrigger>
              <TabsTrigger value="scheduled">
                Scheduled Jobs ({scheduledJobs?.total ?? 0})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="jobs"
            className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden"
          >
            {/* Selected job actions */}
            {selectedJobs.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{selectedJobs.size} selected</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetrySelected}
                  disabled={retryMutation.isPending}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleInvokeSelected}
                  disabled={invokeMutation.isPending}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  Invoke
                </Button>
                {(() => {
                  const hasScheduledJobs = Array.from(selectedJobs).some((id) =>
                    id.startsWith('repeat:')
                  )
                  return (
                    <JobRemoveButton
                      isScheduledJob={hasScheduledJobs}
                      isPending={removeMutation.isPending}
                      onRemoveJobOnly={() => handleRemoveSelected(false)}
                      onRemoveJobAndStopScheduler={() => handleRemoveSelected(true)}
                      subject={`${selectedJobs.size} selected job${selectedJobs.size === 1 ? '' : 's'}`}
                    />
                  )
                })()}
              </div>
            )}

            {/* Jobs table */}
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <CardHeader className="border-b bg-muted/30 py-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  Jobs
                </CardTitle>
              </CardHeader>
              <div ref={jobsScrollRef} className="min-h-0 flex-1 overflow-auto">
                <table className="w-full caption-bottom border-separate border-spacing-0 text-sm">
                  <TableHeader className="bg-card [&_th]:border-b [&_th]:border-border/70">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="sticky top-0 z-20 w-12 bg-card shadow-[inset_0_-1px_0_0_hsl(var(--border)),0_8px_12px_-10px_rgba(0,0,0,0.75)]">
                        <input
                          type="checkbox"
                          checked={
                            visibleJobs.length > 0 && selectedJobs.size === visibleJobs.length
                          }
                          onChange={toggleAllJobs}
                          disabled={visibleJobs.length === 0}
                          className="rounded border-gray-300"
                        />
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 bg-card shadow-[inset_0_-1px_0_0_hsl(var(--border)),0_8px_12px_-10px_rgba(0,0,0,0.75)]">
                        ID
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 bg-card shadow-[inset_0_-1px_0_0_hsl(var(--border)),0_8px_12px_-10px_rgba(0,0,0,0.75)]">
                        Name
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 bg-card shadow-[inset_0_-1px_0_0_hsl(var(--border)),0_8px_12px_-10px_rgba(0,0,0,0.75)]">
                        Status
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 bg-card shadow-[inset_0_-1px_0_0_hsl(var(--border)),0_8px_12px_-10px_rgba(0,0,0,0.75)]">
                        Attempts
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 bg-card shadow-[inset_0_-1px_0_0_hsl(var(--border)),0_8px_12px_-10px_rgba(0,0,0,0.75)]">
                        Created ({getTimezoneAbbreviation()})
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 bg-card shadow-[inset_0_-1px_0_0_hsl(var(--border)),0_8px_12px_-10px_rgba(0,0,0,0.75)]">
                        Finished ({getTimezoneAbbreviation()})
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobsLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={7}>
                            <Skeleton className="h-8" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : visibleJobs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12">
                          <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <p className="font-medium">No jobs yet</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Jobs will appear here after they are enqueued.
                          </p>
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
                      <TableRow>
                        <TableCell colSpan={7}>
                          <Skeleton className="h-8" />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </table>
              </div>
            </Card>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{jobsData?.pages[0]?.total ?? 0} total</span>
              <span>{hasMoreVisibleJobs ? 'Scroll to load more' : 'All jobs loaded'}</span>
            </div>
          </TabsContent>

          <TabsContent value="scheduled">
            <Card>
              <CardHeader className="border-b bg-muted/30 py-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Scheduled Jobs
                  </CardTitle>
                  <Button variant="outline" size="xs" onClick={handleOpenScheduledJobCreate}>
                    <Repeat className="mr-2 h-4 w-4" />
                    Schedule Job
                  </Button>
                </div>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Job</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Next Run ({getTimezoneAbbreviation()})</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!scheduledJobs?.scheduledJobs.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12">
                        <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No scheduled jobs</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={handleOpenScheduledJobCreate}
                        >
                          <Repeat className="mr-2 h-4 w-4" />
                          Create the first scheduler
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    scheduledJobs.scheduledJobs.map(
                      (job: ListScheduledJobsResponse['scheduledJobs'][number]) => (
                        <TableRow key={job.schedulerId}>
                          <TableCell>
                            <div className="space-y-1">
                              <Link
                                to="/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/$schedulerId"
                                params={{
                                  orgSlug,
                                  connectionId,
                                  queueName,
                                  schedulerId: job.schedulerId,
                                }}
                                className="text-sm font-medium text-foreground transition-colors hover:text-primary hover:underline underline-offset-2"
                              >
                                {job.jobName}
                              </Link>
                              <div className="text-xs text-muted-foreground">
                                <Link
                                  to="/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/$schedulerId"
                                  params={{
                                    orgSlug,
                                    connectionId,
                                    queueName,
                                    schedulerId: job.schedulerId,
                                  }}
                                  className="font-mono transition-colors hover:text-foreground"
                                >
                                  {job.schedulerId}
                                </Link>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm">{getScheduleSummary(job)}</div>
                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                                  {getScheduleExpression(job)}
                                </code>
                                {job.timezone ? <span>{job.timezone}</span> : null}
                                {typeof job.limit === 'number' ? (
                                  <span>limit {job.limit}</span>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <div className="space-y-1">
                              <div>{job.nextRun ? formatDate(job.nextRun) : '—'}</div>
                              {job.startDate ? (
                                <div className="text-xs">Starts {formatDate(job.startDate)}</div>
                              ) : null}
                              {job.endDate ? (
                                <div className="text-xs">Ends {formatDate(job.endDate)}</div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusIndicator
                                status={job.enabled ? 'enabled' : 'disabled'}
                                showPulse={false}
                              />
                              {(job.recentFailedCount ?? 0) > 0 ? (
                                <Badge variant="warning">
                                  {formatNumber(job.recentFailedCount ?? 0)} failed recently
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    )
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Add Job Dialog */}
      <AddJobDialog
        queueName={queueName}
        open={addJobDialogOpen}
        onOpenChange={setAddJobDialogOpen}
      />

      {/* Retry Queue Dialog */}
      <RetryQueueDialog
        queueName={queueName}
        queueJobCounts={queue?.jobCounts}
        open={retryDialogOpen}
        onOpenChange={setRetryDialogOpen}
      />

      {/* Purge Queue Dialog */}
      <PurgeQueueDialog
        queueName={queueName}
        queueJobCounts={queue?.jobCounts}
        open={purgeDialogOpen}
        onOpenChange={setPurgeDialogOpen}
      />

      {/* Delete Queue Dialog */}
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

function MetricTile({
  title,
  value,
  subtitle,
}: {
  title: string
  value: string
  subtitle: string
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs tabular-nums">{value}</span>
    </div>
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
  const isTruncated = job.id.length > 16

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
      className="group cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none"
      aria-label={`Open job ${job.id}`}
      data-testid={`job-row-${job.id}`}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      role="link"
      tabIndex={0}
    >
      <TableCell>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="rounded border-gray-300"
        />
      </TableCell>
      <TableCell>
        <Link
          to="/$orgSlug/c/$connectionId/queues/$queueName/jobs/$jobId"
          params={{ orgSlug, connectionId, queueName, jobId: job.id }}
          search={{}}
          className="flex items-center gap-2 group"
        >
          {isScheduledJob ? (
            <>
              <Repeat className="h-4 w-4 text-status-priority shrink-0" />
              <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                Scheduled Job
              </span>
            </>
          ) : (
            <>
              <SquarePlay className="h-4 w-4 text-status-success shrink-0" />
              {isTruncated ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono group-hover:text-primary transition-colors cursor-pointer">
                        {job.id.slice(0, 16)}...
                      </code>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="flex items-center gap-2 max-w-md"
                      onClick={(e) => e.preventDefault()}
                    >
                      <code className="text-xs font-mono break-all">{job.id}</code>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="shrink-0 p-1 rounded hover:bg-white/20 transition-colors"
                        aria-label="Copy job ID"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-status-success" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono group-hover:text-primary transition-colors">
                  {job.id}
                </code>
              )}
            </>
          )}
        </Link>
      </TableCell>
      <TableCell className="text-sm">{job.name}</TableCell>
      <TableCell>
        <StatusIndicator status={status} />
      </TableCell>
      <TableCell className="text-sm tabular-nums text-muted-foreground">
        {job.attemptsMade}/{job.maxAttempts}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{formatDate(job.timestamp)}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{formatDate(job.finishedOn)}</TableCell>
    </TableRow>
  )
}
