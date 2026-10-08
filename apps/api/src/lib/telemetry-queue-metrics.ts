export type TelemetryQueueName = 'mcp_analytics' | 'telemetry_collect' | 'telemetry_events'

interface TelemetryQueueDropInput {
  dropped: number
  inFlight: number
  queueName: TelemetryQueueName
  queued: number
}

const dropTotals = new Map<TelemetryQueueName, number>()

export function recordTelemetryQueueDrop({
  dropped,
  inFlight,
  queueName,
  queued,
}: TelemetryQueueDropInput): void {
  dropTotals.set(queueName, (dropTotals.get(queueName) ?? 0) + 1)

  console.info(
    JSON.stringify({
      type: 'telemetry_queue',
      signal: 'queue_dropped',
      queueName,
      count: 1,
      dropped,
      inFlight,
      queued,
    })
  )
}

/** Test-only helper for asserting operational telemetry queue counters. */
export function getTelemetryQueueDropTotalsForTests(): ReadonlyMap<TelemetryQueueName, number> {
  return dropTotals
}

/** Test-only helper to reset queue counters between tests. */
export function resetTelemetryQueueDropTotalsForTests(): void {
  dropTotals.clear()
}
