import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RedisHealthObservability } from './redis-health-observability'
import type { RedisHealthHistoryResponse } from './redis-health-types'

function createResponse(): RedisHealthHistoryResponse {
  const capturedAt = new Date(Date.now() - 10 * 60_000).toISOString()
  return {
    latest: {
      capturedAt,
      memoryCapacitySource: 'maxmemory',
      memoryUsagePercent: 80,
      usedMemoryBytes: 80 * 1024 * 1024,
      residentMemoryBytes: 90 * 1024 * 1024,
      memoryCapacityBytes: 100 * 1024 * 1024,
      cpuUsagePercent: 42.5,
      memoryFragmentationRatio: 1.125,
      memoryFragmentationBytes: 10 * 1024 * 1024,
      connectedClientsPercent: 90,
      connectedClients: 900,
      maxClients: 1000,
      blockedClients: 2,
      evictedKeysPerMinute: 3,
      rejectedConnectionsPerMinute: 1,
    },
    range: {
      from: new Date(Date.now() - 3 * 60_000).toISOString(),
      to: new Date().toISOString(),
      bucketMinutes: 1,
      expectedSampleIntervalMinutes: 1,
      aggregation: 'max',
      totalBuckets: 3,
      sampledBuckets: 2,
      coveragePercent: 66.7,
    },
    series: [
      {
        capturedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
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
      },
      {
        capturedAt: new Date(Date.now() - 60_000).toISOString(),
        sampleCount: 0,
        memoryUsagePercent: null,
        usedMemoryBytes: null,
        residentMemoryBytes: null,
        memoryCapacityBytes: null,
        cpuUsagePercent: null,
        memoryFragmentationRatio: null,
        memoryFragmentationBytes: null,
        connectedClientsPercent: null,
        connectedClients: null,
        maxClients: null,
        blockedClients: null,
        evictedKeysPerMinute: null,
        rejectedConnectionsPerMinute: null,
      },
      {
        capturedAt,
        sampleCount: 1,
        memoryUsagePercent: 80,
        usedMemoryBytes: 80 * 1024 * 1024,
        residentMemoryBytes: 90 * 1024 * 1024,
        memoryCapacityBytes: 100 * 1024 * 1024,
        cpuUsagePercent: 42.5,
        memoryFragmentationRatio: 1.125,
        memoryFragmentationBytes: 10 * 1024 * 1024,
        connectedClientsPercent: 90,
        connectedClients: 900,
        maxClients: 1000,
        blockedClients: 2,
        evictedKeysPerMinute: 3,
        rejectedConnectionsPerMinute: 1,
      },
    ],
    thresholds: [
      {
        ruleId: 'rule-1',
        name: 'Redis memory pressure',
        metric: 'memory_usage_percent',
        threshold: 75,
      },
    ],
    collectionEnabled: true,
    retentionDays: 30,
    staleAfterMs: 180_000,
  }
}

describe('RedisHealthObservability', () => {
  it('shows current resource health, gaps, staleness, and alert thresholds', async () => {
    render(<RedisHealthObservability data={createResponse()} />)

    expect(screen.getByRole('heading', { name: 'Redis Resource Health' })).toBeInTheDocument()
    expect(screen.getByText('80.0%')).toBeInTheDocument()
    expect(screen.getByText('42.5%')).toBeInTheDocument()
    expect(screen.getByText('Data stale')).toBeInTheDocument()
    expect(screen.getByText('66.7% coverage · 1 gap')).toBeInTheDocument()
    expect(screen.getByText('Redis memory pressure ≥ 75%')).toBeInTheDocument()
    // Charts are code-split behind React.lazy, so they arrive after the summary cards.
    expect(
      await screen.findByRole('heading', { name: 'Utilization Over Time' })
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Memory Footprint' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Client Pressure' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Memory Pressure Signals' })).toBeInTheDocument()
  })

  it('keeps a Redis telemetry failure local to the observability panel', () => {
    render(<RedisHealthObservability data={undefined} error={new Error('history unavailable')} />)

    expect(screen.getByText('Redis telemetry unavailable')).toBeInTheDocument()
    expect(screen.getByText('history unavailable')).toBeInTheDocument()
  })

  it('does not label a field-empty INFO sample as live', () => {
    const response = createResponse()
    response.latest = {
      ...response.latest!,
      memoryUsagePercent: null,
      usedMemoryBytes: null,
      residentMemoryBytes: null,
      memoryCapacityBytes: null,
      cpuUsagePercent: null,
      memoryFragmentationRatio: null,
      memoryFragmentationBytes: null,
      connectedClientsPercent: null,
      connectedClients: null,
      maxClients: null,
      blockedClients: null,
      evictedKeysPerMinute: null,
      rejectedConnectionsPerMinute: null,
      capturedAt: new Date().toISOString(),
    }

    render(<RedisHealthObservability data={response} />)

    expect(screen.getByText('No health fields')).toBeInTheDocument()
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
  })
})
