import { createBoundedAsyncQueue } from '../../lib/bounded-async-queue'
import { recordTelemetryQueueDrop } from '../../lib/telemetry-queue-metrics'
import type { McpAnalyticsInput } from './mcp-analytics'

const MAX_ANALYTICS_IN_FLIGHT = 8
const MAX_ANALYTICS_QUEUE_DEPTH = 512

export type ProcessMcpAnalytics = (input: McpAnalyticsInput) => Promise<void>

const analyticsQueue = createBoundedAsyncQueue<McpAnalyticsInput>({
  maxInFlight: MAX_ANALYTICS_IN_FLIGHT,
  maxQueueDepth: MAX_ANALYTICS_QUEUE_DEPTH,
  onDrop: (_input, state) => {
    recordTelemetryQueueDrop({
      dropped: state.dropped,
      inFlight: state.inFlight,
      queueName: 'mcp_analytics',
      queued: state.queued,
    })
    console.warn('[analytics] MCP analytics queue full; dropping event')
  },
  onError: () => {
    // Analytics must never affect MCP behavior.
  },
})

export function enqueueMcpAnalytics(input: McpAnalyticsInput, process: ProcessMcpAnalytics): void {
  analyticsQueue.enqueue(input, process)
}

/** Test-only */
export function resetMcpAnalyticsQueueForTests(): void {
  analyticsQueue.resetForTests()
}
