import { describe, expect, it } from 'vitest'
import { isWorkerActive, WORKER_IDLE_AFTER_SECONDS } from '@/lib/worker-activity'

describe('isWorkerActive', () => {
  it('classifies in seconds, the unit Redis reports client idle time in', () => {
    expect(isWorkerActive(0)).toBe(true)
    expect(isWorkerActive(WORKER_IDLE_AFTER_SECONDS)).toBe(true)
    expect(isWorkerActive(WORKER_IDLE_AFTER_SECONDS + 1)).toBe(false)
  })

  it('keeps a worker that is only waiting for jobs active', () => {
    // BullMQ re-issues its blocking pop at most every 10 seconds, so a healthy
    // waiting worker is observed anywhere from 0 to 10 seconds idle.
    for (let idleSeconds = 0; idleSeconds <= 10; idleSeconds++) {
      expect(isWorkerActive(idleSeconds)).toBe(true)
    }
  })

  it('marks a connection that has been quiet for minutes as idle', () => {
    expect(isWorkerActive(5 * 60)).toBe(false)
  })

  it('uses a one-minute threshold expressed in seconds, not milliseconds', () => {
    expect(WORKER_IDLE_AFTER_SECONDS).toBe(60)
  })
})
