import { afterEach, describe, expect, it, mock } from 'bun:test'

import { resetTelemetryQueueDropTotalsForTests } from '../lib/telemetry-queue-metrics'
import {
  enqueueTelemetryCollectBatch,
  resetTelemetryCollectQueueForTests,
} from './telemetry-collect-queue'

const originalInfo = console.info

describe('telemetry collect queue', () => {
  afterEach(() => {
    console.info = originalInfo
    resetTelemetryCollectQueueForTests()
    resetTelemetryQueueDropTotalsForTests()
  })

  it('rejects new batches and records a drop metric when the bounded queue is full', () => {
    const info = mock(() => {})
    console.info = info as unknown as typeof console.info
    const process = mock(async () => new Promise<never>(() => {}))
    const input = {
      events: [{ event: 'queue_paused', properties: {}, sessionId: 'session-1' }],
      instanceId: 'instance-1',
      clientRuntime: {
        authless: false,
        env_connections: false,
        environment: 'production',
        persistence: 'postgres',
        stateless: false,
      },
    }

    for (let i = 0; i < 4 + 256; i += 1) {
      expect(enqueueTelemetryCollectBatch(input, process)).toBe(true)
    }

    expect(enqueueTelemetryCollectBatch(input, process)).toBe(false)
    expect(info).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'telemetry_queue',
        signal: 'queue_dropped',
        queueName: 'telemetry_collect',
        count: 1,
        dropped: 1,
        inFlight: 4,
        queued: 256,
      })
    )
  })
})
