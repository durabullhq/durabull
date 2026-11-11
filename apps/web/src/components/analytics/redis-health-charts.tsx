import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { ChartPanel } from './chart-panel'
import { CHART_HEIGHT_CLASS } from './chart-series'
import { formatRedisHealthChartTick } from './redis-health-chart-format'
import { type RedisHealthThreshold, thresholdsForChart } from './redis-health-metrics'
import type { RedisHealthHistoryPoint } from './redis-health-types'

// Colour follows the entity across the four charts: memory is always chart-2,
// CPU and allocator signals chart-4, clients chart-1, and loss (evictions,
// rejected connections) the danger hue. Limits are neutral and dashed.
const utilizationChartConfig = {
  memoryUsagePercent: { label: 'Memory', color: 'var(--color-chart-2)' },
  cpuUsagePercent: { label: 'CPU', color: 'var(--color-chart-4)' },
  connectedClientsPercent: { label: 'Client capacity', color: 'var(--color-chart-1)' },
} satisfies ChartConfig

const memoryChartConfig = {
  usedMemoryMiB: { label: 'Allocated', color: 'var(--color-chart-2)' },
  residentMemoryMiB: { label: 'Resident', color: 'var(--color-chart-3)' },
  memoryCapacityMiB: { label: 'Configured capacity', color: 'var(--color-status-neutral)' },
} satisfies ChartConfig

const clientPressureChartConfig = {
  blockedClients: { label: 'Blocked clients', color: 'var(--color-chart-3)' },
  rejectedConnectionsPerMinute: { label: 'Rejected/min', color: 'var(--color-chart-5)' },
} satisfies ChartConfig

const memoryPressureChartConfig = {
  evictedKeysPerMinute: { label: 'Evictions/min', color: 'var(--color-chart-5)' },
  memoryFragmentationRatio: { label: 'Fragmentation ratio', color: 'var(--color-chart-4)' },
} satisfies ChartConfig

const CHART_MARGIN = { left: 0, right: 8, top: 8, bottom: 0 }
const DAY_MS = 24 * 60 * 60 * 1000

type ValueFormatter = (value: number, dataKey: string) => string

const formatPercentValue: ValueFormatter = (value) => `${value.toFixed(1)}%`
const formatMiBValue: ValueFormatter = (value) => `${value.toFixed(1)} MiB`
const formatClientPressureValue: ValueFormatter = (value, dataKey) =>
  dataKey === 'rejectedConnectionsPerMinute' ? `${formatDecimal(value)}/min` : formatDecimal(value)
const formatMemoryPressureValue: ValueFormatter = (value, dataKey) =>
  dataKey === 'memoryFragmentationRatio' ? `${value.toFixed(2)}×` : `${formatDecimal(value)}/min`

interface RedisHealthChartPoint extends RedisHealthHistoryPoint {
  timestamp: number
  usedMemoryMiB: number | null
  residentMemoryMiB: number | null
  memoryCapacityMiB: number | null
}

interface MetricLineSpec {
  dataKey: string
  color: string
  axis?: 'left' | 'right'
  type?: 'monotone' | 'stepAfter'
  dashed?: boolean
}

