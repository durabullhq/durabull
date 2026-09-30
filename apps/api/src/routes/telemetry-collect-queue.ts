import {
  ingestTelemetryCollectBatch,
  type IngestCollectBatchResult,
  type ServerAnalyticsRuntimeContext,
  type TelemetryCollectEventInput,
} from '@durabull/analytics/server'
import { createBoundedAsyncQueue } from '../lib/bounded-async-queue'
import { recordTelemetryQueueDrop } from '../lib/telemetry-queue-metrics'

interface TelemetryCollectQueueItem {
  instanceId: string
  sentAt?: string
  events: TelemetryCollectEventInput[]
  clientRuntime?: ServerAnalyticsRuntimeContext
}

const MAX_COLLECT_IN_FLIGHT = 4
const MAX_COLLECT_QUEUE_DEPTH = 256

type ProcessCollectBatch = (input: TelemetryCollectQueueItem) => Promise<IngestCollectBatchResult>

function logCollectFailure(result: IngestCollectBatchResult): void {
  if (result.ok) return
  console.warn(`[analytics] async /collect batch failed: ${result.error}`)
}

const collectQueue = createBoundedAsyncQueue<TelemetryCollectQueueItem, IngestCollectBatchResult>({
  maxInFlight: MAX_COLLECT_IN_FLIGHT,
  maxQueueDepth: MAX_COLLECT_QUEUE_DEPTH,
  onDrop: (_input, state) => {
    recordTelemetryQueueDrop({
      dropped: state.dropped,
      inFlight: state.inFlight,
      queueName: 'telemetry_collect',
      queued: state.queued,
    })
  },
  onError: () => {
    console.warn('[analytics] async /collect batch threw unexpectedly')
  },
  onResult: logCollectFailure,
})

export function enqueueTelemetryCollectBatch(
  input: TelemetryCollectQueueItem,
  process: ProcessCollectBatch = ingestTelemetryCollectBatch
): boolean {
  return collectQueue.enqueue(input, process)
}

/** Test-only */
export function resetTelemetryCollectQueueForTests(): void {
  collectQueue.resetForTests()
}
