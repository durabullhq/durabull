import { describe, expect, it, mock } from 'bun:test'
import type { RedisClient } from 'bullmq'
import {
  applyQueueFlowControls,
  clearQueueRateLimitWindow,
  readQueueFlowControlLimits,
  readQueueFlowControls,
  updateFlowControlsSchema,
} from './queue-flow-controls'

function createQueue(
  overrides: {
    concurrency?: number | null
    rateLimit?: { max: number; duration: number } | null
    ttl?: number
    active?: number
  } = {}
) {
  const redis = { eval: mock(async () => 0) }
  return {
    redis,
    client: Promise.resolve(redis as unknown as RedisClient),
    keys: { limiter: 'bull:emails:limiter' },
    getGlobalConcurrency: mock(async () => overrides.concurrency ?? null),
    getGlobalRateLimit: mock(async () => overrides.rateLimit ?? null),
    getRateLimitTtl: mock(async () => overrides.ttl ?? -2),
    getActiveCount: mock(async () => overrides.active ?? 0),
    setGlobalConcurrency: mock(async () => 1),
    removeGlobalConcurrency: mock(async () => 1),
    setGlobalRateLimit: mock(async () => 1),
    removeGlobalRateLimit: mock(async () => 1),
    removeRateLimitKey: mock(async () => 1),
  }
}

describe('readQueueFlowControls', () => {
  it('reports unset limits and no throttle for a fresh queue', async () => {
    const state = await readQueueFlowControls(createQueue())

    expect(state).toEqual({
      globalConcurrency: null,
      globalRateLimit: null,
      rateLimitTtlMs: 0,
      rateLimited: false,
      isMaxed: false,
      activeCount: 0,
    })
  })

  it('maps configured limits and an active throttle window', async () => {
    const state = await readQueueFlowControls(
      createQueue({
        concurrency: 5,
        rateLimit: { max: 100, duration: 60_000 },
        ttl: 4_250,
        active: 5,
      })
    )

    expect(state).toEqual({
      globalConcurrency: 5,
      globalRateLimit: { max: 100, durationMs: 60_000 },
      rateLimitTtlMs: 4_250,
      rateLimited: true,
      isMaxed: true,
      activeCount: 5,
    })
  })

  it('reports the cap as reached only once active jobs meet it', async () => {
    expect((await readQueueFlowControls(createQueue({ concurrency: 5, active: 4 }))).isMaxed).toBe(
      false
    )
    expect((await readQueueFlowControls(createQueue({ concurrency: 5, active: 6 }))).isMaxed).toBe(
      true
    )
  })

  it('surfaces meta read errors instead of reporting no limits', async () => {
    const queue = createQueue()
    queue.getGlobalRateLimit.mockImplementation(async () => {
      throw new Error('NOPERM')
    })
    await expect(readQueueFlowControls(queue)).rejects.toThrow('NOPERM')
  })

  it('treats a limiter key without expiry (-1) as not throttled', async () => {
    const state = await readQueueFlowControls(createQueue({ ttl: -1 }))
    expect(state.rateLimitTtlMs).toBe(0)
    expect(state.rateLimited).toBe(false)
  })
})

describe('rate-limit TTL source', () => {
  it('uses the global max when a global rate limit is set', async () => {
    const queue = createQueue({ rateLimit: { max: 10, duration: 1_000 }, ttl: 500 })
    await readQueueFlowControls(queue)
    expect(queue.getRateLimitTtl).toHaveBeenCalledWith(undefined)
  })

  it('only counts a manual rateLimit() marker when no global limit is set', async () => {
    const queue = createQueue()
    await readQueueFlowControls(queue)
    expect(queue.getRateLimitTtl).toHaveBeenCalledWith(Number.MAX_SAFE_INTEGER)
  })
})

describe('readQueueFlowControlLimits', () => {
  it('tolerates queues that cannot read meta', async () => {
    const limits = await readQueueFlowControlLimits({
      getGlobalConcurrency: async () => {
        throw new Error('NOPERM')
      },
    })
    expect(limits).toEqual({ globalConcurrency: null, globalRateLimit: null })
  })
})

describe('applyQueueFlowControls', () => {
  it('sets both limits', async () => {
    const queue = createQueue()
    await applyQueueFlowControls(queue, {
      globalConcurrency: 3,
      globalRateLimit: { max: 10, durationMs: 1_000 },
    })

    expect(queue.setGlobalConcurrency).toHaveBeenCalledWith(3)
    expect(queue.setGlobalRateLimit).toHaveBeenCalledWith(10, 1_000)
    expect(queue.removeGlobalConcurrency).not.toHaveBeenCalled()
    expect(queue.removeGlobalRateLimit).not.toHaveBeenCalled()
  })

  it('caps an open limiter window at the new duration, sparing a manual marker', async () => {
    const queue = createQueue()
    await applyQueueFlowControls(queue, { globalRateLimit: { max: 10, durationMs: 1_000 } })

    expect(queue.redis.eval).toHaveBeenCalledTimes(1)
    const [script, numKeys, key, duration, marker] = queue.redis.eval.mock.calls[0] as unknown[]
    expect(script).toContain('PEXPIRE')
    expect([numKeys, key, duration, marker]).toEqual([
      1,
      'bull:emails:limiter',
      1_000,
      Number.MAX_SAFE_INTEGER,
    ])
  })

  it('leaves the limiter window alone when only concurrency changes', async () => {
    const queue = createQueue()
    await applyQueueFlowControls(queue, { globalConcurrency: 4, globalRateLimit: null })
    expect(queue.redis.eval).not.toHaveBeenCalled()
  })

  it('removes limits passed as null and leaves omitted ones untouched', async () => {
    const queue = createQueue()
    await applyQueueFlowControls(queue, { globalConcurrency: null })

    expect(queue.removeGlobalConcurrency).toHaveBeenCalledTimes(1)
    expect(queue.setGlobalRateLimit).not.toHaveBeenCalled()
    expect(queue.removeGlobalRateLimit).not.toHaveBeenCalled()
  })
})

describe('clearQueueRateLimitWindow', () => {
  it('removes the limiter key', async () => {
    const queue = createQueue()
    await clearQueueRateLimitWindow(queue)
    expect(queue.removeRateLimitKey).toHaveBeenCalledTimes(1)
  })
})

describe('updateFlowControlsSchema', () => {
  it('rejects an empty update', () => {
    expect(updateFlowControlsSchema.safeParse({}).success).toBe(false)
  })

  it('rejects zero, fractional, and out-of-range values', () => {
    expect(updateFlowControlsSchema.safeParse({ globalConcurrency: 0 }).success).toBe(false)
    expect(updateFlowControlsSchema.safeParse({ globalConcurrency: 1.5 }).success).toBe(false)
    expect(
      updateFlowControlsSchema.safeParse({ globalRateLimit: { max: 1, durationMs: 0 } }).success
    ).toBe(false)
    expect(
      updateFlowControlsSchema.safeParse({
        globalRateLimit: { max: 1, durationMs: 86_400_001 },
      }).success
    ).toBe(false)
  })

  it('rejects unknown keys', () => {
    expect(
      updateFlowControlsSchema.safeParse({ globalConcurrency: 2, concurrency: 2 }).success
    ).toBe(false)
    expect(
      updateFlowControlsSchema.safeParse({
        globalRateLimit: { max: 10, durationMs: 1000, duration: 60000 },
      }).success
    ).toBe(false)
  })

  it('accepts nulls to remove limits', () => {
    expect(
      updateFlowControlsSchema.safeParse({ globalConcurrency: null, globalRateLimit: null }).success
    ).toBe(true)
  })
})
