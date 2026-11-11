import { AlertCircle, Database } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Metric, MetricStrip } from '@/components/ui/metric'
import { Panel, SectionHeader } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import { CHART_HEIGHT_CLASS } from './chart-panel'
import { formatRedisHealthThreshold, type RedisHealthMetric } from './redis-health-metrics'
import type { RedisHealthHistoryResponse } from './redis-health-types'

// The charts pull in recharts, which is heavy. Load that chunk only once there is history to
// draw, so the metric strip above renders without waiting for it.
const RedisHealthCharts = lazy(() =>
  import('./redis-health-charts').then((module) => ({ default: module.RedisHealthCharts }))
)

const COUNT_FORMATTER = new Intl.NumberFormat()
// Two rows of three between `lg` and `xl`, where six cells are too narrow for "31.8 MiB".
const STRIP_CLASS = 'lg:grid-flow-row lg:grid-cols-3 xl:grid-flow-col xl:grid-cols-none'
const SECTION_TITLE = 'Redis resource health'
const SECTION_DESCRIPTION =
  'Server memory, CPU, and client capacity, sampled independently of alert rules.'

interface RedisHealthObservabilityProps {
  data?: RedisHealthHistoryResponse
  error?: Error | null
  isLoading?: boolean
}

export function RedisHealthObservability({
  data,
  error = null,
  isLoading = false,
}: RedisHealthObservabilityProps) {
  if (isLoading && !data) return <RedisHealthLoadingState />

  if (error && !data) {
    return (
      <section aria-label={SECTION_TITLE} className="space-y-4">
        <SectionHeader className="mb-3" title={SECTION_TITLE} description={SECTION_DESCRIPTION} />
        <Panel>
          <EmptyState
            size="inline"
            tone="danger"
            icon={AlertCircle}
            title="Redis telemetry unavailable"
            description={error.message}
          />
        </Panel>
      </section>
    )
  }

  if (!data) return null

  const latest = data.latest
  const hasHealthFields = hasUsableHealthFields(latest)
  const sampleAgeMs = latest ? Math.max(0, Date.now() - Date.parse(latest.capturedAt)) : null
  const isStale = sampleAgeMs !== null && sampleAgeMs > data.staleAfterMs
  const gaps = Math.max(0, data.range.totalBuckets - data.range.sampledBuckets)
  const isHealthy = Boolean(latest) && hasHealthFields && !isStale

  return (
    <section aria-label={SECTION_TITLE} className="space-y-4">
      <SectionHeader
        className="mb-3"
        title={SECTION_TITLE}
        description={SECTION_DESCRIPTION}
        actions={
          <>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              <span className="whitespace-nowrap">
                {formatCoverage(data.range.coveragePercent, gaps)}
              </span>
              <span className="whitespace-nowrap">
                {data.range.expectedSampleIntervalMinutes}m sampling · {data.range.bucketMinutes}m
                peak buckets · {data.retentionDays}d retention
              </span>
              <span className="whitespace-nowrap">Latest {formatAge(sampleAgeMs)}</span>
            </span>
            {!data.collectionEnabled ? <Badge variant="neutral">Collection off</Badge> : null}
            <Badge variant={isHealthy ? 'success' : 'warning'}>
              {!latest
                ? 'Awaiting first sample'
                : !hasHealthFields
                  ? 'No health fields'
                  : isStale
                    ? 'Data stale'
                    : 'Live'}
            </Badge>
          </>
        }
      />

      {!latest ? (
        <Panel>
          <EmptyState
            size="inline"
            icon={Database}
            title="No Redis health samples in this window"
            description="The first point appears after the next collector poll."
          />
        </Panel>
      ) : (
        <MetricStrip className={STRIP_CLASS}>
          <ResourceMetric
            label="Memory used"
            value={formatPercent(latest.memoryUsagePercent)}
            detail={`${formatBytes(latest.usedMemoryBytes)} / ${formatBytes(latest.memoryCapacityBytes)}`}
            stressed={
              isThresholdCrossed(data, 'memory_usage_percent', latest.memoryUsagePercent) ||
              isThresholdCrossed(data, 'used_memory_megabytes', bytesToMiB(latest.usedMemoryBytes))
            }
          />
          <ResourceMetric
            label="Resident set"
            value={formatBytes(latest.residentMemoryBytes)}
            detail={`${formatRatio(latest.memoryFragmentationRatio)} fragmentation`}
            stressed={isThresholdCrossed(
              data,
              'resident_memory_megabytes',
              bytesToMiB(latest.residentMemoryBytes)
            )}
          />
          <ResourceMetric
            label="CPU"
            value={formatPercent(latest.cpuUsagePercent)}
            detail="over poll interval"
            title="Process CPU usage over the poll interval"
            stressed={isThresholdCrossed(data, 'cpu_usage_percent', latest.cpuUsagePercent)}
          />
          <ResourceMetric
            label="Client capacity"
            value={formatPercent(latest.connectedClientsPercent)}
            detail={`${formatCount(latest.connectedClients)} / ${formatCount(latest.maxClients)} connected`}
            stressed={isThresholdCrossed(
              data,
              'connected_clients_percent',
              latest.connectedClientsPercent
            )}
          />
          <ResourceMetric
            label="Blocked clients"
            value={formatCount(latest.blockedClients)}
            detail={`${formatRate(latest.rejectedConnectionsPerMinute)} rejected`}
            stressed={isThresholdCrossed(data, 'blocked_clients', latest.blockedClients)}
          />
          <ResourceMetric
            label="Evictions"
            value={formatRate(latest.evictedKeysPerMinute)}
            detail={`${formatBytes(latest.memoryFragmentationBytes)} frag. overhead`}
            title="Evicted keys per minute, and the bytes lost to allocator fragmentation"
            stressed={isThresholdCrossed(
              data,
              'evicted_keys_per_minute',
              latest.evictedKeysPerMinute
            )}
          />
        </MetricStrip>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="eyebrow">Active thresholds</span>
        {data.thresholds.length === 0 ? (
          <span className="text-xs text-muted-foreground">None configured</span>
        ) : (
          data.thresholds.map((threshold) => (
            <Badge key={threshold.ruleId} variant="outline" className="font-mono">
              {threshold.name} ≥ {formatRedisHealthThreshold(threshold.metric, threshold.threshold)}
            </Badge>
          ))
        )}
      </div>

      {data.range.sampledBuckets > 0 ? (
        <Suspense fallback={<RedisHealthChartsFallback />}>
          <RedisHealthCharts
            series={data.series}
            thresholds={data.thresholds}
            bucketMinutes={data.range.bucketMinutes}
          />
        </Suspense>
      ) : null}
    </section>
  )
}

/** A resource cell turns into an alarm only when it crosses an active alert threshold. */
function ResourceMetric({
  label,
  value,
  detail,
  title,
  stressed = false,
}: {
  label: string
  value: string
  detail: string
  title?: string
  stressed?: boolean
}) {
  return (
    <Metric
      label={label}
      value={value}
      hint={detail}
      title={stressed ? `${label} is at or above an active alert threshold` : title}
      tone={stressed ? 'danger' : 'neutral'}
      emphasis={stressed}
    />
  )
}

function RedisHealthChartsFallback() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-busy="true">
      {Array.from({ length: 4 }, (_, index) => (
        <Panel key={index}>
          <div className="flex min-h-10 items-center border-b px-4">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="px-3 pb-2 pt-3">
            <Skeleton className={CHART_HEIGHT_CLASS} />
          </div>
        </Panel>
      ))}
    </div>
  )
}

