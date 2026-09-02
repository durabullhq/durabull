import { Activity } from 'lucide-react'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { type RedisHealthThreshold, thresholdsForChart } from './redis-health-metrics'
import type { RedisHealthHistoryPoint } from './redis-health-types'

const utilizationChartConfig = {
  memoryUsagePercent: {
    label: 'Memory',
    theme: { light: 'hsl(219 86% 48%)', dark: 'hsl(210 94% 68%)' },
  },
  cpuUsagePercent: {
    label: 'CPU',
    theme: { light: 'hsl(267 72% 50%)', dark: 'hsl(271 96% 72%)' },
  },
  connectedClientsPercent: {
    label: 'Client capacity',
    theme: { light: 'hsl(146 55% 38%)', dark: 'hsl(145 63% 54%)' },
  },
} satisfies ChartConfig

const memoryChartConfig = {
  usedMemoryMiB: {
    label: 'Allocated',
    theme: { light: 'hsl(219 86% 48%)', dark: 'hsl(210 94% 68%)' },
  },
  residentMemoryMiB: {
    label: 'Resident',
    theme: { light: 'hsl(35 90% 46%)', dark: 'hsl(38 98% 61%)' },
  },
  memoryCapacityMiB: {
    label: 'Configured capacity',
    theme: { light: 'hsl(146 55% 38%)', dark: 'hsl(145 63% 54%)' },
  },
} satisfies ChartConfig

const clientPressureChartConfig = {
  blockedClients: {
    label: 'Blocked clients',
    theme: { light: 'hsl(35 90% 46%)', dark: 'hsl(38 98% 61%)' },
  },
  rejectedConnectionsPerMinute: {
    label: 'Rejected/min',
    theme: { light: 'hsl(267 72% 50%)', dark: 'hsl(271 96% 72%)' },
  },
} satisfies ChartConfig

const memoryPressureChartConfig = {
  evictedKeysPerMinute: {
    label: 'Evictions/min',
    theme: { light: 'hsl(0 72% 52%)', dark: 'hsl(2 90% 66%)' },
  },
  memoryFragmentationRatio: {
    label: 'Fragmentation ratio',
    theme: { light: 'hsl(191 72% 38%)', dark: 'hsl(188 74% 55%)' },
  },
} satisfies ChartConfig

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
}: {
  series: RedisHealthHistoryPoint[]
  thresholds: RedisHealthThreshold[]
}) {
  const chartData: RedisHealthChartPoint[] = series.map((point) => ({
    ...point,
    timestamp: Date.parse(point.capturedAt),
    usedMemoryMiB: bytesToMiB(point.usedMemoryBytes),
    residentMemoryMiB: bytesToMiB(point.residentMemoryBytes),
    memoryCapacityMiB: bytesToMiB(point.memoryCapacityBytes),
  }))

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <MetricChartCard
        title="Utilization Over Time"
        description="Peak memory, CPU, and connected-client utilization per bucket. Missing samples remain visible as gaps."
      >
        <UtilizationChart
          data={chartData}
          thresholds={thresholdsForChart(thresholds, 'utilization')}
        />
      </MetricChartCard>

      <MetricChartCard
        title="Memory Footprint"
        description="Peak allocated and resident memory per bucket against the configured maxmemory capacity."
      >
        <LineMetricChart
          config={memoryChartConfig}
          data={chartData}
          thresholds={thresholdsForChart(thresholds, 'memory')}
          leftUnit=" MiB"
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
      </MetricChartCard>

      <MetricChartCard
        title="Client Pressure"
        description="Blocked clients and rejected connections use separate count and rate axes."
      >
        <LineMetricChart
          config={clientPressureChartConfig}
          data={chartData}
          thresholds={thresholdsForChart(thresholds, 'clientPressure')}
          rightUnit="/m"
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
      </MetricChartCard>

      <MetricChartCard
        title="Memory Pressure Signals"
        description="Eviction rate uses the left axis; allocator fragmentation uses the ratio axis on the right."
      >
        <LineMetricChart
          config={memoryPressureChartConfig}
          data={chartData}
          thresholds={thresholdsForChart(thresholds, 'memoryPressure')}
          rightUnit="×"
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
      </MetricChartCard>
    </div>
  )
}

function UtilizationChart({
  data,
  thresholds,
}: {
  data: RedisHealthChartPoint[]
  thresholds: RedisHealthThreshold[]
}) {
  return (
    <ChartContainer config={utilizationChartConfig} className="h-[300px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 14, top: 12, bottom: 6 }}>
        <CartesianGrid vertical={false} />
        <TimeAxis />
        <YAxis unit="%" tickLine={false} axisLine={false} width={44} />
        <HealthChartTooltip />
        <ChartLegend content={<ChartLegendContent />} />
        {thresholds.map((threshold) => (
          <ThresholdLine key={threshold.ruleId} threshold={threshold} />
        ))}
        <Area
          type="monotone"
          dataKey="memoryUsagePercent"
          stroke="var(--color-memoryUsagePercent)"
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
  thresholds,
  lines,
  leftUnit,
  rightUnit,
  thresholdAxis = () => 'left',
}: {
  config: ChartConfig
  data: RedisHealthChartPoint[]
  thresholds: RedisHealthThreshold[]
  lines: MetricLineSpec[]
  leftUnit?: string
  rightUnit?: string
  thresholdAxis?: (threshold: RedisHealthThreshold) => 'left' | 'right'
}) {
  return (
    <ChartContainer config={config} className="h-[300px] w-full">
      <LineChart data={data} margin={{ left: 0, right: 8, top: 12, bottom: 6 }}>
        <CartesianGrid vertical={false} />
        <TimeAxis />
        <YAxis
          yAxisId="left"
          unit={leftUnit}
          tickLine={false}
          axisLine={false}
          width={leftUnit ? 64 : 48}
        />
        {rightUnit ? (
          <YAxis
            yAxisId="right"
            orientation="right"
            unit={rightUnit}
            tickLine={false}
            axisLine={false}
            width={56}
          />
        ) : null}
        <HealthChartTooltip />
        <ChartLegend content={<ChartLegendContent />} />
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
      strokeWidth={2}
      strokeDasharray={dashed ? '5 4' : undefined}
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
      stroke="hsl(var(--destructive))"
      strokeDasharray="4 4"
    />
  )
}

function TimeAxis() {
  return (
    <XAxis dataKey="timestamp" tickFormatter={formatChartTime} tickLine={false} axisLine={false} />
  )
}

function HealthChartTooltip() {
  return (
    <ChartTooltip
      content={<ChartTooltipContent labelFormatter={(value) => formatChartDate(Number(value))} />}
    />
  )
}

function MetricChartCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function bytesToMiB(value: number | null) {
  return value === null ? null : value / (1024 * 1024)
}

function formatChartTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatChartDate(value: number) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
