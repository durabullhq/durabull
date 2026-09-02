import { AlertCircle, Cpu, Database, Gauge, MemoryStick, Network, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { RedisHealthCharts } from './redis-health-charts'
import { formatRedisHealthThreshold, type RedisHealthMetric } from './redis-health-metrics'
import type { RedisHealthHistoryResponse } from './redis-health-types'

const COUNT_FORMATTER = new Intl.NumberFormat()

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
      <Card className="border-status-danger/35 bg-status-danger/[0.06]">
        <CardContent className="flex items-start gap-3 py-5">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-status-danger" />
          <div>
            <p className="font-medium">Redis telemetry unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const latest = data.latest
  const hasHealthFields = hasUsableHealthFields(latest)
  const sampleAgeMs = latest ? Math.max(0, Date.now() - Date.parse(latest.capturedAt)) : null
  const isStale = sampleAgeMs !== null && sampleAgeMs > data.staleAfterMs
  const gaps = Math.max(0, data.range.totalBuckets - data.range.sampledBuckets)

  return (
    <section aria-labelledby="redis-resource-health-heading" className="space-y-4">
      <Card className="overflow-hidden border-border/70">
        <CardHeader className="border-b border-border/60 bg-muted/20 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle id="redis-resource-health-heading" className="text-xl">
                  Redis Resource Health
                </CardTitle>
                <Badge variant={!latest || !hasHealthFields || isStale ? 'warning' : 'success'}>
                  {!latest
                    ? 'Awaiting first sample'
                    : !hasHealthFields
                      ? 'No health fields'
                      : isStale
                        ? 'Data stale'
                        : 'Live'}
                </Badge>
                {!data.collectionEnabled ? (
                  <Badge variant="destructive">Collection off</Badge>
                ) : null}
              </div>
              <CardDescription className="mt-2 max-w-3xl">
                Server-level memory, CPU, client capacity, and pressure signals sampled
                independently of alert rules.
              </CardDescription>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>{formatCoverage(data.range.coveragePercent, gaps)}</p>
              <p className="mt-1">
                {data.range.expectedSampleIntervalMinutes}m sampling · {data.range.bucketMinutes}m
                peak buckets · {data.retentionDays}d retention
              </p>
              <p className="mt-1">Latest {formatAge(sampleAgeMs)}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-5">
          {!latest ? (
            <div className="rounded-lg border border-dashed bg-muted/10 px-6 py-8 text-center text-sm text-muted-foreground">
              No Redis health samples are available for this window. The first point appears after
              the next collector poll.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <ResourceCard
                icon={MemoryStick}
                label="Memory used"
                value={formatPercent(latest.memoryUsagePercent)}
                detail={`${formatBytes(latest.usedMemoryBytes)} / ${formatBytes(latest.memoryCapacityBytes)}`}
                stressed={
                  isThresholdCrossed(data, 'memory_usage_percent', latest.memoryUsagePercent) ||
                  isThresholdCrossed(
                    data,
                    'used_memory_megabytes',
                    bytesToMiB(latest.usedMemoryBytes)
                  )
                }
              />
              <ResourceCard
                icon={Database}
                label="Resident set"
                value={formatBytes(latest.residentMemoryBytes)}
                detail={`${formatRatio(latest.memoryFragmentationRatio)} fragmentation`}
                stressed={isThresholdCrossed(
                  data,
                  'resident_memory_megabytes',
                  bytesToMiB(latest.residentMemoryBytes)
                )}
              />
              <ResourceCard
                icon={Cpu}
                label="CPU"
                value={formatPercent(latest.cpuUsagePercent)}
                detail="Process usage over poll interval"
                stressed={isThresholdCrossed(data, 'cpu_usage_percent', latest.cpuUsagePercent)}
              />
              <ResourceCard
                icon={Users}
                label="Client capacity"
                value={formatPercent(latest.connectedClientsPercent)}
                detail={`${formatCount(latest.connectedClients)} / ${formatCount(latest.maxClients)} connected`}
                stressed={isThresholdCrossed(
                  data,
                  'connected_clients_percent',
                  latest.connectedClientsPercent
                )}
              />
              <ResourceCard
                icon={Network}
                label="Blocked clients"
                value={formatCount(latest.blockedClients)}
                detail={`${formatRate(latest.rejectedConnectionsPerMinute)} rejected`}
                stressed={isThresholdCrossed(data, 'blocked_clients', latest.blockedClients)}
              />
              <ResourceCard
                icon={Gauge}
                label="Evictions"
                value={formatRate(latest.evictedKeysPerMinute)}
                detail={`${formatBytes(latest.memoryFragmentationBytes)} fragmentation overhead`}
                stressed={isThresholdCrossed(
                  data,
                  'evicted_keys_per_minute',
                  latest.evictedKeysPerMinute
                )}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Active thresholds
            </span>
            {data.thresholds.length === 0 ? (
              <span className="text-xs text-muted-foreground">None configured</span>
            ) : (
              data.thresholds.map((threshold) => (
                <Badge key={threshold.ruleId} variant="outline" className="font-mono text-[11px]">
                  {threshold.name} ≥{' '}
                  {formatRedisHealthThreshold(threshold.metric, threshold.threshold)}
                </Badge>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {data.range.sampledBuckets > 0 ? (
        <RedisHealthCharts series={data.series} thresholds={data.thresholds} />
      ) : null}
    </section>
  )
}

function ResourceCard({
  icon: Icon,
  label,
  value,
  detail,
  stressed = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  detail: string
  stressed?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border/70 bg-card px-3.5 py-3',
        stressed && 'border-status-danger/45 bg-status-danger/[0.07]'
      )}
    >
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="mt-2 font-mono text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  )
}

function RedisHealthLoadingState() {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-[420px] max-w-full" />
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </CardContent>
    </Card>
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
