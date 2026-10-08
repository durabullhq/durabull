import { render, waitFor } from '@testing-library/react'
import { cloneElement, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { RedisHealthThreshold } from './redis-health-metrics'
import type { RedisHealthHistoryPoint } from './redis-health-types'

// jsdom has no layout. Keep real Recharts rendering and axis calculations,
// supplying only the dimensions normally measured by ResponsiveContainer.
vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: ({
    children,
  }: {
    children: ReactElement<{ width: number; height: number }>
  }) => cloneElement(children, { width: 700, height: 300 }),
}))

import { RedisHealthCharts } from './redis-health-charts'

function point(capturedAt: string): RedisHealthHistoryPoint {
  return {
    capturedAt,
    sampleCount: 1,
    memoryUsagePercent: 10,
    usedMemoryBytes: 10 * 1024 * 1024,
    residentMemoryBytes: 12 * 1024 * 1024,
    memoryCapacityBytes: 20 * 1024 * 1024,
    cpuUsagePercent: 5,
    memoryFragmentationRatio: 1.2,
    memoryFragmentationBytes: 2 * 1024 * 1024,
    connectedClientsPercent: 10,
    connectedClients: 100,
    maxClients: 1000,
    blockedClients: 0,
    evictedKeysPerMinute: 0,
    rejectedConnectionsPerMinute: 0,
  }
}

describe('RedisHealthCharts rendering', () => {
  it('shows active thresholds beyond measured peaks on both axes of all chart groups', async () => {
    const thresholds: RedisHealthThreshold[] = [
      { ruleId: 'cpu', name: 'CPU', metric: 'cpu_usage_percent', threshold: 75 },
      { ruleId: 'memory', name: 'Memory', metric: 'used_memory_megabytes', threshold: 100 },
      { ruleId: 'blocked', name: 'Blocked', metric: 'blocked_clients', threshold: 50 },
      {
        ruleId: 'rejected',
        name: 'Rejected',
        metric: 'rejected_connections_per_minute',
        threshold: 100,
      },
      { ruleId: 'evicted', name: 'Evicted', metric: 'evicted_keys_per_minute', threshold: 100 },
      {
        ruleId: 'fragmentation',
        name: 'Fragmentation',
        metric: 'memory_fragmentation_ratio',
        threshold: 3,
      },
    ]
    const { container } = render(
      <RedisHealthCharts
        series={[point('2026-09-01T00:00:00.000Z'), point('2026-09-01T00:01:00.000Z')]}
        thresholds={thresholds}
        bucketMinutes={1}
      />
    )

    await waitFor(() => {
      const charts = container.querySelectorAll('[data-chart]')
      expect(charts).toHaveLength(4)
      const expectedCounts = [1, 1, 2, 2]
      charts.forEach((chart, index) => {
        const lines = chart.querySelectorAll('.recharts-reference-line-line')
        expect(lines).toHaveLength(expectedCounts[index])
        lines.forEach((line) => {
          expect(line).toHaveAttribute('stroke', 'var(--color-destructive)')
          for (const attribute of ['x1', 'x2', 'y1', 'y2']) {
            expect(line).toHaveAttribute(attribute)
            expect(Number.isFinite(Number(line.getAttribute(attribute)))).toBe(true)
          }
        })
      })
    })
  })
})
