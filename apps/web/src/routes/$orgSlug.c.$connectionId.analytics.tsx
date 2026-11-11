import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { AlertCircle, CalendarClock, Layers, Server, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts'
import { z } from 'zod'
import { AnalyticsWindowControls } from '@/components/analytics/analytics-window-controls'
import {
  type AnalyticsWindowValue,
  METRICS_WINDOWS,
} from '@/components/analytics/analytics-window-options'
import {
  CHART_HEIGHT_CLASS,
  ChartEmptyState,
  ChartPanel,
  SERIES_COLOR,
} from '@/components/analytics/chart-panel'
import { RedisHealthObservability } from '@/components/analytics/redis-health-observability'
import type { RedisHealthHistoryResponse } from '@/components/analytics/redis-health-types'
import { useAppTopBar } from '@/components/app-top-bar'
import { PageTitle } from '@/components/page-title'
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
import { EmptyState } from '@/components/ui/empty-state'
import { Metric, MetricStrip, type MetricTone } from '@/components/ui/metric'
import { Panel, PanelHeader, SectionHeader } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { QueueNativeMetricsResponse } from '@/hooks/use-queues'
import { fetchApi } from '@/lib/api'
import { cn, formatNumber, getTimezoneAbbreviation } from '@/lib/utils'
import { WORKER_IDLE_AFTER_SECONDS } from '@/lib/worker-activity'

const PRIORITY_BUCKETS = [1, 2, 5, 10, 20, 50, 100, 500]
const METRICS_PAGE_SIZE = 25
const SCHEDULES_PAGE_SIZE = 100
const ANALYTICS_REFRESH_MS = 20000
// Worker idle bands. `idleMs` is how long the worker's blocking Redis connection
// has gone without issuing a command. A healthy worker waiting for jobs re-issues
// its blocking pop at most every 10 seconds (BullMQ's maximum block timeout), so
// the active band must sit above that or every waiting worker flickers into Warm.
// Stale is the Workers page's idle threshold, so "stale" here and "idle" there
// always describe the same workers.
const WORKER_IDLE_ACTIVE_SECONDS = 15
const WORKER_IDLE_STALE_SECONDS = WORKER_IDLE_AFTER_SECONDS
const QUEUE_IDLE_ACTIVE_THRESHOLD_MS = WORKER_IDLE_ACTIVE_SECONDS * 1000
const QUEUE_IDLE_STALE_THRESHOLD_MS = WORKER_IDLE_STALE_SECONDS * 1000
const METRICS_STALE_THRESHOLD_MS = 5 * 60 * 1000
const WARNING_GROUP_LIMIT = 12
const WARNING_QUEUE_LIMIT = 8

const analyticsSearchSchema = z.object({
  window: z.enum(['1h', '6h', '24h', '7d', '14d', '30d']).catch('24h'),
})

// Six cells need ~160px each to show a 20px mono value and its hint without truncating, so
// between `lg` and `xl` (where the sidebar takes 240px) a strip wraps to two rows of three.
const STRIP_SIX_CLASS = 'lg:grid-flow-row lg:grid-cols-3 xl:grid-flow-col xl:grid-cols-none'
const STRIP_HALF_WIDTH_CLASS = 'lg:grid-flow-row lg:grid-cols-3'

const CHART_MARGIN = { left: 0, right: 8, top: 8, bottom: 0 }
const RANK_CHART_MARGIN = { left: 0, right: 12, top: 4, bottom: 0 }

// `total` is the top edge of the completed + failed stack. It is drawn without a
// stroke so it only contributes the "Finished" row to the tooltip.
const throughputChartConfig = {
  completed: { label: 'Completed/min', color: SERIES_COLOR.completed },
  failed: { label: 'Failed/min', color: SERIES_COLOR.failed },
  total: { label: 'Finished/min', color: 'transparent' },
} satisfies ChartConfig

const breadthChartConfig = {
  activeQueues: { label: 'Queues with throughput', color: SERIES_COLOR.active },
  queuesWithFailures: { label: 'Queues with failures', color: SERIES_COLOR.failed },
} satisfies ChartConfig

const backlogChartConfig = {
  waiting: { label: 'Waiting to process', color: SERIES_COLOR.waiting },
  active: { label: 'Active', color: SERIES_COLOR.active },
} satisfies ChartConfig

const failureChartConfig = {
  failureRate: { label: 'Failure rate', color: SERIES_COLOR.failed },
} satisfies ChartConfig

const schedulesChartConfig = {
  schedules: { label: 'Scheduled jobs', color: SERIES_COLOR.active },
  recentFailures: { label: 'Recent failures', color: SERIES_COLOR.failed },
} satisfies ChartConfig

const QUEUE_SORT_OPTIONS = [
  { value: 'health', label: 'Health' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'failures', label: 'Failures' },
  { value: 'throughput', label: 'Throughput' },
] as const

type QueueSortMode = (typeof QUEUE_SORT_OPTIONS)[number]['value']
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

  const {
    data: metricsData,
    error: metricsError,
    isFetching: isFetchingMetrics,
    isLoading: isLoadingMetrics,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ['analytics', connectionId, 'metrics', selectedWindow.value],
    queryFn: () => fetchAllQueueMetrics(connectionId, selectedWindow.minutes),
    placeholderData: (previousData) => previousData,
    enabled: !!connectionId,
  })

  const {
    data: schedulesData,
    error: schedulesError,
    isFetching: isFetchingSchedules,
    refetch: refetchSchedules,
  } = useQuery({
    queryKey: ['analytics', connectionId, 'scheduled-jobs'],
    queryFn: () => fetchAllScheduledJobs(connectionId),
    placeholderData: (previousData) => previousData,
    enabled: !!connectionId,
  })

  const {
    data: redisHealthData,
    error: redisHealthError,
    isFetching: isFetchingRedisHealth,
    isLoading: isLoadingRedisHealth,
    refetch: refetchRedisHealth,
  } = useQuery({
    queryKey: ['analytics', connectionId, 'redis-health', selectedWindow.value],
    queryFn: () => fetchRedisHealthHistory(connectionId, selectedWindow.minutes),
    placeholderData: (previousData) => previousData,
    enabled: !!connectionId,
  })

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      void refetchMetrics()
      void refetchSchedules()
      void refetchRedisHealth()
    }, ANALYTICS_REFRESH_MS)

    return () => clearInterval(interval)
  }, [refetchMetrics, refetchRedisHealth, refetchSchedules])

  const analytics = useMemo<FleetAnalytics>(
    () => buildFleetAnalytics(metricsData?.metrics ?? [], schedulesData?.scheduledJobs ?? []),
    [metricsData?.metrics, schedulesData?.scheduledJobs]
  )

  const sortedQueueRows = useMemo(() => {
    const rows = showOnlyRisky ? analytics.queueRows.filter(isRiskyQueue) : analytics.queueRows

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

  const riskyQueueCount = useMemo(
    () => analytics.queueRows.filter(isRiskyQueue).length,
    [analytics.queueRows]
  )

  const warningGroups = useMemo(
    () =>
      analytics.warningInsights.map((insight) => ({
        ...insight,
        queueNames: analytics.warningRows
          .filter((warning) => warning.message === insight.message)
          .map((warning) => warning.queueName),
      })),
    [analytics.warningInsights, analytics.warningRows]
  )

  const handleRefresh = useCallback(() => {
    void Promise.all([refetchMetrics(), refetchSchedules(), refetchRedisHealth()])
  }, [refetchMetrics, refetchRedisHealth, refetchSchedules])

  const handleWindowChange = useCallback(
    (nextWindow: AnalyticsWindowValue) => {
      void navigate({
        to: '.',
        search: { window: nextWindow },
        replace: true,
      })
    },
    [navigate]
  )

  const isLoading = isLoadingMetrics && !metricsData
  const isRefreshing = isFetchingMetrics || isFetchingSchedules || isFetchingRedisHealth
  const hasQueues = analytics.queueRows.length > 0
  const hasNoQueues = !isLoading && !hasQueues
  const sampleAgeMs = analytics.totals.metricsLatestSampleAgeMs
  const isStale = sampleAgeMs !== null && sampleAgeMs > METRICS_STALE_THRESHOLD_MS
  const sampleAgeLabel = sampleAgeMs === null ? 'No samples' : formatAgeFromMs(sampleAgeMs)
  const { healthTone, fleetHealthScore } = analytics
  const showFleetMeta = hasQueues && !metricsError

  const windowControls = useMemo(
    () => (
      <AnalyticsWindowControls
        selectedWindow={selectedWindow.value}
        isRefreshing={isRefreshing}
        onWindowChange={handleWindowChange}
        onRefresh={handleRefresh}
        refreshTitle={`Refresh now · auto every ${ANALYTICS_REFRESH_MS / 1000}s`}
      />
    ),
    [handleRefresh, handleWindowChange, isRefreshing, selectedWindow.value]
  )

  const freshnessBadge = useMemo(
    () => (
      <Badge
        variant={isStale ? 'warning' : 'neutral'}
        className="font-mono"
        title="Age of the newest BullMQ metrics point across all queues"
      >
        {/* The narrow layout keeps only the age so the badge fits beside the range control. */}
        {sampleAgeMs === null ? null : <span className="hidden sm:inline">Updated</span>}
        {sampleAgeLabel}
      </Badge>
    ),
    [isStale, sampleAgeLabel, sampleAgeMs]
  )

  const topBarConfig = useMemo(
    () => ({
      left: (
        <PageTitle
          title="Analytics"
          meta={
            showFleetMeta ? (
              <>
                <Badge
                  variant={healthToneToBadgeVariant(healthTone)}
                  title={`Fleet health ${fleetHealthScore}/100`}
                >
                  {HEALTH_TONE_LABEL[healthTone]}
                </Badge>
                <span className="hidden sm:inline-flex">{freshnessBadge}</span>
              </>
            ) : undefined
          }
        />
      ),
      actions: windowControls,
    }),
    [fleetHealthScore, freshnessBadge, healthTone, showFleetMeta, windowControls]
  )

  useAppTopBar(topBarConfig)

  // The top bar hides its actions below `md`, so the range control moves into the page there.
  const mobileControls = (
    <div className="flex flex-wrap items-center justify-between gap-2 md:hidden">
      {windowControls}
      {showFleetMeta ? <span className="sm:hidden">{freshnessBadge}</span> : null}
    </div>
  )

  const redisHealthPanel = (
    <RedisHealthObservability
      data={redisHealthData}
      error={redisHealthError}
      isLoading={isLoadingRedisHealth}
    />
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        {mobileControls}
        <AnalyticsLoadingState />
      </div>
    )
  }

  if (metricsError) {
    return (
      <div className="space-y-4">
        {mobileControls}
        <EmptyState
          tone="danger"
          icon={AlertCircle}
          title="Unable to load queue analytics"
          description={metricsError.message}
          actions={
            <Button size="sm" onClick={handleRefresh}>
              Retry
            </Button>
          }
        />
        {redisHealthPanel}
      </div>
    )
  }

  if (hasNoQueues) {
    return (
      <div className="space-y-4">
        {mobileControls}
        <EmptyState
          icon={Layers}
          title="No queues detected"
          description="Connect at least one BullMQ queue to unlock queue-level analytics. Redis resource health remains available below."
        />
        {redisHealthPanel}
      </div>
    )
  }

  const { totals, workers, schedules } = analytics
  const failureRateIsAlarm = totals.failureRateInWindow >= 0.08
  const schedulesUnavailable = Boolean(schedulesError) && !schedulesData
  const scheduleValue = (value: number) => (schedulesUnavailable ? '—' : formatNumber(value))
  const hasBacklog = analytics.backlogChartData.some((row) => row.waiting > 0 || row.active > 0)
  const hasFailures = analytics.failureChartData.some((row) => row.failedInWindow > 0)
  const timeAxisTick = (value: number | string) =>
    formatMetricAxisTime(Number(value), selectedWindow.minutes)
  const timeTooltipLabel = (value: number | string) => formatMetricTooltipLabel(Number(value))
  const queueNameTooltipLabel = (_: unknown, payload: Array<{ payload?: unknown }>) =>
    (payload?.[0]?.payload as { queueName?: string } | undefined)?.queueName ?? ''

  return (
    <div className="space-y-4">
      {mobileControls}

      <MetricStrip className={STRIP_SIX_CLASS}>
        <Metric
          label="Fleet health"
          value={fleetHealthScore}
          hint={`${HEALTH_TONE_LABEL[healthTone]} · of 100`}
          tone={HEALTH_TONE_METRIC[healthTone]}
          emphasis={healthTone !== 'healthy'}
          title="Average of per-queue health scores (0–100), weighted by finished jobs and backlog"
        />
        <Metric
          label="Throughput"
          value={formatRatePerMinute(totals.avgFinishedPerMinute)}
          hint={`peak ${formatNumber(totals.peakFinishedPerMinute)}/min`}
          title="Average finished jobs per minute in the selected window"
        />
        <Metric
          label="Failure rate"
          value={formatPercentage(totals.failureRateInWindow)}
          hint={`${formatPercentage(totals.successRateInWindow)} success`}
          tone={failureRateIsAlarm ? 'danger' : 'neutral'}
          emphasis={failureRateIsAlarm}
          title="Failed share of finished jobs in the selected window"
        />
        <Metric
          label="Backlog"
          value={formatNumber(totals.waitingToProcess)}
          hint={`${formatNumber(totals.active)} active · ${formatNumber(totals.delayed)} delayed`}
          tone={totals.active > 0 ? 'active' : 'neutral'}
          pulse={totals.active > 0}
          title="Jobs waiting to process across all queues"
        />
        <Metric
          label="Failed jobs"
          value={formatNumber(totals.failed)}
          hint={`${formatNumber(totals.failedInWindow)} in window`}
          tone={totals.failed > 0 ? 'danger' : 'neutral'}
          emphasis={totals.failed > 0}
          title="Jobs currently in the failed set"
        />
        <Metric
          label="Workers"
          value={formatNumber(totals.workers)}
          hint={`${formatNumber(workers.active)} active · ${formatNumber(workers.stale)} stale`}
          title="Connected worker clients"
        />
      </MetricStrip>

      <section aria-label="Throughput" className="space-y-4 pt-2">
        <SectionHeader
          className="mb-3"
          title="Throughput"
          description="Jobs finished per minute, summed across every queue on this connection."
          actions={
            <SectionMeta>
              {formatNumber(analytics.throughputSeries.length)} points · 1m buckets · times in{' '}
              {getTimezoneAbbreviation()}
            </SectionMeta>
          }
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartPanel
            title="Finished jobs"
            meta="jobs/min"
            hint="Completed stacked on failed, so the top edge is every job that finished in that minute. Aggregated from BullMQ native metrics."
          >
            {!analytics.throughputSeries.length ? (
              <ChartEmptyState
                title="No metric points in this window"
                description="BullMQ records a point for each minute a queue finishes jobs."
              />
            ) : (
              <ChartContainer config={throughputChartConfig} className={CHART_HEIGHT_CLASS}>
                <AreaChart
                  data={analytics.throughputSeries}
                  margin={CHART_MARGIN}
                  // Failed sits on the baseline so its height reads straight off the axis;
                  // the legend and tooltip keep the declared completed → failed order.
                  reverseStackOrder
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={6}
                    minTickGap={40}
                    tickFormatter={timeAxisTick}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    allowDecimals={false}
                    tickFormatter={(value) => formatCompactCount(Number(value))}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent labelFormatter={timeTooltipLabel} />}
                  />
                  <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
                  <Area
                    dataKey="completed"
                    stackId="finished"
                    type="monotone"
                    stroke="var(--color-completed)"
                    strokeWidth={1.5}
                    fill="var(--color-completed)"
                    fillOpacity={0.14}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    dataKey="failed"
                    stackId="finished"
                    type="monotone"
                    stroke="var(--color-failed)"
                    strokeWidth={1.5}
                    fill="var(--color-failed)"
                    fillOpacity={0.3}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="total"
                    stroke="var(--color-total)"
                    strokeWidth={0}
                    legendType="none"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </ChartPanel>

          <ChartPanel
            title="Queue activity"
            meta="queues"
            hint="How many queues produced throughput, and how many produced failures, in each minute."
          >
            {!analytics.breadthSeries.length ? (
              <ChartEmptyState title="No activity samples in this window" />
            ) : (
              <ChartContainer config={breadthChartConfig} className={CHART_HEIGHT_CLASS}>
                <LineChart data={analytics.breadthSeries} margin={CHART_MARGIN}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={6}
                    minTickGap={40}
                    tickFormatter={timeAxisTick}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    allowDecimals={false}
                    tickFormatter={(value) => formatCompactCount(Number(value))}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent labelFormatter={timeTooltipLabel} />}
                  />
                  <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
                  <Line
                    dataKey="activeQueues"
                    type="stepAfter"
                    stroke="var(--color-activeQueues)"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="queuesWithFailures"
                    type="stepAfter"
                    stroke="var(--color-queuesWithFailures)"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </ChartPanel>
        </div>
      </section>

      <section aria-label="Queues" className="space-y-4 pt-2">
        <SectionHeader
          className="mb-3"
          title="Queues"
          count={formatNumber(analytics.queueRows.length)}
          description="State, backlog, and failure risk per queue. Worst health first."
          actions={
            <SectionMeta>
              {formatNumber(metricsData?.totalQueues ?? 0)} scanned ·{' '}
              {formatNumber(metricsData?.totalPages ?? 0)} metrics{' '}
              {metricsData?.totalPages === 1 ? 'page' : 'pages'}
            </SectionMeta>
          }
        />

        <MetricStrip className={STRIP_SIX_CLASS}>
          <Metric
            label="At risk"
            value={formatNumber(riskyQueueCount)}
            hint={showOnlyRisky ? 'showing only these' : 'filter the table'}
            tone={riskyQueueCount > 0 ? 'warning' : 'neutral'}
            onClick={() => setShowOnlyRisky((prev) => !prev)}
            active={showOnlyRisky}
            title="Health below 80, any backlog, failure rate of 5% or more, or a collection warning"
          />
          <Metric
            label="Paused"
            value={formatNumber(totals.pausedQueues)}
            hint={`${formatNumber(totals.runningQueues)} running`}
            tone={totals.pausedQueues > 0 ? 'warning' : 'neutral'}
            title="Queues under an administrative pause; the rest are running"
          />
          <Metric
            label="Rate-limited"
            value={formatNumber(totals.rateLimitedQueues)}
            hint="limiter TTL active"
            tone={totals.rateLimitedQueues > 0 ? 'warning' : 'neutral'}
          />
          <Metric
            label="Maxed"
            value={formatNumber(totals.maxedQueues)}
            hint="at concurrency guard"
            tone={totals.maxedQueues > 0 ? 'warning' : 'neutral'}
          />
          <Metric
            label="Stale"
            value={formatNumber(totals.staleQueues)}
            hint="sample older than 5m"
            tone={totals.staleQueues > 0 ? 'warning' : 'neutral'}
          />
          <Metric
            label="Warnings"
            value={formatNumber(totals.warningSignals)}
            hint="metrics collection"
            tone={totals.warningSignals > 0 ? 'danger' : 'neutral'}
            emphasis={totals.warningSignals > 0}
          />
        </MetricStrip>

        {warningGroups.length > 0 ? (
          <Panel>
            <PanelHeader className="min-h-10 py-1.5">
              <div className="flex items-center gap-2">
                <h3 className="text-[13px] font-semibold tracking-tight">Collection warnings</h3>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatNumber(analytics.warningRows.length)}
                </span>
              </div>
              <SectionMeta>BullMQ native metrics</SectionMeta>
            </PanelHeader>
            <ul className="divide-y text-[13px]">
              {warningGroups.slice(0, WARNING_GROUP_LIMIT).map((group) => (
                <li
                  key={group.message}
                  className="grid gap-x-4 gap-y-1.5 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <Badge variant="destructive" className="shrink-0 font-mono">
                      {formatNumber(group.count)} {group.count === 1 ? 'queue' : 'queues'}
                    </Badge>
                    <span className="min-w-0 break-words leading-5">{group.message}</span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
                    {group.queueNames.slice(0, WARNING_QUEUE_LIMIT).map((queueName, index) => (
                      <Link
                        key={`${queueName}:${index}`}
                        to="/$orgSlug/c/$connectionId/queues/$queueName"
                        params={{ orgSlug, connectionId, queueName }}
                        className="truncate rounded-sm text-muted-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        {queueName}
                      </Link>
                    ))}
                    {group.queueNames.length > WARNING_QUEUE_LIMIT ? (
                      <span className="text-faint">
                        +{formatNumber(group.queueNames.length - WARNING_QUEUE_LIMIT)} more
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {warningGroups.length > WARNING_GROUP_LIMIT ? (
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                +{formatNumber(warningGroups.length - WARNING_GROUP_LIMIT)} more warning types.
              </p>
            ) : null}
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-semibold tracking-tight">Breakdown</h3>
              {showOnlyRisky ? (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatNumber(sortedQueueRows.length)} of{' '}
                  {formatNumber(analytics.queueRows.length)}
                </span>
              ) : null}
              {showOnlyRisky ? (
                <button
                  type="button"
                  onClick={() => setShowOnlyRisky(false)}
                  className="inline-flex h-6 items-center gap-1 rounded-md border border-status-warning/30 bg-status-warning/10 pl-2 pr-1 text-[11px] font-medium text-status-warning transition-colors hover:bg-status-warning/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  At risk only
                  <X className="h-3 w-3" aria-hidden />
                  <span className="sr-only">Clear filter</span>
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span className="eyebrow">Sort</span>
              <Tabs
                value={queueSort}
                onValueChange={(value) => setQueueSort(value as QueueSortMode)}
              >
                <TabsList role="group" aria-label="Sort queues by" className="h-7">
                  {QUEUE_SORT_OPTIONS.map((option) => (
                    <TabsTrigger
                      key={option.value}
                      value={option.value}
                      aria-pressed={queueSort === option.value}
                      className="px-2 text-xs"
                    >
                      {option.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </PanelHeader>

          {sortedQueueRows.length === 0 ? (
            <EmptyState
              size="inline"
              tone="success"
              title="No queues at risk"
              description="Every queue is above a health score of 80 with no backlog, warnings, or elevated failure rate."
              actions={
                <Button size="xs" variant="outline" onClick={() => setShowOnlyRisky(false)}>
                  Show all queues
                </Button>
              }
            />
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full caption-bottom text-[13px] [&_td]:px-3 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th]:px-3 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
                <TableHeader className="border-b-0 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted [&_th]:shadow-[inset_0_-1px_0_0_var(--color-border)]">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Queue</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Signals</TableHead>
                    <TableHead className="text-right">Waiting</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                    <TableHead className="text-right">Workers</TableHead>
                    <TableHead className="text-right" title="Jobs waiting per connected worker">
                      Per worker
                    </TableHead>
                    <TableHead className="text-right">Throughput</TableHead>
                    <TableHead className="text-right">Finished</TableHead>
                    <TableHead className="text-right">Failure rate</TableHead>
                    <TableHead
                      className="text-right"
                      title="Age of the queue's newest metrics point"
                    >
                      Sample
                    </TableHead>
                    <TableHead
                      className="text-right"
                      title="Queue scheduler and queue-event clients"
                    >
                      Sched · Ev
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedQueueRows.map((row) => {
                    const unattended = row.workersCount === 0 && row.waitingToProcess > 0
                    return (
                      <TableRow
                        key={row.queueName}
                        className="cursor-pointer"
                        onClick={() => {
                          void navigate({
                            to: '/$orgSlug/c/$connectionId/queues/$queueName',
                            params: { orgSlug, connectionId, queueName: row.queueName },
                          })
                        }}
                      >
                        <TableCell className="max-w-[220px]">
                          <Link
                            to="/$orgSlug/c/$connectionId/queues/$queueName"
                            params={{ orgSlug, connectionId, queueName: row.queueName }}
                            onClick={(event) => event.stopPropagation()}
                            className="block truncate rounded-sm font-mono font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          >
                            {row.queueName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <HealthBadge score={row.healthScore} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {row.isPaused ? <Badge variant="warning">Paused</Badge> : null}
                            {row.rateLimited ? <Badge variant="warning">Rate limited</Badge> : null}
                            {row.isMaxed ? <Badge variant="neutral">Maxed</Badge> : null}
                            {row.warningCount > 0 ? (
                              <Badge variant="destructive">
                                {row.warningCount} warning{row.warningCount === 1 ? '' : 's'}
                              </Badge>
                            ) : null}
                            {!row.isPaused &&
                            !row.rateLimited &&
                            !row.isMaxed &&
                            row.warningCount === 0 ? (
                              <span className="text-faint" title="No control or warning signals">
                                —
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <NumericCell>{formatNumber(row.waitingToProcess)}</NumericCell>
                        <NumericCell>{formatNumber(row.active)}</NumericCell>
                        <NumericCell
                          className={unattended ? 'text-status-warning' : undefined}
                          title={unattended ? 'Backlog with no connected workers' : undefined}
                        >
                          {formatNumber(row.workersCount)}
                        </NumericCell>
                        <NumericCell>{formatDecimal(row.backlogPerWorker)}</NumericCell>
                        <NumericCell>
                          {formatRatePerMinute(row.avgThroughput)}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            peak {formatNumber(row.peakThroughput)}
                          </span>
                        </NumericCell>
                        <NumericCell>{formatNumber(row.finishedInWindow)}</NumericCell>
                        <NumericCell>
                          <span
                            className={row.failureRate >= 0.05 ? 'text-status-danger' : undefined}
                          >
                            {formatPercentage(row.failureRate)}
                          </span>
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {formatNumber(row.failedInWindow)} failed
                          </span>
                        </NumericCell>
                        <NumericCell
                          className="text-muted-foreground"
                          title={
                            row.latestPointAgeMs === null
                              ? 'No metrics point in this window'
                              : `Latest sample ${formatAgeFromMs(row.latestPointAgeMs)}`
                          }
                        >
                          {row.latestPointAgeMs === null
                            ? '—'
                            : formatDurationFromMs(row.latestPointAgeMs)}
                        </NumericCell>
                        <NumericCell className="text-muted-foreground">
                          {formatNumber(row.schedulersCount)} · {formatNumber(row.queueEventsCount)}
                        </NumericCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </table>
            </div>
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartPanel
            title="Backlog by queue"
            meta="jobs · top 10"
            hint="Queues with the most jobs waiting to process, with their active jobs stacked on top."
          >
            {!hasBacklog ? (
              <ChartEmptyState
                tone="success"
                title="No backlog"
                description="No queue has jobs waiting or in flight right now."
              />
            ) : (
              <ChartContainer config={backlogChartConfig} className={CHART_HEIGHT_CLASS}>
                <BarChart
                  data={analytics.backlogChartData}
                  layout="vertical"
                  margin={RANK_CHART_MARGIN}
                  barCategoryGap="28%"
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickFormatter={(value) => formatCompactCount(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="queueLabel"
                    width={148}
                    interval={0}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={{ fillOpacity: 0.6 }}
                    content={<ChartTooltipContent labelFormatter={queueNameTooltipLabel} />}
                  />
                  <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
                  <Bar
                    dataKey="waiting"
                    stackId="backlog"
                    fill="var(--color-waiting)"
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="active"
                    stackId="backlog"
                    fill="var(--color-active)"
                    radius={[0, 2, 2, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </ChartPanel>

          <ChartPanel
            title="Failure rate by queue"
            meta="% of finished · top 10"
            hint="Queues with the highest share of failed jobs among those finished in the selected window."
          >
            {!analytics.failureChartData.length ? (
              <ChartEmptyState
                title="No finished jobs in this window"
                description="Failure rate needs at least one completed or failed job."
              />
            ) : !hasFailures ? (
              <ChartEmptyState
                tone="success"
                title="No failures in this window"
                description={`${formatNumber(totals.finishedInWindow)} jobs finished without a failure.`}
              />
            ) : (
              <ChartContainer config={failureChartConfig} className={CHART_HEIGHT_CLASS}>
                <BarChart
                  data={analytics.failureChartData}
                  layout="vertical"
                  margin={RANK_CHART_MARGIN}
                  barCategoryGap="28%"
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => formatPercentTick(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="queueLabel"
                    width={148}
                    interval={0}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={{ fillOpacity: 0.6 }}
                    content={
                      <ChartTooltipContent
                        labelFormatter={queueNameTooltipLabel}
                        formatter={(value, _name, item) =>
                          `${Number(value).toFixed(1)}% · ${formatNumber(
                            Number(item.payload?.failedInWindow ?? 0)
                          )} failed`
                        }
                      />
                    }
                  />
                  <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
                  <Bar
                    dataKey="failureRate"
                    fill="var(--color-failureRate)"
                    radius={[0, 2, 2, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </ChartPanel>
        </div>
      </section>

      <div className="pt-2">{redisHealthPanel}</div>

      <div className="grid gap-x-4 gap-y-6 pt-2 xl:grid-cols-2">
        <section aria-label="Workers" className="min-w-0 space-y-4">
          <SectionHeader
            className="mb-3"
            title="Workers"
            count={formatNumber(workers.total)}
            description="Connected worker clients, grouped by how long they have been idle."
          />
          <MetricStrip className={STRIP_HALF_WIDTH_CLASS}>
            {analytics.workerStateData.map((state) => (
              <Metric
                key={state.key}
                label={WORKER_STATE_LABEL[state.key]}
                value={formatNumber(state.value)}
                hint={`${WORKER_STATE_RANGE[state.key]} · ${formatShare(state.value, workers.total)}`}
                tone={
                  state.value === 0
                    ? 'neutral'
                    : state.key === 'active'
                      ? 'active'
                      : state.key === 'stale'
                        ? 'warning'
                        : 'neutral'
                }
              />
            ))}
            <Metric
              label="Average idle"
              value={formatDurationFromMs(workers.averageIdleMs)}
              hint="across clients"
            />
            <Metric
              label="Oldest client"
              value={formatDurationFromMs(workers.oldestAgeMs)}
              hint="connection age"
            />
            <Metric
              label="Queue events"
              value={formatNumber(totals.queueEvents)}
              hint="listener clients"
            />
          </MetricStrip>
          <Panel>
            <PanelHeader className="min-h-10 py-1.5">
              <h3 className="text-[13px] font-semibold tracking-tight">Longest idle</h3>
              <SectionMeta>top {analytics.topIdleWorkers.length || 8}</SectionMeta>
            </PanelHeader>
            {analytics.topIdleWorkers.length === 0 ? (
              <EmptyState
                size="inline"
                icon={Server}
                title="No worker clients discovered"
                description="Workers appear here once they connect to a queue on this connection."
              />
            ) : (
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Worker</TableHead>
                    <TableHead>Queue</TableHead>
                    <TableHead className="w-24 text-right">Idle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.topIdleWorkers.map((worker) => (
                    <TableRow key={`${worker.queueName}:${worker.id}:${worker.address}`}>
                      <TableCell className="truncate font-mono" title={worker.address}>
                        {worker.name || worker.id || 'worker-client'}
                      </TableCell>
                      <TableCell className="truncate font-mono">
                        <Link
                          to="/$orgSlug/c/$connectionId/queues/$queueName"
                          params={{ orgSlug, connectionId, queueName: worker.queueName }}
                          className="rounded-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          {worker.queueName}
                        </Link>
                      </TableCell>
                      <NumericCell>{formatDurationFromMs(worker.idleMs)}</NumericCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </section>

        <section aria-label="Schedules" className="min-w-0 space-y-4">
          <SectionHeader
            className="mb-3"
            title="Schedules"
            count={schedulesUnavailable ? undefined : formatNumber(schedules.total)}
            description="Scheduled jobs and the failures recently linked to them."
          />
          <MetricStrip className={STRIP_HALF_WIDTH_CLASS}>
            <Metric
              label="Next 24h"
              value={scheduleValue(schedules.next24h)}
              hint="upcoming runs"
            />
            <Metric
              label="Failing"
              value={scheduleValue(schedules.failingSchedules)}
              hint="schedules with failures"
              tone={schedules.failingSchedules > 0 ? 'danger' : 'neutral'}
              emphasis={schedules.failingSchedules > 0}
            />
            <Metric
              label="Recent failures"
              value={scheduleValue(schedules.recentFailures)}
              hint="schedule-linked jobs"
              tone={schedules.recentFailures > 0 ? 'danger' : 'neutral'}
            />
            <Metric
              label="Scheduled jobs"
              value={scheduleValue(schedules.total)}
              hint="all queues"
            />
            <Metric
              label="Queues"
              value={scheduleValue(schedules.queuesWithSchedules)}
              hint="with schedules"
            />
            <Metric
              label="Schedulers"
              value={formatNumber(totals.schedulers)}
              hint="detected by BullMQ"
            />
          </MetricStrip>
          <ChartPanel
            title="Schedules by queue"
            meta="count · top 10"
            hint="Scheduled jobs per queue next to the failed jobs recently produced by those schedules."
          >
            {schedulesUnavailable ? (
              <ChartEmptyState
                tone="warning"
                icon={AlertCircle}
                title="Scheduled jobs unavailable"
                description={schedulesError?.message}
              />
            ) : !analytics.scheduleChartData.length ? (
              <ChartEmptyState
                icon={CalendarClock}
                title="No scheduled jobs"
                description="Repeatable and cron jobs on this connection will be ranked here."
              />
            ) : (
              <ChartContainer config={schedulesChartConfig} className={CHART_HEIGHT_CLASS}>
                <BarChart
                  data={analytics.scheduleChartData}
                  layout="vertical"
                  margin={RANK_CHART_MARGIN}
                  barCategoryGap="22%"
                  barGap={1}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickFormatter={(value) => formatCompactCount(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="queueLabel"
                    width={148}
                    interval={0}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={{ fillOpacity: 0.6 }}
                    content={<ChartTooltipContent labelFormatter={queueNameTooltipLabel} />}
                  />
                  <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
                  <Bar
                    dataKey="schedules"
                    fill="var(--color-schedules)"
                    radius={[0, 2, 2, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="recentFailures"
                    fill="var(--color-recentFailures)"
                    radius={[0, 2, 2, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </ChartPanel>
        </section>
      </div>
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

async function fetchRedisHealthHistory(connectionId: string, windowMinutes: number) {
  const params = new URLSearchParams({
    windowMinutes: String(windowMinutes),
    targetPoints: '480',
  })
  return fetchApi<RedisHealthHistoryResponse>(
    `/api/c/${encodeURIComponent(connectionId)}/metrics/redis-health?${params.toString()}`
  )
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
      {
        key: 'active',
        label: `Active (<= ${WORKER_IDLE_ACTIVE_SECONDS}s idle)`,
        value: workerActive,
      },
      {
        key: 'warm',
        label: `Warm (${WORKER_IDLE_ACTIVE_SECONDS}s-${WORKER_IDLE_STALE_SECONDS}s idle)`,
        value: workerWarm,
      },
      { key: 'stale', label: `Stale (> ${WORKER_IDLE_STALE_SECONDS}s idle)`, value: workerStale },
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

const HEALTH_TONE_LABEL: Record<HealthTone, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  critical: 'Critical',
}

const HEALTH_TONE_METRIC: Record<HealthTone, MetricTone> = {
  healthy: 'success',
  watch: 'warning',
  critical: 'danger',
}

type WorkerStateKey = FleetAnalytics['workerStateData'][number]['key']

const WORKER_STATE_LABEL: Record<WorkerStateKey, string> = {
  active: 'Active',
  warm: 'Warm',
  stale: 'Stale',
}

const WORKER_STATE_RANGE: Record<WorkerStateKey, string> = {
  active: `≤ ${WORKER_IDLE_ACTIVE_SECONDS}s idle`,
  warm: `${WORKER_IDLE_ACTIVE_SECONDS}–${WORKER_IDLE_STALE_SECONDS}s idle`,
  stale: `> ${WORKER_IDLE_STALE_SECONDS}s idle`,
}

/** The "at risk" filter: anything an operator should look at before the healthy queues. */
function isRiskyQueue(row: QueueAnalyticsRow) {
  return (
    row.healthScore < 80 ||
    row.warningCount > 0 ||
    row.failureRate >= 0.05 ||
    row.waitingToProcess > 0
  )
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
    <Badge variant={tone} className="min-w-8 justify-center font-mono">
      {score}
    </Badge>
  )
}

/** Small mono context line used on the right of section and panel headers. */
function SectionMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{children}</span>
  )
}

function NumericCell({ className, ...props }: React.ComponentProps<typeof TableCell>) {
  return (
    <TableCell
      className={cn('whitespace-nowrap text-right font-mono tabular-nums', className)}
      {...props}
    />
  )
}

function AnalyticsLoadingState() {
  return (
    <div className="space-y-4" aria-busy="true">
      <MetricStrip className={STRIP_SIX_CLASS}>
        {['Fleet health', 'Throughput', 'Failure rate', 'Backlog', 'Failed jobs', 'Workers'].map(
          (label) => (
            <Metric key={label} label={label} value="" hint={<>&nbsp;</>} loading />
          )
        )}
      </MetricStrip>
      <div className="space-y-3 pt-2">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((id) => (
            <Panel key={id}>
              <div className="flex min-h-10 items-center border-b px-4">
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="px-3 pb-2 pt-3">
                <Skeleton className={CHART_HEIGHT_CLASS} />
              </div>
            </Panel>
          ))}
        </div>
      </div>
      <Panel>
        <div className="flex min-h-11 items-center border-b px-4">
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="divide-y">
          {[0, 1, 2, 3, 4, 5].map((id) => (
            <div key={id} className="flex h-9 items-center gap-4 px-4">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3.5 w-10" />
              <Skeleton className="ml-auto h-3.5 w-64 max-w-[40%]" />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function formatPercentTick(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`
}

function formatShare(value: number, total: number) {
  return `${((value / Math.max(total, 1)) * 100).toFixed(1)}%`
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

  if (windowMinutes <= 1440) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

// Points are one-minute buckets, so the label stops at the minute.
function formatMetricTooltipLabel(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