function RedisHealthLoadingState() {
  return (
    <section aria-label={SECTION_TITLE} aria-busy="true" className="space-y-4">
      <SectionHeader className="mb-3" title={SECTION_TITLE} description={SECTION_DESCRIPTION} />
      <MetricStrip className={STRIP_CLASS}>
        {[
          'Memory used',
          'Resident set',
          'CPU',
          'Client capacity',
          'Blocked clients',
          'Evictions',
        ].map((label) => (
          <Metric key={label} label={label} value="" hint={<>&nbsp;</>} loading />
        ))}
      </MetricStrip>
    </section>
  )
}

function isThresholdCrossed(
  data: RedisHealthHistoryResponse,
  metric: RedisHealthMetric,
  value: number | null
) {
  return (
    value !== null &&
    data.thresholds.some((threshold) => threshold.metric === metric && value >= threshold.threshold)
  )
}

function hasUsableHealthFields(latest: RedisHealthHistoryResponse['latest']) {
  if (!latest) return false
  return [
    latest.memoryUsagePercent,
    latest.usedMemoryBytes,
    latest.residentMemoryBytes,
    latest.memoryCapacityBytes,
    latest.cpuUsagePercent,
    latest.memoryFragmentationRatio,
    latest.memoryFragmentationBytes,
    latest.connectedClientsPercent,
    latest.connectedClients,
    latest.maxClients,
    latest.blockedClients,
    latest.evictedKeysPerMinute,
    latest.rejectedConnectionsPerMinute,
  ].some((value) => value !== null)
}

function bytesToMiB(value: number | null) {
  return value === null ? null : value / (1024 * 1024)
}

function formatBytes(value: number | null) {
  if (value === null) return '—'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let scaled = value
  let unit = 0
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024
    unit += 1
  }
  return `${scaled.toFixed(scaled >= 100 ? 0 : 1)} ${units[unit]}`
}

function formatPercent(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)}%`
}

function formatRatio(value: number | null) {
  return value === null ? '—' : `${value.toFixed(2)}×`
}

function formatCount(value: number | null) {
  return value === null ? '—' : COUNT_FORMATTER.format(value)
}

function formatRate(value: number | null) {
  return value === null ? '—' : `${value.toFixed(value >= 10 ? 0 : 1)}/min`
}

function formatAge(value: number | null) {
  if (value === null) return 'never'
  if (value < 60_000) return `${Math.max(0, Math.floor(value / 1000))}s ago`
  if (value < 3_600_000) return `${Math.floor(value / 60_000)}m ago`
  return `${Math.floor(value / 3_600_000)}h ago`
}

function formatCoverage(coverage: number, gaps: number) {
  return `${coverage.toFixed(1)}% coverage · ${gaps} ${gaps === 1 ? 'gap' : 'gaps'}`
}