export function RedisHealthCharts({
  series,
  thresholds,
  bucketMinutes,
}: {
  series: RedisHealthHistoryPoint[]
  thresholds: RedisHealthThreshold[]
  bucketMinutes: number
}) {
  const chartData: RedisHealthChartPoint[] = series.map((point) => ({
    ...point,
    timestamp: Date.parse(point.capturedAt),
    usedMemoryMiB: bytesToMiB(point.usedMemoryBytes),
    residentMemoryMiB: bytesToMiB(point.residentMemoryBytes),
    memoryCapacityMiB: bytesToMiB(point.memoryCapacityBytes),
  }))
  const rangeDurationMs = Math.max(
    0,
    (chartData.at(-1)?.timestamp ?? 0) -
      (chartData[0]?.timestamp ?? 0) +
      (chartData.length > 1 ? bucketMinutes * 60_000 : 0)
  )

  // Multi-day ranges label the axis by date, so tick once per day instead of
  // repeating the same date on every tick.
  const dayTicks = rangeDurationMs >= DAY_MS ? firstTimestampPerDay(chartData) : undefined
  const axis = { rangeDurationMs, ticks: dayTicks }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartPanel
        title="Utilization"
        meta="% · peak per bucket"
        hint="Peak memory, CPU, and connected-client utilization per bucket. Missing samples remain visible as gaps."
      >
        <UtilizationChart
          data={chartData}
          axis={axis}
          thresholds={thresholdsForChart(thresholds, 'utilization')}
        />
      </ChartPanel>

      <ChartPanel
        title="Memory footprint"
        meta="MiB · peak per bucket"
        hint="Peak allocated and resident memory per bucket against the configured maxmemory capacity."
      >
        <LineMetricChart
          config={memoryChartConfig}
          data={chartData}
          axis={axis}
          thresholds={thresholdsForChart(thresholds, 'memory')}
          leftUnit=" MiB"
          formatValue={formatMiBValue}
          lines={[
            { dataKey: 'usedMemoryMiB', color: 'var(--color-usedMemoryMiB)' },
            { dataKey: 'residentMemoryMiB', color: 'var(--color-residentMemoryMiB)' },
            {
              dataKey: 'memoryCapacityMiB',
              color: 'var(--color-memoryCapacityMiB)',
              type: 'stepAfter',
              dashed: true,
            },
          ]}
        />
      </ChartPanel>

      <ChartPanel
        title="Client pressure"
        meta="left count · right /min"
        hint="Blocked clients and rejected connections use separate count and rate axes."
      >
        <LineMetricChart
          config={clientPressureChartConfig}
          data={chartData}
          axis={axis}
          thresholds={thresholdsForChart(thresholds, 'clientPressure')}
          rightUnit="/m"
          formatValue={formatClientPressureValue}
          thresholdAxis={(threshold) => (threshold.metric === 'blocked_clients' ? 'left' : 'right')}
          lines={[
            { dataKey: 'blockedClients', color: 'var(--color-blockedClients)' },
            {
              dataKey: 'rejectedConnectionsPerMinute',
              color: 'var(--color-rejectedConnectionsPerMinute)',
              axis: 'right',
            },
          ]}
        />
      </ChartPanel>

      <ChartPanel
        title="Memory pressure"
        meta="left /min · right ratio"
        hint="Eviction rate uses the left axis; allocator fragmentation uses the ratio axis on the right."
      >
        <LineMetricChart
          config={memoryPressureChartConfig}
          data={chartData}
          axis={axis}
          thresholds={thresholdsForChart(thresholds, 'memoryPressure')}
          rightUnit="×"
          formatValue={formatMemoryPressureValue}
          thresholdAxis={(threshold) =>
            threshold.metric === 'memory_fragmentation_ratio' ? 'right' : 'left'
          }
          lines={[
            { dataKey: 'evictedKeysPerMinute', color: 'var(--color-evictedKeysPerMinute)' },
            {
              dataKey: 'memoryFragmentationRatio',
              color: 'var(--color-memoryFragmentationRatio)',
              axis: 'right',
            },
          ]}
        />
      </ChartPanel>
    </div>
  )
}

interface TimeAxisSpec {
  rangeDurationMs: number
  ticks?: number[]
}

function UtilizationChart({
  data,
  axis,
  thresholds,
}: {
  data: RedisHealthChartPoint[]
  axis: TimeAxisSpec
  thresholds: RedisHealthThreshold[]
}) {
  return (
    <ChartContainer config={utilizationChartConfig} className={CHART_HEIGHT_CLASS}>
      <AreaChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid vertical={false} />
        <TimeAxis {...axis} />
        <YAxis yAxisId="left" unit="%" tickLine={false} axisLine={false} width={44} />
        <HealthChartTooltip formatValue={formatPercentValue} />
        <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
        {thresholds.map((threshold) => (
          <ThresholdLine key={threshold.ruleId} threshold={threshold} axis="left" />
        ))}
        <Area
          yAxisId="left"
          type="monotone"
          dataKey="memoryUsagePercent"
          stroke="var(--color-memoryUsagePercent)"
          strokeWidth={1.5}
          fill="var(--color-memoryUsagePercent)"
          fillOpacity={0.12}
          connectNulls={false}
          isAnimationActive={false}
        />
        <MetricLine dataKey="cpuUsagePercent" color="var(--color-cpuUsagePercent)" />
        <MetricLine
          dataKey="connectedClientsPercent"
          color="var(--color-connectedClientsPercent)"
        />
      </AreaChart>
    </ChartContainer>
  )
}

