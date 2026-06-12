import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import {
  Activity,
  AlertCircle,
  BarChart3,
  Calendar,
  Clock,
  Cpu,
  Database,
  Gauge,
  Layers,
  LineChart,
  Network,
  RefreshCw,
  Server,
  Timer,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import { z } from 'zod'
import { useAppTopBar } from '@/components/app-top-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
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
import type { QueueNativeMetricsResponse } from '@/hooks/use-queues'
import { fetchApi } from '@/lib/api'
import { cn, formatNumber, getTimezoneAbbreviation } from '@/lib/utils'

const METRICS_WINDOWS = [
  { label: '1H', value: '1h', minutes: 60 },
  { label: '6H', value: '6h', minutes: 360 },
  { label: '24H', value: '24h', minutes: 1440 },
  { label: '7D', value: '7d', minutes: 10080 },
  { label: '14D', value: '14d', minutes: 20160 },
  { label: '30D', value: '30d', minutes: 43200 },
] as const

const PRIORITY_BUCKETS = [1, 2, 5, 10, 20, 50, 100, 500]
const METRICS_PAGE_SIZE = 25
const SCHEDULES_PAGE_SIZE = 100
const ANALYTICS_REFRESH_MS = 20000
const QUEUE_IDLE_ACTIVE_THRESHOLD_MS = 5000
const QUEUE_IDLE_STALE_THRESHOLD_MS = 60000

const analyticsSearchSchema = z.object({
  window: z.enum(['1h', '6h', '24h', '7d', '14d', '30d']).catch('24h'),
})

const throughputChartConfig = {
  total: {
    label: 'Finished/min',
    theme: {
      light: 'hsl(219 86% 48%)',
      dark: 'hsl(210 94% 68%)',
    },
  },
  completed: {
    label: 'Completed/min',
    theme: {
      light: 'hsl(146 55% 42%)',
      dark: 'hsl(145 63% 54%)',
    },
  },
  failed: {
    label: 'Failed/min',
    theme: {
      light: 'hsl(0 80% 56%)',
      dark: 'hsl(2 90% 66%)',
    },
  },
  activeQueues: {
    label: 'Queues With Throughput',
    theme: {
      light: 'hsl(41 92% 48%)',
      dark: 'hsl(44 96% 62%)',
    },
  },
} satisfies ChartConfig

const queueStateChartConfig = {
  running: {
    label: 'Running Queues',
    theme: {
      light: 'hsl(145 63% 46%)',
      dark: 'hsl(145 63% 58%)',
    },
  },
  paused: {
    label: 'Paused Queues',
    theme: {
      light: 'hsl(35 96% 51%)',
      dark: 'hsl(38 98% 61%)',
    },
  },
  rateLimited: {
    label: 'Rate Limited',
    theme: {
      light: 'hsl(350 83% 56%)',
      dark: 'hsl(352 92% 66%)',
    },
  },
  maxed: {
    label: 'Queue Maxed',
    theme: {
      light: 'hsl(267 84% 59%)',
      dark: 'hsl(271 96% 72%)',
    },
  },
} satisfies ChartConfig

const backlogChartConfig = {
  waiting: {
    label: 'Waiting To Process',
    theme: {
      light: 'hsl(219 86% 48%)',
      dark: 'hsl(210 94% 68%)',
    },
  },
  active: {
    label: 'Active Jobs',
    theme: {
      light: 'hsl(146 55% 42%)',
      dark: 'hsl(145 63% 54%)',
    },
  },
} satisfies ChartConfig

const failureChartConfig = {
  failureRate: {
    label: 'Failure Rate',
    theme: {
      light: 'hsl(0 80% 56%)',
      dark: 'hsl(2 90% 66%)',
    },
  },
  failedInWindow: {
    label: 'Failed In Window',
    theme: {
      light: 'hsl(35 96% 51%)',
      dark: 'hsl(38 98% 61%)',
    },
  },
} satisfies ChartConfig

const breadthChartConfig = {
  activeQueues: {
    label: 'Queues With Throughput',
    theme: {
      light: 'hsl(145 63% 46%)',
      dark: 'hsl(145 63% 58%)',
    },
  },
  queuesWithFailures: {
    label: 'Queues With Failures',
    theme: {
      light: 'hsl(0 80% 56%)',
      dark: 'hsl(2 90% 66%)',
    },
  },
} satisfies ChartConfig

const schedulesChartConfig = {
  schedules: {
    label: 'Scheduled Jobs',
    theme: {
      light: 'hsl(219 86% 48%)',
      dark: 'hsl(210 94% 68%)',
    },
  },
  recentFailures: {
    label: 'Recent Failures',
    theme: {
      light: 'hsl(0 80% 56%)',
      dark: 'hsl(2 90% 66%)',
    },
  },
} satisfies ChartConfig

type QueueSortMode = 'health' | 'backlog' | 'failures' | 'throughput'
type HealthTone = 'healthy' | 'watch' | 'critical'

interface DetailedMetricsPageResponse {
  metrics: QueueNativeMetricsResponse[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasMore: boolean
}

interface FleetMetricsPayload {
  metrics: QueueNativeMetricsResponse[]
  totalQueues: number
  totalPages: number
  fetchedAt: number
}

interface ScheduledJobSummary {
  schedulerId: string
  pattern: string
  queueName: string
  jobName: string
  nextRun?: number
  enabled: boolean
  data?: Record<string, unknown>
  recentFailedCount?: number
  lastFailedAt?: number
}

interface ScheduledJobsPageResponse {
  scheduledJobs: ScheduledJobSummary[]
  total: number
  page: number
  pageSize: number
  totalQueuesScanned: number
  totalQueues: number
  hasMore: boolean
}

interface ScheduledJobsPayload {
  scheduledJobs: ScheduledJobSummary[]
  fetchedAt: number
}

interface FleetSeriesPoint {
  timestamp: number
  total: number
  completed: number
  failed: number
  activeQueues: number
  queuesWithFailures: number
}

interface QueueAnalyticsRow {
  queueName: string
  waiting: number
  active: number
  delayed: number
  completed: number
  failed: number
  paused: number
  prioritized: number
  waitingChildren: number
  waitingToProcess: number
  workersCount: number
  schedulersCount: number
  queueEventsCount: number
  isPaused: boolean
  isMaxed: boolean
  rateLimited: boolean
  warningCount: number
  completedInWindow: number
  failedInWindow: number
  finishedInWindow: number
  avgThroughput: number
  peakThroughput: number
  failureRate: number
  successRate: number
  backlogPerWorker: number | null
  latestPointAgeMs: number | null
  healthScore: number
}

interface WorkerClientRow {
  queueName: string
  id: string
  name: string
  address: string
  ageMs: number
  idleMs: number
}

interface WarningRow {
  queueName: string
  message: string
}

interface WarningInsight {
  message: string
  count: number
}

interface FleetAnalytics {
  queueRows: QueueAnalyticsRow[]
  throughputSeries: FleetSeriesPoint[]
  totals: {
    waiting: number
    active: number
    delayed: number
    completed: number
    failed: number
    paused: number
    prioritized: number
    waitingChildren: number
    waitingToProcess: number
    workers: number
    schedulers: number
    queueEvents: number
    completedInWindow: number
    failedInWindow: number
    finishedInWindow: number
    avgFinishedPerMinute: number
    peakFinishedPerMinute: number
    peakFailedPerMinute: number
    successRateInWindow: number
    failureRateInWindow: number
    rateLimitedQueues: number
    maxedQueues: number
    runningQueues: number
    pausedQueues: number
    staleQueues: number
    warningSignals: number
    metricsLatestSampleAgeMs: number | null
  }
  fleetHealthScore: number
  healthTone: HealthTone
  backlogChartData: Array<{
    queueName: string
    queueLabel: string
    waiting: number
    active: number
  }>
  failureChartData: Array<{
    queueName: string
    queueLabel: string
    failureRate: number
    failedInWindow: number
  }>
  breadthSeries: FleetSeriesPoint[]
  queueStateData: Array<{ key: 'running' | 'paused' | 'rateLimited' | 'maxed'; value: number }>
  workerStateData: Array<{ key: 'active' | 'warm' | 'stale'; label: string; value: number }>
  scheduleChartData: Array<{
    queueName: string
    queueLabel: string
    schedules: number
    recentFailures: number
  }>
  topRiskQueues: QueueAnalyticsRow[]
  topThroughputQueues: QueueAnalyticsRow[]
  topIdleWorkers: WorkerClientRow[]
  warningRows: WarningRow[]
  warningInsights: WarningInsight[]
  schedules: {
    total: number
    queuesWithSchedules: number
    failingSchedules: number
    recentFailures: number
    next24h: number
  }
  workers: {
    total: number
    active: number
    warm: number
    stale: number
    averageIdleMs: number | null
    oldestAgeMs: number | null
  }
}

export const Route = createFileRoute('/$orgSlug/c/$connectionId/analytics')({
  validateSearch: zodValidator(analyticsSearchSchema),
  component: AnalyticsPage,
})

function AnalyticsPage() {
  const { orgSlug, connectionId } = Route.useParams()
  const { window } = Route.useSearch()
  const navigate = useNavigate()
  const [queueSort, setQueueSort] = useState<QueueSortMode>('health')
  const [showOnlyRisky, setShowOnlyRisky] = useState(false)

  const selectedWindow = useMemo(
    () => METRICS_WINDOWS.find((entry) => entry.value === window) ?? METRICS_WINDOWS[2],
    [window]
  )

  const metricsQuery = useQuery({
    queryKey: ['analytics', connectionId, 'metrics', selectedWindow.value],
    queryFn: () => fetchAllQueueMetrics(connectionId, selectedWindow.minutes),
    placeholderData: (previousData) => previousData,
    enabled: !!connectionId,
  })

  const schedulesQuery = useQuery({
    queryKey: ['analytics', connectionId, 'scheduled-jobs'],
    queryFn: () => fetchAllScheduledJobs(connectionId),
    placeholderData: (previousData) => previousData,
    enabled: !!connectionId,
  })

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      void metricsQuery.refetch()
      void schedulesQuery.refetch()
    }, ANALYTICS_REFRESH_MS)

    return () => clearInterval(interval)
  }, [metricsQuery.refetch, schedulesQuery.refetch])

  const analytics = useMemo<FleetAnalytics>(
    () =>
      buildFleetAnalytics(
        metricsQuery.data?.metrics ?? [],
        schedulesQuery.data?.scheduledJobs ?? []
      ),
    [metricsQuery.data?.metrics, schedulesQuery.data?.scheduledJobs]
  )

  const sortedQueueRows = useMemo(() => {
    const rows = showOnlyRisky
      ? analytics.queueRows.filter(
          (row) =>
            row.healthScore < 80 ||
            row.warningCount > 0 ||
            row.failureRate >= 0.05 ||
            row.waitingToProcess > 0
        )
      : [...analytics.queueRows]

    const nextRows = [...rows]

    nextRows.sort((a, b) => {
      switch (queueSort) {
        case 'backlog':
          return b.waitingToProcess - a.waitingToProcess || a.healthScore - b.healthScore
        case 'failures':
          return b.failureRate - a.failureRate || b.failedInWindow - a.failedInWindow
        case 'throughput':
          return b.avgThroughput - a.avgThroughput || b.finishedInWindow - a.finishedInWindow
        default:
          return a.healthScore - b.healthScore || b.waitingToProcess - a.waitingToProcess
      }
    })

    return nextRows
  }, [analytics.queueRows, queueSort, showOnlyRisky])

  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <BarChart3 className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Analytics</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">
            Cross-queue BullMQ fleet health and capacity intelligence
          </span>
        </div>
      ),
    }),
    []
  )

  useAppTopBar(topBarConfig)

  const isLoading = metricsQuery.isLoading && !metricsQuery.data
  const isRefreshing = metricsQuery.isFetching || schedulesQuery.isFetching
  const metricsError = metricsQuery.error as Error | null
  const schedulesError = schedulesQuery.error as Error | null
  const hasNoQueues = !isLoading && analytics.queueRows.length === 0
  const freshnessLabel = formatAgeFromMs(analytics.totals.metricsLatestSampleAgeMs)
  const staleThresholdMs = 5 * 60 * 1000
  const isStale =
    analytics.totals.metricsLatestSampleAgeMs !== null &&
    analytics.totals.metricsLatestSampleAgeMs > staleThresholdMs

  const handleRefresh = () => {
    void Promise.all([metricsQuery.refetch(), schedulesQuery.refetch()])
  }

  if (isLoading) {
    return <AnalyticsLoadingState />
  }

  if (metricsError) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="mb-4 rounded-full bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-semibold">Unable to load analytics</h2>
        <p className="mt-2 max-w-xl text-center text-sm text-muted-foreground">
          {metricsError.message}
        </p>
        <Button className="mt-5" onClick={handleRefresh}>
          Retry
        </Button>
      </div>
    )
  }

  if (hasNoQueues) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 py-16">
        <div className="mb-4 rounded-full bg-muted p-4">
          <Layers className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">No queues detected</h3>
        <p className="mt-1 max-w-lg text-center text-sm text-muted-foreground">
          Connect at least one BullMQ queue to unlock connection-wide analytics and queue health
          intelligence.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-background via-muted/10 to-background">
        <div className="pointer-events-none absolute -top-28 left-1/3 h-56 w-56 rounded-full bg-[hsl(210_100%_60%_/_0.16)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-0 h-56 w-56 rounded-full bg-[hsl(145_90%_45%_/_0.15)] blur-3xl" />

        <CardHeader className="relative border-b border-border/60 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={healthToneToBadgeVariant(analytics.healthTone)}>
                  Fleet Health: {analytics.healthTone.toUpperCase()}
                </Badge>
                <Badge variant={isStale ? 'warning' : 'success'}>Freshness: {freshnessLabel}</Badge>
                <Badge variant="outline">
                  Queues Scanned: {formatNumber(metricsQuery.data?.totalQueues ?? 0)}
                </Badge>
                <Badge variant="outline">
                  Metrics Pages: {formatNumber(metricsQuery.data?.totalPages ?? 0)}
                </Badge>
              </div>
              <CardTitle className="text-2xl md:text-3xl">BullMQ Fleet Analytics</CardTitle>
              <CardDescription className="max-w-3xl text-sm md:text-base">
                Deep observability across every queue on this connection: throughput dynamics,
                backlog pressure, worker health, schedule risk, and control-plane anomalies.
              </CardDescription>
            </div>

            <div className="flex min-w-[220px] flex-col items-end gap-3">
              <FleetHealthDial score={analytics.fleetHealthScore} />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {isRefreshing ? 'Refreshing...' : `Auto refresh ${ANALYTICS_REFRESH_MS / 1000}s`}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center gap-2">
            {METRICS_WINDOWS.map((entry) => (
              <Button
                key={entry.value}
                size="xs"
                variant={selectedWindow.value === entry.value ? 'default' : 'outline'}
                onClick={() =>
                  navigate({
                    to: '.',
                    search: { window: entry.value },
                    replace: true,
                  })
                }
              >
                {entry.label}
              </Button>
            ))}
            <Button
              size="xs"
              variant="outline"
              className="ml-2"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <AnalyticsMetricCard
          icon={Layers}
          title="Queues"
          value={formatNumber(analytics.queueRows.length)}
          subtitle="Total queue surfaces"
        />
        <AnalyticsMetricCard
          icon={Activity}
          title="Running Queues"
          value={formatNumber(analytics.totals.runningQueues)}
          subtitle="Not paused"
          tone="good"
        />
        <AnalyticsMetricCard
          icon={Timer}
          title="Paused Queues"
          value={formatNumber(analytics.totals.pausedQueues)}
          subtitle="Administrative pause"
          tone={analytics.totals.pausedQueues > 0 ? 'warn' : 'neutral'}
        />
        <AnalyticsMetricCard
          icon={Server}
          title="Workers"
          value={formatNumber(analytics.totals.workers)}
          subtitle="Connected worker clients"
        />
        <AnalyticsMetricCard
          icon={Calendar}
          title="Schedulers"
          value={formatNumber(analytics.totals.schedulers)}
          subtitle="Detected queue schedulers"
        />
        <AnalyticsMetricCard
          icon={Database}
          title="Queue Events"
          value={formatNumber(analytics.totals.queueEvents)}
          subtitle="Queue event clients"
        />
        <AnalyticsMetricCard
          icon={Gauge}
          title="Waiting To Process"
          value={formatNumber(analytics.totals.waitingToProcess)}
          subtitle="Fleet backlog depth"
          tone={analytics.totals.waitingToProcess > 0 ? 'warn' : 'neutral'}
        />
        <AnalyticsMetricCard
          icon={Activity}
          title="Active Jobs"
          value={formatNumber(analytics.totals.active)}
          subtitle="Currently processing"
          tone={analytics.totals.active > 0 ? 'good' : 'neutral'}
        />
        <AnalyticsMetricCard
          icon={Clock}
          title="Delayed Jobs"
          value={formatNumber(analytics.totals.delayed)}
          subtitle="Scheduled for later"
        />
        <AnalyticsMetricCard
          icon={AlertCircle}
          title="Failed Jobs"
          value={formatNumber(analytics.totals.failed)}
          subtitle="Current failed set"
          tone={analytics.totals.failed > 0 ? 'critical' : 'neutral'}
        />
        <AnalyticsMetricCard
          icon={LineChart}
          title="Avg Throughput"
          value={formatRatePerMinute(analytics.totals.avgFinishedPerMinute)}
          subtitle="Finished jobs per minute"
          tone="good"
        />
        <AnalyticsMetricCard
          icon={Zap}
          title="Peak Throughput"
          value={formatNumber(analytics.totals.peakFinishedPerMinute)}
          subtitle="Highest minute burst"
          tone="good"
        />
        <AnalyticsMetricCard
          icon={AlertCircle}
          title="Failure Rate"
          value={formatPercentage(analytics.totals.failureRateInWindow)}
          subtitle="Across selected window"
          tone={analytics.totals.failureRateInWindow >= 0.08 ? 'critical' : 'neutral'}
        />
        <AnalyticsMetricCard
          icon={Gauge}
          title="Success Rate"
          value={formatPercentage(analytics.totals.successRateInWindow)}
          subtitle="Across selected window"
          tone={analytics.totals.successRateInWindow >= 0.96 ? 'good' : 'warn'}
        />
        <AnalyticsMetricCard
          icon={Network}
          title="Rate-Limited"
          value={formatNumber(analytics.totals.rateLimitedQueues)}
          subtitle="Queues with active TTL"
          tone={analytics.totals.rateLimitedQueues > 0 ? 'warn' : 'neutral'}
        />
        <AnalyticsMetricCard
          icon={Cpu}
          title="Queue Maxed"
          value={formatNumber(analytics.totals.maxedQueues)}
          subtitle="At max processing guard"
          tone={analytics.totals.maxedQueues > 0 ? 'warn' : 'neutral'}
        />
        <AnalyticsMetricCard
          icon={AlertCircle}
          title="Warning Signals"
          value={formatNumber(analytics.totals.warningSignals)}
          subtitle="Metric collection warnings"
          tone={analytics.totals.warningSignals > 0 ? 'critical' : 'neutral'}
        />
        <AnalyticsMetricCard
          icon={RefreshCw}
          title="Stale Queues"
          value={formatNumber(analytics.totals.staleQueues)}
          subtitle="Sample age > 5 minutes"
          tone={analytics.totals.staleQueues > 0 ? 'warn' : 'neutral'}
        />
        <AnalyticsMetricCard
          icon={Calendar}
          title="Schedules (24h)"
          value={formatNumber(analytics.schedules.next24h)}
          subtitle="Next-run jobs upcoming"
          tone={analytics.schedules.next24h > 0 ? 'good' : 'neutral'}
        />
        <AnalyticsMetricCard
          icon={AlertCircle}
          title="Failing Schedules"
          value={formatNumber(analytics.schedules.failingSchedules)}
          subtitle="Recent scheduler-linked failures"
          tone={analytics.schedules.failingSchedules > 0 ? 'critical' : 'neutral'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <LineChart className="h-4.5 w-4.5 text-muted-foreground" />
              Fleet Throughput Dynamics
            </CardTitle>
            <CardDescription>
              Aggregated BullMQ native metrics across all queues in the selected time window.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!analytics.throughputSeries.length ? (
              <EmptyChartState message="No metric points returned for this window." />
            ) : (
              <ChartContainer config={throughputChartConfig} className="h-[350px] w-full">
                <AreaChart
                  data={analytics.throughputSeries}
                  margin={{ left: 8, right: 12, top: 10, bottom: 10 }}
                >
                  <defs>
                    <linearGradient id="analytics-fill-total" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-total)" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="var(--color-total)" stopOpacity={0.06} />
                    </linearGradient>
                    <linearGradient id="analytics-fill-completed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.33} />
                      <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="analytics-fill-failed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-failed)" stopOpacity={0.34} />
                      <stop offset="95%" stopColor="var(--color-failed)" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={26}
                    tickFormatter={(value) =>
                      formatMetricAxisTime(Number(value), selectedWindow.minutes)
                    }
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={46}
                    tickFormatter={(value) => formatCompactCount(Number(value))}
                  />
                  <YAxis
                    yAxisId="queues"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    width={44}
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
                    fill="url(#analytics-fill-total)"
                    fillOpacity={1}
                    stroke="var(--color-total)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    dataKey="completed"
                    type="monotone"
                    fill="url(#analytics-fill-completed)"
                    fillOpacity={1}
                    stroke="var(--color-completed)"
                    strokeWidth={1.8}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    dataKey="failed"
                    type="monotone"
                    fill="url(#analytics-fill-failed)"
                    fillOpacity={1}
                    stroke="var(--color-failed)"
                    strokeWidth={1.8}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="queues"
                    dataKey="activeQueues"
                    type="monotone"
                    stroke="var(--color-activeQueues)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Queue State Mix</CardTitle>
            <CardDescription>Control-plane posture across discovered queues.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChartContainer config={queueStateChartConfig} className="h-[240px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
                <Pie
                  data={analytics.queueStateData}
                  dataKey="value"
                  nameKey="key"
                  innerRadius={52}
                  outerRadius={84}
                  strokeWidth={3}
                >
                  {analytics.queueStateData.map((entry) => (
                    <Cell key={entry.key} fill={`var(--color-${entry.key})`} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="space-y-2 text-xs">
              {analytics.queueStateData.map((entry) => (
                <div key={entry.key} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-[2px]"
                      style={{ backgroundColor: `var(--color-${entry.key})` }}
                    />
                    <span className="capitalize text-muted-foreground">{entry.key}</span>
                  </div>
                  <span className="font-mono tabular-nums">{formatNumber(entry.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Backlog Pressure By Queue</CardTitle>
            <CardDescription>
              Queues with the highest `waitingToProcess` and active work.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!analytics.backlogChartData.length ? (
              <EmptyChartState message="No backlog pressure detected." />
            ) : (
              <ChartContainer config={backlogChartConfig} className="h-[340px] w-full">
                <BarChart
                  data={analytics.backlogChartData}
                  layout="vertical"
                  margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => formatCompactCount(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="queueLabel"
                    width={122}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) =>
                          (payload?.[0]?.payload as { queueName?: string } | undefined)
                            ?.queueName ?? ''
                        }
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="waiting" fill="var(--color-waiting)" radius={[0, 6, 6, 0]} />
                  <Bar dataKey="active" fill="var(--color-active)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Failure Risk By Queue</CardTitle>
            <CardDescription>Highest failure-rate queues for the selected window.</CardDescription>
          </CardHeader>
          <CardContent>
            {!analytics.failureChartData.length ? (
              <EmptyChartState message="No queue has finished jobs in this window yet." />
            ) : (
              <ChartContainer config={failureChartConfig} className="h-[340px] w-full">
                <BarChart
                  data={analytics.failureChartData}
                  layout="vertical"
                  margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="queueLabel"
                    width={122}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) =>
                          (payload?.[0]?.payload as { queueName?: string } | undefined)
                            ?.queueName ?? ''
                        }
                        formatter={(value, name, item) => {
                          if (name === 'failureRate') {
                            return `${Number(value).toFixed(1)}%`
                          }
                          return formatNumber(Number(item.payload?.failedInWindow ?? 0))
                        }}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar
                    dataKey="failureRate"
                    fill="var(--color-failureRate)"
                    radius={[0, 6, 6, 0]}
                  />
                  <Bar
                    dataKey="failedInWindow"
                    fill="var(--color-failedInWindow)"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Queue Activity Breadth</CardTitle>
            <CardDescription>
              How many queues are producing throughput and failures over time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!analytics.breadthSeries.length ? (
              <EmptyChartState message="No activity breadth samples available." />
            ) : (
              <ChartContainer config={breadthChartConfig} className="h-[300px] w-full">
                <RechartsLineChart
                  data={analytics.breadthSeries}
                  margin={{ left: 8, right: 12, top: 10, bottom: 10 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={26}
                    tickFormatter={(value) =>
                      formatMetricAxisTime(Number(value), selectedWindow.minutes)
                    }
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => formatCompactCount(Number(value))}
                    width={44}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) => formatMetricTooltipLabel(Number(value))}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line
                    dataKey="activeQueues"
                    type="monotone"
                    stroke="var(--color-activeQueues)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="queuesWithFailures"
                    type="monotone"
                    stroke="var(--color-queuesWithFailures)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </RechartsLineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Schedule Pressure By Queue</CardTitle>
            <CardDescription>
              Scheduled workloads and recent schedule-linked failures.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {schedulesError ? (
              <div className="rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
                Scheduled jobs analytics unavailable: {schedulesError.message}
              </div>
            ) : !analytics.scheduleChartData.length ? (
              <EmptyChartState message="No scheduled jobs were discovered." />
            ) : (
              <ChartContainer config={schedulesChartConfig} className="h-[300px] w-full">
                <BarChart
                  data={analytics.scheduleChartData}
                  layout="vertical"
                  margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => formatCompactCount(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="queueLabel"
                    width={122}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) =>
                          (payload?.[0]?.payload as { queueName?: string } | undefined)
                            ?.queueName ?? ''
                        }
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="schedules" fill="var(--color-schedules)" radius={[0, 6, 6, 0]} />
                  <Bar
                    dataKey="recentFailures"
                    fill="var(--color-recentFailures)"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Highest Queue Risk</CardTitle>
            <CardDescription>Queues sorted by lowest health score.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.topRiskQueues.length === 0 ? (
              <p className="text-sm text-muted-foreground">No risk-ranked queues yet.</p>
            ) : (
              analytics.topRiskQueues.map((row) => (
                <div
                  key={row.queueName}
                  className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      to="/$orgSlug/c/$connectionId/queues/$queueName"
                      params={{ orgSlug, connectionId, queueName: row.queueName }}
                      className="truncate text-sm font-medium hover:text-primary"
                    >
                      {row.queueName}
                    </Link>
                    <HealthBadge score={row.healthScore} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <span>Waiting: {formatNumber(row.waitingToProcess)}</span>
                    <span>Failed/min: {formatNumber(row.failedInWindow)}</span>
                    <span>Failure rate: {formatPercentage(row.failureRate)}</span>
                    <span>Workers: {formatNumber(row.workersCount)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Throughput Queues</CardTitle>
            <CardDescription>Queues carrying the highest per-minute load.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.topThroughputQueues.length === 0 ? (
              <p className="text-sm text-muted-foreground">No throughput-ranked queues yet.</p>
            ) : (
              analytics.topThroughputQueues.map((row) => (
                <div
                  key={row.queueName}
                  className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      to="/$orgSlug/c/$connectionId/queues/$queueName"
                      params={{ orgSlug, connectionId, queueName: row.queueName }}
                      className="truncate text-sm font-medium hover:text-primary"
                    >
                      {row.queueName}
                    </Link>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatRatePerMinute(row.avgThroughput)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <span>Peak/min: {formatNumber(row.peakThroughput)}</span>
                    <span>Finished: {formatNumber(row.finishedInWindow)}</span>
                    <span>Success: {formatPercentage(row.successRate)}</span>
                    <span>Backlog/worker: {formatDecimal(row.backlogPerWorker)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Worker Health</CardTitle>
            <CardDescription>Idle distribution and oldest idle workers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {analytics.workerStateData.map((state) => {
                const total = Math.max(analytics.workers.total, 1)
                const pct = (state.value / total) * 100
                const barColor =
                  state.key === 'active'
                    ? 'bg-status-success'
                    : state.key === 'warm'
                      ? 'bg-status-warning'
                      : 'bg-status-danger'

                return (
                  <div key={state.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{state.label}</span>
                      <span className="font-mono tabular-nums">
                        {formatNumber(state.value)} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div
                        className={cn('h-1.5 rounded-full', barColor)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>Average idle</span>
                <span className="font-mono tabular-nums">
                  {formatDurationFromMs(analytics.workers.averageIdleMs)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span>Oldest client age</span>
                <span className="font-mono tabular-nums">
                  {formatDurationFromMs(analytics.workers.oldestAgeMs)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {analytics.topIdleWorkers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No worker clients discovered.</p>
              ) : (
                analytics.topIdleWorkers.map((worker) => (
                  <div
                    key={`${worker.queueName}:${worker.id}:${worker.address}`}
                    className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-mono">
                        {worker.name || worker.id || 'worker-client'}
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        idle {formatDurationFromMs(worker.idleMs)}
                      </span>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      <span className="truncate">{worker.queueName}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Queue Risk Matrix</CardTitle>
              <CardDescription>
                Queue-by-queue breakdown of health, throughput, backlog, and control signals.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={queueSort}
                onChange={(event) => setQueueSort(event.target.value as QueueSortMode)}
                className="h-8 w-[170px] text-xs"
              >
                <option value="health">Sort: Health Score</option>
                <option value="backlog">Sort: Backlog</option>
                <option value="failures">Sort: Failure Rate</option>
                <option value="throughput">Sort: Throughput</option>
              </Select>

              <Button
                size="xs"
                variant={showOnlyRisky ? 'default' : 'outline'}
                onClick={() => setShowOnlyRisky((prev) => !prev)}
              >
                {showOnlyRisky ? 'Show All Queues' : 'Only Risky Queues'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="max-h-[560px] overflow-auto rounded-md border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Queue</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Waiting</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Workers</TableHead>
                  <TableHead>Throughput</TableHead>
                  <TableHead>Failure Rate</TableHead>
                  <TableHead>Latest Sample</TableHead>
                  <TableHead>Signals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedQueueRows.map((row) => (
                  <TableRow key={row.queueName}>
                    <TableCell className="max-w-[260px]">
                      <div className="flex min-w-0 flex-col">
                        <Link
                          to="/$orgSlug/c/$connectionId/queues/$queueName"
                          params={{ orgSlug, connectionId, queueName: row.queueName }}
                          className="truncate font-medium hover:text-primary"
                        >
                          {row.queueName}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          schedulers {formatNumber(row.schedulersCount)} • queue-events{' '}
                          {formatNumber(row.queueEventsCount)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <HealthBadge score={row.healthScore} />
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {formatNumber(row.waitingToProcess)}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {formatNumber(row.active)}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {formatNumber(row.workersCount)}
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs tabular-nums">
                        {formatRatePerMinute(row.avgThroughput)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        peak {formatNumber(row.peakThroughput)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs tabular-nums">
                        {formatPercentage(row.failureRate)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        failed {formatNumber(row.failedInWindow)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatAgeFromMs(row.latestPointAgeMs)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {row.isPaused && (
                          <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                            Paused
                          </Badge>
                        )}
                        {row.rateLimited && (
                          <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                            Rate Limited
                          </Badge>
                        )}
                        {row.isMaxed && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                            Maxed
                          </Badge>
                        )}
                        {row.warningCount > 0 && (
                          <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                            {row.warningCount} warning{row.warningCount === 1 ? '' : 's'}
                          </Badge>
                        )}
                        {!row.isPaused &&
                        !row.rateLimited &&
                        !row.isMaxed &&
                        row.warningCount === 0 ? (
                          <span className="text-xs text-muted-foreground">Clean</span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Warning Intelligence</CardTitle>
          <CardDescription>
            Native metrics collection warnings across queues. Timezone: {getTimezoneAbbreviation()}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {analytics.warningRows.length === 0 ? (
            <div className="rounded-md border border-status-success/30 bg-status-success/10 px-3 py-2 text-xs text-status-success">
              No queue-level metrics warnings were reported in this sample.
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {analytics.warningInsights.slice(0, 8).map((insight) => (
                  <div
                    key={insight.message}
                    className="rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <div className="text-xs text-muted-foreground">{insight.message}</div>
                    <div className="mt-1 font-mono text-sm tabular-nums">
                      {formatNumber(insight.count)} queues
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {analytics.warningRows.slice(0, 24).map((warning, index) => (
                  <div
                    key={`${warning.queueName}:${warning.message}:${index}`}
                    className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{warning.queueName}</span>
                      <Link
                        to="/$orgSlug/c/$connectionId/queues/$queueName"
                        params={{ orgSlug, connectionId, queueName: warning.queueName }}
                        className="text-primary hover:underline"
                      >
                        open queue
                      </Link>
                    </div>
                    <p className="mt-1 text-muted-foreground">{warning.message}</p>
                  </div>
                ))}
                {analytics.warningRows.length > 24 ? (
                  <p className="text-xs text-muted-foreground">
                    +{formatNumber(analytics.warningRows.length - 24)} more warning entries.
                  </p>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

async function fetchAllQueueMetrics(connectionId: string, windowMinutes: number) {
  const metrics: QueueNativeMetricsResponse[] = []
  let page = 1
  let totalPages = 1
  let totalQueues = 0

  while (page <= totalPages) {
    const params = new URLSearchParams({
      detailed: '1',
      windowMinutes: String(windowMinutes),
      priorities: PRIORITY_BUCKETS.join(','),
      page: String(page),
      pageSize: String(METRICS_PAGE_SIZE),
    })

    const response = await fetchApi<DetailedMetricsPageResponse>(
      `/api/c/${encodeURIComponent(connectionId)}/metrics?${params.toString()}`
    )

    metrics.push(...response.metrics)
    totalPages = Math.max(response.totalPages, 1)
    totalQueues = response.total
    page += 1
  }

  return {
    metrics,
    totalQueues,
    totalPages,
    fetchedAt: Date.now(),
  } satisfies FleetMetricsPayload
}

async function fetchAllScheduledJobs(connectionId: string) {
  const scheduledJobs: ScheduledJobSummary[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(SCHEDULES_PAGE_SIZE),
    })

    const response = await fetchApi<ScheduledJobsPageResponse>(
      `/api/c/${encodeURIComponent(connectionId)}/scheduled-jobs?${params.toString()}`
    )

    scheduledJobs.push(...response.scheduledJobs)
    hasMore = response.hasMore
    page += 1
  }

  return {
    scheduledJobs,
    fetchedAt: Date.now(),
  } satisfies ScheduledJobsPayload
}

function buildFleetAnalytics(
  queueMetrics: QueueNativeMetricsResponse[],
  scheduledJobs: ScheduledJobSummary[]
): FleetAnalytics {
  const throughputMap = new Map<number, FleetSeriesPoint>()
  const queueRows: QueueAnalyticsRow[] = []
  const warningRows: WarningRow[] = []
  const workerRows: WorkerClientRow[] = []

  let totalWaiting = 0
  let totalActive = 0
  let totalDelayed = 0
  let totalCompleted = 0
  let totalFailed = 0
  let totalPaused = 0
  let totalPrioritized = 0
  let totalWaitingChildren = 0
  let totalWaitingToProcess = 0
  let totalWorkers = 0
  let totalSchedulers = 0
  let totalQueueEvents = 0
  let totalCompletedInWindow = 0
  let totalFailedInWindow = 0
  let totalFinishedInWindow = 0
  let rateLimitedQueues = 0
  let maxedQueues = 0
  let pausedQueues = 0
  let runningQueues = 0
  let staleQueues = 0

  for (const metric of queueMetrics) {
    const queueFinishedInWindow = metric.series.totals.finishedInWindow
    const queueFailedInWindow = metric.series.totals.failedInWindow
    const queueCompletedInWindow = metric.series.totals.completedInWindow
    const queueFailureRate =
      queueFinishedInWindow > 0 ? queueFailedInWindow / queueFinishedInWindow : 0
    const queueSuccessRate =
      queueFinishedInWindow > 0 ? queueCompletedInWindow / queueFinishedInWindow : 1
    const queueAvgThroughput =
      metric.series.totals.minutesInWindow > 0
        ? queueFinishedInWindow / metric.series.totals.minutesInWindow
        : 0
    const backlogPerWorker =
      metric.queue.workersCount > 0
        ? metric.queue.waitingToProcess / metric.queue.workersCount
        : null

    const latestPointAgeMs = metric.range.latestPointAgeMs
    if (latestPointAgeMs !== null && latestPointAgeMs > 5 * 60 * 1000) {
      staleQueues += 1
    }

    if (metric.queue.isPaused) {
      pausedQueues += 1
    } else {
      runningQueues += 1
    }

    if (metric.controls.rateLimited) {
      rateLimitedQueues += 1
    }
    if (metric.queue.isMaxed) {
      maxedQueues += 1
    }

    totalWaiting += metric.counts.waiting
    totalActive += metric.counts.active
    totalDelayed += metric.counts.delayed
    totalCompleted += metric.counts.completed
    totalFailed += metric.counts.failed
    totalPaused += metric.counts.paused
    totalPrioritized += metric.counts.prioritized
    totalWaitingChildren += metric.counts.waitingChildren
    totalWaitingToProcess += metric.queue.waitingToProcess
    totalWorkers += metric.queue.workersCount
    totalSchedulers += metric.queue.schedulersCount
    totalQueueEvents += metric.queue.queueEventsCount
    totalCompletedInWindow += queueCompletedInWindow
    totalFailedInWindow += queueFailedInWindow
    totalFinishedInWindow += queueFinishedInWindow

    for (const worker of metric.queue.workers) {
      workerRows.push({
        queueName: metric.queueName,
        id: worker.id,
        name: worker.name,
        address: worker.address,
        ageMs: worker.ageMs,
        idleMs: worker.idleMs,
      })
    }

    for (const warning of metric.warnings) {
      warningRows.push({
        queueName: metric.queueName,
        message: warning,
      })
    }

    for (const point of metric.series.points) {
      const existing = throughputMap.get(point.timestamp)

      if (!existing) {
        throughputMap.set(point.timestamp, {
          timestamp: point.timestamp,
          total: point.total,
          completed: point.completed,
          failed: point.failed,
          activeQueues: point.total > 0 ? 1 : 0,
          queuesWithFailures: point.failed > 0 ? 1 : 0,
        })
        continue
      }

      existing.total += point.total
      existing.completed += point.completed
      existing.failed += point.failed
      if (point.total > 0) {
        existing.activeQueues += 1
      }
      if (point.failed > 0) {
        existing.queuesWithFailures += 1
      }
    }

    const healthScore = computeQueueHealthScore({
      waitingToProcess: metric.queue.waitingToProcess,
      workersCount: metric.queue.workersCount,
      failureRate: queueFailureRate,
      isPaused: metric.queue.isPaused,
      isMaxed: metric.queue.isMaxed,
      rateLimited: metric.controls.rateLimited,
      warningCount: metric.warnings.length,
      latestPointAgeMs,
    })

    queueRows.push({
      queueName: metric.queueName,
      waiting: metric.counts.waiting,
      active: metric.counts.active,
      delayed: metric.counts.delayed,
      completed: metric.counts.completed,
      failed: metric.counts.failed,
      paused: metric.counts.paused,
      prioritized: metric.counts.prioritized,
      waitingChildren: metric.counts.waitingChildren,
      waitingToProcess: metric.queue.waitingToProcess,
      workersCount: metric.queue.workersCount,
      schedulersCount: metric.queue.schedulersCount,
      queueEventsCount: metric.queue.queueEventsCount,
      isPaused: metric.queue.isPaused,
      isMaxed: metric.queue.isMaxed,
      rateLimited: metric.controls.rateLimited,
      warningCount: metric.warnings.length,
      completedInWindow: queueCompletedInWindow,
      failedInWindow: queueFailedInWindow,
      finishedInWindow: queueFinishedInWindow,
      avgThroughput: queueAvgThroughput,
      peakThroughput: metric.series.totals.peakFinishedPerMinuteInWindow,
      failureRate: queueFailureRate,
      successRate: queueSuccessRate,
      backlogPerWorker,
      latestPointAgeMs,
      healthScore,
    })
  }

  const throughputSeries = Array.from(throughputMap.values()).sort(
    (a, b) => a.timestamp - b.timestamp
  )
  const peakFinishedPerMinute = throughputSeries.reduce(
    (max, point) => Math.max(max, point.total),
    0
  )
  const peakFailedPerMinute = throughputSeries.reduce(
    (max, point) => Math.max(max, point.failed),
    0
  )
  const avgFinishedPerMinute =
    throughputSeries.length > 0 ? totalFinishedInWindow / throughputSeries.length : 0
  const successRateInWindow =
    totalFinishedInWindow > 0 ? totalCompletedInWindow / totalFinishedInWindow : 1
  const failureRateInWindow =
    totalFinishedInWindow > 0 ? totalFailedInWindow / totalFinishedInWindow : 0
  const metricsLatestSampleAgeMs =
    throughputSeries.length > 0
      ? Math.max(Date.now() - throughputSeries[throughputSeries.length - 1].timestamp, 0)
      : null

  const weights = queueRows.map((row) => Math.max(row.finishedInWindow, row.waitingToProcess, 1))
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0)
  const weightedHealth = queueRows.reduce(
    (sum, row, index) => sum + row.healthScore * (weights[index] ?? 1),
    0
  )
  const fleetHealthScore =
    queueRows.length > 0 ? Math.round(weightedHealth / Math.max(weightTotal, 1)) : 100
  const healthTone: HealthTone =
    fleetHealthScore >= 80 ? 'healthy' : fleetHealthScore >= 60 ? 'watch' : 'critical'

  const queueStateData: FleetAnalytics['queueStateData'] = [
    { key: 'running', value: runningQueues },
    { key: 'paused', value: pausedQueues },
    { key: 'rateLimited', value: rateLimitedQueues },
    { key: 'maxed', value: maxedQueues },
  ]

  const workerActive = workerRows.filter(
    (worker) => worker.idleMs <= QUEUE_IDLE_ACTIVE_THRESHOLD_MS
  ).length
  const workerWarm = workerRows.filter(
    (worker) =>
      worker.idleMs > QUEUE_IDLE_ACTIVE_THRESHOLD_MS &&
      worker.idleMs <= QUEUE_IDLE_STALE_THRESHOLD_MS
  ).length
  const workerStale = workerRows.filter(
    (worker) => worker.idleMs > QUEUE_IDLE_STALE_THRESHOLD_MS
  ).length

  const averageWorkerIdleMs =
    workerRows.length > 0
      ? workerRows.reduce((sum, worker) => sum + worker.idleMs, 0) / workerRows.length
      : null

  const oldestWorkerAgeMs =
    workerRows.length > 0
      ? workerRows.reduce((max, worker) => Math.max(max, worker.ageMs), 0)
      : null

  const warningInsightsMap = new Map<string, number>()
  for (const warning of warningRows) {
    warningInsightsMap.set(warning.message, (warningInsightsMap.get(warning.message) ?? 0) + 1)
  }

  const warningInsights = Array.from(warningInsightsMap.entries())
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)

  const schedulesByQueue = new Map<string, { schedules: number; recentFailures: number }>()
  let failingSchedules = 0
  let scheduleRecentFailures = 0
  let schedulesNext24h = 0
  const now = Date.now()
  const next24hBoundary = now + 24 * 60 * 60 * 1000

  for (const schedule of scheduledJobs) {
    const existing = schedulesByQueue.get(schedule.queueName) ?? { schedules: 0, recentFailures: 0 }
    existing.schedules += 1

    const scheduleFailures = schedule.recentFailedCount ?? 0
    if (scheduleFailures > 0) {
      existing.recentFailures += scheduleFailures
      scheduleRecentFailures += scheduleFailures
      failingSchedules += 1
    }

    if (schedule.nextRun && schedule.nextRun >= now && schedule.nextRun <= next24hBoundary) {
      schedulesNext24h += 1
    }

    schedulesByQueue.set(schedule.queueName, existing)
  }

  const scheduleChartData = Array.from(schedulesByQueue.entries())
    .map(([queueName, aggregate]) => ({
      queueName,
      queueLabel: truncateQueueName(queueName, 20),
      schedules: aggregate.schedules,
      recentFailures: aggregate.recentFailures,
    }))
    .sort((a, b) => b.schedules - a.schedules || b.recentFailures - a.recentFailures)
    .slice(0, 10)

  const backlogChartData = [...queueRows]
    .sort((a, b) => b.waitingToProcess - a.waitingToProcess || b.active - a.active)
    .slice(0, 10)
    .map((row) => ({
      queueName: row.queueName,
      queueLabel: truncateQueueName(row.queueName, 20),
      waiting: row.waitingToProcess,
      active: row.active,
    }))

  const failureChartData = [...queueRows]
    .filter((row) => row.finishedInWindow > 0)
    .sort((a, b) => b.failureRate - a.failureRate || b.failedInWindow - a.failedInWindow)
    .slice(0, 10)
    .map((row) => ({
      queueName: row.queueName,
      queueLabel: truncateQueueName(row.queueName, 20),
      failureRate: row.failureRate * 100,
      failedInWindow: row.failedInWindow,
    }))

  const topRiskQueues = [...queueRows]
    .sort((a, b) => a.healthScore - b.healthScore || b.waitingToProcess - a.waitingToProcess)
    .slice(0, 8)

  const topThroughputQueues = [...queueRows]
    .sort((a, b) => b.avgThroughput - a.avgThroughput || b.finishedInWindow - a.finishedInWindow)
    .slice(0, 8)

  const topIdleWorkers = [...workerRows].sort((a, b) => b.idleMs - a.idleMs).slice(0, 8)

  return {
    queueRows,
    throughputSeries,
    totals: {
      waiting: totalWaiting,
      active: totalActive,
      delayed: totalDelayed,
      completed: totalCompleted,
      failed: totalFailed,
      paused: totalPaused,
      prioritized: totalPrioritized,
      waitingChildren: totalWaitingChildren,
      waitingToProcess: totalWaitingToProcess,
      workers: totalWorkers,
      schedulers: totalSchedulers,
      queueEvents: totalQueueEvents,
      completedInWindow: totalCompletedInWindow,
      failedInWindow: totalFailedInWindow,
      finishedInWindow: totalFinishedInWindow,
      avgFinishedPerMinute,
      peakFinishedPerMinute,
      peakFailedPerMinute,
      successRateInWindow,
      failureRateInWindow,
      rateLimitedQueues,
      maxedQueues,
      runningQueues,
      pausedQueues,
      staleQueues,
      warningSignals: warningRows.length,
      metricsLatestSampleAgeMs,
    },
    fleetHealthScore,
    healthTone,
    backlogChartData,
    failureChartData,
    breadthSeries: throughputSeries,
    queueStateData,
    workerStateData: [
      { key: 'active', label: 'Active (<= 5s idle)', value: workerActive },
      { key: 'warm', label: 'Warm (5s-60s idle)', value: workerWarm },
      { key: 'stale', label: 'Stale (> 60s idle)', value: workerStale },
    ],
    scheduleChartData,
    topRiskQueues,
    topThroughputQueues,
    topIdleWorkers,
    warningRows,
    warningInsights,
    schedules: {
      total: scheduledJobs.length,
      queuesWithSchedules: schedulesByQueue.size,
      failingSchedules,
      recentFailures: scheduleRecentFailures,
      next24h: schedulesNext24h,
    },
    workers: {
      total: workerRows.length,
      active: workerActive,
      warm: workerWarm,
      stale: workerStale,
      averageIdleMs: averageWorkerIdleMs,
      oldestAgeMs: oldestWorkerAgeMs,
    },
  }
}

function computeQueueHealthScore({
  waitingToProcess,
  workersCount,
  failureRate,
  isPaused,
  isMaxed,
  rateLimited,
  warningCount,
  latestPointAgeMs,
}: {
  waitingToProcess: number
  workersCount: number
  failureRate: number
  isPaused: boolean
  isMaxed: boolean
  rateLimited: boolean
  warningCount: number
  latestPointAgeMs: number | null
}) {
  let penalty = 0

  const backlogPerWorker = workersCount > 0 ? waitingToProcess / workersCount : waitingToProcess
  penalty += Math.min(backlogPerWorker / 40, 1) * 22
  penalty += Math.min(failureRate, 1) * 48

  if (workersCount === 0 && waitingToProcess > 0) {
    penalty += 16
  }
  if (isPaused && waitingToProcess > 0) {
    penalty += 10
  }
  if (rateLimited) {
    penalty += 8
  }
  if (isMaxed) {
    penalty += 8
  }
  penalty += Math.min(warningCount * 4, 16)

  if (latestPointAgeMs !== null) {
    if (latestPointAgeMs > 20 * 60 * 1000) {
      penalty += 12
    } else if (latestPointAgeMs > 10 * 60 * 1000) {
      penalty += 8
    } else if (latestPointAgeMs > 5 * 60 * 1000) {
      penalty += 4
    }
  }

  return clamp(Math.round(100 - penalty), 0, 100)
}

function healthToneToBadgeVariant(tone: HealthTone): 'success' | 'warning' | 'destructive' {
  switch (tone) {
    case 'healthy':
      return 'success'
    case 'watch':
      return 'warning'
    default:
      return 'destructive'
  }
}

function HealthBadge({ score }: { score: number }) {
  const tone = score >= 80 ? 'success' : score >= 60 ? 'warning' : 'destructive'
  return (
    <Badge variant={tone} className="font-mono text-[11px] tabular-nums">
      {score}
    </Badge>
  )
}

function FleetHealthDial({ score }: { score: number }) {
  const clampedScore = clamp(score, 0, 100)
  const trackColor = 'hsl(var(--color-border))'
  const fillColor =
    clampedScore >= 80
      ? 'hsl(145 63% 48%)'
      : clampedScore >= 60
        ? 'hsl(38 98% 61%)'
        : 'hsl(2 90% 66%)'

  return (
    <div className="relative">
      <div
        className="flex h-28 w-28 items-center justify-center rounded-full border border-border/60"
        style={{
          background: `conic-gradient(${fillColor} ${clampedScore * 3.6}deg, ${trackColor} ${clampedScore * 3.6}deg)`,
        }}
      >
        <div className="flex h-[78px] w-[78px] flex-col items-center justify-center rounded-full bg-background/95 shadow-sm">
          <span className="font-mono text-2xl font-semibold tabular-nums">{clampedScore}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Health</span>
        </div>
      </div>
    </div>
  )
}

function AnalyticsMetricCard({
  icon: Icon,
  title,
  value,
  subtitle,
  tone = 'neutral',
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  value: string
  subtitle: string
  tone?: 'neutral' | 'good' | 'warn' | 'critical'
}) {
  const toneClasses: Record<typeof tone, string> = {
    neutral: 'bg-card/70',
    good: 'bg-status-success/[0.08] border-status-success/30',
    warn: 'bg-status-warning/[0.1] border-status-warning/35',
    critical: 'bg-status-danger/[0.12] border-status-danger/40',
  }

  return (
    <Card className={cn('border-border/70 shadow-sm', toneClasses[tone])}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription className="text-[11px] uppercase tracking-wide">{title}</CardDescription>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-xl font-semibold tabular-nums">{value}</div>
        <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  )
}

function AnalyticsLoadingState() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-[460px] max-w-full" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map((id) => (
              <Skeleton key={id} className="h-8 w-12" />
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, index) => (
          <Card key={index}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-6 w-24" />
              <Skeleton className="mt-2 h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-[320px] w-full rounded-lg" />
        <Skeleton className="h-[320px] w-full rounded-lg" />
      </div>
    </div>
  )
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-lg border border-border/60 bg-muted/10 px-6 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function formatPercentage(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—'
  }

  return `${(value * 100).toFixed(digits)}%`
}

function formatRatePerMinute(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—'
  }

  if (value >= 1000) {
    return `${formatCompactCount(value)}/min`
  }

  if (value >= 100) {
    return `${value.toFixed(0)}/min`
  }

  return `${value.toFixed(1)}/min`
}

function formatCompactCount(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatDurationFromMs(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value) || value < 0) {
    return 'Unknown'
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`
  }

  if (value < 60000) {
    return `${(value / 1000).toFixed(1)}s`
  }

  if (value < 60 * 60 * 1000) {
    return `${(value / 60000).toFixed(1)}m`
  }

  if (value < 24 * 60 * 60 * 1000) {
    return `${(value / (60 * 60 * 1000)).toFixed(1)}h`
  }

  return `${(value / (24 * 60 * 60 * 1000)).toFixed(1)}d`
}

function formatAgeFromMs(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'Unknown'
  }

  if (value < 0) {
    return '0s'
  }

  return `${formatDurationFromMs(value)} ago`
}

function formatMetricAxisTime(timestamp: number, windowMinutes: number) {
  const date = new Date(timestamp)

  if (windowMinutes <= 360) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  if (windowMinutes <= 1440) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  if (windowMinutes <= 10080) {
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    })
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatMetricTooltipLabel(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
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

function truncateQueueName(queueName: string, maxLength: number) {
  if (queueName.length <= maxLength) {
    return queueName
  }

  return `${queueName.slice(0, Math.max(maxLength - 1, 1))}…`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
