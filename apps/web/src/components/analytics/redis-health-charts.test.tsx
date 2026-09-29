import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { RedisHealthThreshold } from './redis-health-metrics'
import type { RedisHealthHistoryPoint } from './redis-health-types'

vi.mock('recharts', () => {
  function Container({ children }: { children?: ReactNode }) {
    return <div>{children}</div>
  }

  function Series({ dataKey, yAxisId }: { dataKey?: string; yAxisId?: string }) {
    return <div data-testid={`series-${dataKey}`} data-y-axis-id={yAxisId} />
  }

  function ReferenceLine({ yAxisId }: { yAxisId?: string }) {
    return <div data-testid="threshold-line" data-y-axis-id={yAxisId} />
  }

  function YAxis({ yAxisId }: { yAxisId?: string }) {
    return <div data-testid="y-axis" data-y-axis-id={yAxisId} />
  }

  return {
    Area: Series,
    AreaChart: Container,
    CartesianGrid: () => null,
    Legend: () => null,
    Line: Series,
    LineChart: Container,
    ReferenceLine,
    ResponsiveContainer: Container,
    Tooltip: () => null,
    XAxis: ({ tickFormatter }: { tickFormatter: (value: number) => string }) => (
      <div data-testid="time-axis">{tickFormatter(Date.parse('2026-09-02T18:30:00.000Z'))}</div>
    ),
    YAxis,
  }
})

import { formatRedisHealthChartTick } from './redis-health-chart-format'
import { RedisHealthCharts } from './redis-health-charts'

function point(capturedAt: string): RedisHealthHistoryPoint {
  return {
    capturedAt,
    sampleCount: 1,
    memoryUsagePercent: 70,
    usedMemoryBytes: 70 * 1024 * 1024,
    residentMemoryBytes: 80 * 1024 * 1024,
    memoryCapacityBytes: 100 * 1024 * 1024,
    cpuUsagePercent: 20,
    memoryFragmentationRatio: 1.14,
    memoryFragmentationBytes: 10 * 1024 * 1024,
    connectedClientsPercent: 80,
    connectedClients: 800,
    maxClients: 1000,
    blockedClients: 0,
    evictedKeysPerMinute: 0,
    rejectedConnectionsPerMinute: 0,
  }
}

describe('RedisHealthCharts', () => {
  it('binds every utilization series and threshold to the visible percentage axis', () => {
    const thresholds: RedisHealthThreshold[] = [
      {
        ruleId: 'memory-rule',
        name: 'Memory pressure',
        metric: 'memory_usage_percent',
        threshold: 80,
      },
      {
        ruleId: 'cpu-rule',
        name: 'CPU pressure',
        metric: 'cpu_usage_percent',
        threshold: 75,
      },
    ]

    render(
      <RedisHealthCharts
        series={[point('2026-09-01T00:00:00.000Z'), point('2026-09-01T01:00:00.000Z')]}
        thresholds={thresholds}
        bucketMinutes={60}
      />
    )

    expect(screen.getAllByTestId('y-axis')[0]).toHaveAttribute('data-y-axis-id', 'left')
    expect(screen.getByTestId('series-memoryUsagePercent')).toHaveAttribute(
      'data-y-axis-id',
      'left'
    )
    expect(screen.getByTestId('series-cpuUsagePercent')).toHaveAttribute('data-y-axis-id', 'left')
    expect(screen.getByTestId('series-connectedClientsPercent')).toHaveAttribute(
      'data-y-axis-id',
      'left'
    )
    for (const threshold of screen.getAllByTestId('threshold-line')) {
      expect(threshold).toHaveAttribute('data-y-axis-id', 'left')
    }
  })

  it('uses dates for multi-day ranges and times for shorter ranges', () => {
    const timestamp = Date.parse('2026-09-02T18:30:00.000Z')

    expect(formatRedisHealthChartTick(timestamp, 7 * 24 * 60 * 60 * 1000)).toBe(
      new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
    )
    expect(formatRedisHealthChartTick(timestamp, 6 * 60 * 60 * 1000)).toBe(
      new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    )
  })

  it('includes the final bucket width when formatting an inclusive 24-hour series', () => {
    const timestamp = Date.parse('2026-09-02T18:30:00.000Z')

    render(
      <RedisHealthCharts
        series={[point('2026-09-01T00:00:00.000Z'), point('2026-09-01T23:56:00.000Z')]}
        thresholds={[]}
        bucketMinutes={4}
      />
    )

    const expected = new Date(timestamp).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    })
    for (const axis of screen.getAllByTestId('time-axis')) {
      expect(axis).toHaveTextContent(expected)
    }
  })
})
