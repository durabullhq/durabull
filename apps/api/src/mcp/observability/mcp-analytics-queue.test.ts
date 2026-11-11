import { afterEach, describe, expect, it, mock } from 'bun:test'
import { AnalyticsEvents } from '@durabull/analytics/events'

import {
  getTelemetryQueueDropTotalsForTests,
  resetTelemetryQueueDropTotalsForTests,
} from '../../lib/telemetry-queue-metrics'
import { enqueueMcpAnalytics, resetMcpAnalyticsQueueForTests } from './mcp-analytics-queue'
import type { McpAnalyticsInput } from './mcp-analytics'

const originalInfo = console.info
const originalWarn = console.warn

describe('mcp analytics queue', () => {
  afterEach(() => {
    console.info = originalInfo
    console.warn = originalWarn
    resetMcpAnalyticsQueueForTests()
    resetTelemetryQueueDropTotalsForTests()
  })

  it('exposes processing failures without disrupting MCP or logging credentials', async () => {
    const warn = mock(() => {})
    console.warn = warn as unknown as typeof console.warn
    enqueueMcpAnalytics({ event: AnalyticsEvents.MCP_RPC_COMPLETED }, async () => {
      throw new Error('SECRET upstream error')
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(warn).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'telemetry_queue',
        queueName: 'mcp_analytics',
        signal: 'queue_failed',
      })
    )
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET')
  })

  it('warns and records a drop metric when dropping events because the queue is full', () => {
    const info = mock(() => {})
    const warn = mock(() => {})
    console.info = info as unknown as typeof console.info
    console.warn = warn as unknown as typeof console.warn
    const process = mock(async () => new Promise<void>(() => {}))
    const input: McpAnalyticsInput = {
      event: AnalyticsEvents.MCP_TOOL_CALLED,
      properties: { tool_name: 'list_jobs', response_class: 'success' },
    }

    for (let i = 0; i < 8 + 512 + 1; i += 1) {
      enqueueMcpAnalytics(input, process)
    }

    expect(warn).toHaveBeenCalledWith('[analytics] MCP analytics queue full; dropping event')
    expect(getTelemetryQueueDropTotalsForTests().get('mcp_analytics')).toBe(1)
    expect(info).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'telemetry_queue',
        signal: 'queue_dropped',
        queueName: 'mcp_analytics',
        count: 1,
        dropped: 1,
        inFlight: 8,
        queued: 512,
      })
    )
  })
})