function LineMetricChart({
  config,
  data,
  axis,
  thresholds,
  lines,
  leftUnit,
  rightUnit,
  formatValue,
  thresholdAxis = () => 'left',
}: {
  config: ChartConfig
  data: RedisHealthChartPoint[]
  axis: TimeAxisSpec
  thresholds: RedisHealthThreshold[]
  lines: MetricLineSpec[]
  leftUnit?: string
  rightUnit?: string
  formatValue?: ValueFormatter
  thresholdAxis?: (threshold: RedisHealthThreshold) => 'left' | 'right'
}) {
  return (
    <ChartContainer config={config} className={CHART_HEIGHT_CLASS}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid vertical={false} />
        <TimeAxis {...axis} />
        <YAxis
          yAxisId="left"
          unit={leftUnit}
          tickLine={false}
          axisLine={false}
          width={leftUnit ? 60 : 40}
        />
        {rightUnit ? (
          <YAxis
            yAxisId="right"
            orientation="right"
            unit={rightUnit}
            tickLine={false}
            axisLine={false}
            width={44}
          />
        ) : null}
        <HealthChartTooltip formatValue={formatValue} />
        <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
        {thresholds.map((threshold) => (
          <ThresholdLine
            key={threshold.ruleId}
            threshold={threshold}
            axis={thresholdAxis(threshold)}
          />
        ))}
        {lines.map((line) => (
          <MetricLine key={line.dataKey} {...line} />
        ))}
      </LineChart>
    </ChartContainer>
  )
}

function MetricLine({
  dataKey,
  color,
  axis = 'left',
  type = 'monotone',
  dashed = false,
}: MetricLineSpec) {
  return (
    <Line
      yAxisId={axis}
      type={type}
      dataKey={dataKey}
      stroke={color}
      strokeWidth={1.5}
      strokeDasharray={dashed ? '4 3' : undefined}
      dot={false}
      connectNulls={false}
      isAnimationActive={false}
    />
  )
}

function ThresholdLine({
  threshold,
  axis,
}: {
  threshold: RedisHealthThreshold
  axis?: 'left' | 'right'
}) {
  return (
    <ReferenceLine
      yAxisId={axis}
      y={threshold.threshold}
      ifOverflow="extendDomain"
      stroke="var(--color-destructive)"
      strokeWidth={1}
      strokeDasharray="4 3"
    />
  )
}

function TimeAxis({ rangeDurationMs, ticks }: TimeAxisSpec) {
  return (
    <XAxis
      dataKey="timestamp"
      ticks={ticks}
      tickFormatter={(value) => formatRedisHealthChartTick(Number(value), rangeDurationMs)}
      tickLine={false}
      axisLine={false}
      tickMargin={6}
      minTickGap={32}
    />
  )
}

function HealthChartTooltip({ formatValue }: { formatValue?: ValueFormatter }) {
  return (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(value) => formatChartDate(Number(value))}
          formatter={
            formatValue
              ? (value, _name, item) =>
                  typeof value === 'number' ? formatValue(value, String(item.dataKey ?? '')) : value
              : undefined
          }
        />
      }
    />
  )
}

function firstTimestampPerDay(data: RedisHealthChartPoint[]) {
  const ticks: number[] = []
  let previousDay: string | null = null
  for (const point of data) {
    const day = new Date(point.timestamp).toDateString()
    if (day !== previousDay) {
      ticks.push(point.timestamp)
      previousDay = day
    }
  }
  return ticks
}

function bytesToMiB(value: number | null) {
  return value === null ? null : value / (1024 * 1024)
}

function formatDecimal(value: number) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1)
}

function formatChartDate(value: number) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
