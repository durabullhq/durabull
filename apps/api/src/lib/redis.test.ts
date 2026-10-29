import { afterEach, beforeEach, describe, expect, it, mock, setSystemTime } from 'bun:test'

const queueInstances: Array<{
  name: string
  opts: { prefix?: string; connection?: { url?: string } }
  closed: boolean
  emit(event: string, error: Error): void
  endConnection(): void
}> = []
const scanCalls: Array<Array<string | number>> = []
const redisInstances: Array<{ url: string }> = []
let connectErrors: string[] = []
// When set, the next queues' clients never become ready (BullMQ rejects queue.client).
let queueConnectError: string | null = null
let importId = 0

async function importFreshRedis(): Promise<typeof import('./redis')> {
  importId += 1
  return import(`./redis?redis-prefix-test=${importId}`) as Promise<typeof import('./redis')>
}

mock.module('bullmq', () => ({
  Queue: class MockQueue {
    name: string
    opts: { prefix?: string; connection?: { url?: string } }

    closed = false
    readonly client: Promise<{ status: string; once(event: string, handler: () => void): void }>

    private readonly handlers = new Map<string, (error: Error) => void>()
    private readonly clientState = { status: 'ready', endHandlers: [] as Array<() => void> }

    constructor(name: string, opts: { prefix?: string; connection?: { url?: string } }) {
      this.name = name
      this.opts = opts
      const state = this.clientState
      this.client = queueConnectError
        ? Promise.reject(new Error(queueConnectError))
        : Promise.resolve({
            get status() {
              return state.status
            },
            once(event: string, handler: () => void) {
              if (event === 'end') state.endHandlers.push(handler)
            },
          })
      queueInstances.push(this)
    }

    on(event: string, handler: (error: Error) => void) {
      this.handlers.set(event, handler)
    }

    emit(event: string, error: Error) {
      this.handlers.get(event)?.(error)
    }

    // Mirrors ioredis giving up after its reconnect attempts.
    endConnection() {
      this.clientState.status = 'end'
      for (const handler of this.clientState.endHandlers.splice(0)) handler()
    }

    async close() {
      this.closed = true
    }
  },
}))

/** Lets the queue.client promise callbacks in getQueue run. */
async function flushQueueClients() {
  await Bun.sleep(0)
}

mock.module('ioredis', () => ({
  Redis: class MockRedis {
    status = 'ready'
    private readonly handlers = new Map<string, (error: Error) => void>()

    constructor(
      readonly url: string,
      readonly opts: unknown
    ) {
      redisInstances.push(this)
    }

    async connect() {
      if (connectErrors.length === 0) return
      // Mirrors ioredis: the cause arrives as error events, connect() rejects generically.
      for (const message of connectErrors) {
        this.handlers.get('error')?.(new Error(message))
      }
      throw new Error('Connection is closed.')
    }

    on(event: string, handler: (error: Error) => void) {
      this.handlers.set(event, handler)
    }

    disconnect() {}

    async scan(...args: Array<string | number>): Promise<[string, string[]]> {
      scanCalls.push(args)
      return ['0', []]
    }
  },
}))

describe('redis queue prefix handling', () => {
  beforeEach(() => {
    queueInstances.length = 0
    scanCalls.length = 0
  })

  it('caches queues separately by connection URL and prefix', async () => {
    const { getQueue } = await importFreshRedis()

    const first = await getQueue('conn-1', 'redis://localhost:6379/0', 'email', 'bull')
    const same = await getQueue('conn-1', 'redis://localhost:6379/0', 'email', 'bull')
    const differentPrefix = await getQueue(
      'conn-1',
      'redis://localhost:6379/0',
      'email',
      'tenant-a'
    )
    const differentUrl = await getQueue('conn-1', 'redis://localhost:6379/1', 'email', 'bull')

    expect(same).toBe(first)
    expect(differentPrefix).not.toBe(first)
    expect(differentUrl).not.toBe(first)
    expect(queueInstances.map((queue) => queue.opts.prefix)).toContain('tenant-a')
    expect(queueInstances.map((queue) => queue.opts.connection?.url)).toContain(
      'redis://localhost:6379/1'
    )
  })

  it('escapes prefix glob characters when scanning queue metadata', async () => {
    const { debugGetBullKeys, scanQueuesPage } = await importFreshRedis()

    await scanQueuesPage('conn-2', 'redis://localhost:6379/0', '0', 100, 'bull\\prod[1]*?')
    await debugGetBullKeys('conn-3', 'redis://localhost:6379/0', 'bull\\prod[1]*?')

    expect(scanCalls[0]).toEqual(['0', 'MATCH', 'bull\\\\prod\\[1\\]\\*\\?:*:meta', 'COUNT', 100])
    expect(scanCalls[1]).toEqual(['0', 'MATCH', 'bull\\\\prod\\[1\\]\\*\\?:*', 'COUNT', 100])
  })
})

describe('redis connection failure backoff', () => {
  const resolvedHosts: string[] = []
  let unresolvableHosts = new Set<string>()

  async function importWithResolver() {
    const redis = await importFreshRedis()
    redis.__redisTestUtils.setHostnameResolver(async (hostname) => {
      resolvedHosts.push(hostname)
      if (unresolvableHosts.has(hostname)) {
        throw new Error(`getaddrinfo ENOTFOUND ${hostname}`)
      }
    })
    return redis
  }

  beforeEach(() => {
    redisInstances.length = 0
    resolvedHosts.length = 0
    unresolvableHosts = new Set()
    connectErrors = []
    queueInstances.length = 0
    queueConnectError = null
    setSystemTime(new Date('2026-10-28T00:00:00Z'))
  })

  afterEach(() => {
    setSystemTime()
  })

  it('rejects unresolvable hosts without creating a client', async () => {
    const { getRedis } = await importWithResolver()
    unresolvableHosts.add('deleted-review-app.example.com')

    const attempt = getRedis(
      'conn-dns',
      'redis://default:secret@deleted-review-app.example.com:6379',
      'Review app',
      undefined,
      { cache: false }
    )

    await expect(attempt).rejects.toMatchObject({
      code: 'REDIS_UNAVAILABLE',
      message:
        'Failed to connect to Redis (Review app): getaddrinfo ENOTFOUND deleted-review-app.example.com',
    })
    expect(redisInstances).toHaveLength(0)
  })

  it('skips DNS resolution for IP literals', async () => {
    const { getRedis } = await importWithResolver()

    await getRedis('conn-ip4', 'redis://127.0.0.1:6379')
    await getRedis('conn-ip6', 'redis://[::1]:6379')

    expect(resolvedHosts).toEqual([])
    expect(redisInstances).toHaveLength(2)
  })

  it('backs off repeated connect failures exponentially up to five minutes', async () => {
    const { getRedis } = await importWithResolver()
    connectErrors = ['connect ETIMEDOUT']
    const url = 'redis://unreachable.example.com:6379'
    const start = Date.now()

    await expect(getRedis('conn-down', url)).rejects.toThrow('connect ETIMEDOUT')
    expect(redisInstances).toHaveLength(1)

    // Within the first 5s window no new client is created.
    setSystemTime(new Date(start + 4_999))
    await expect(getRedis('conn-down', url)).rejects.toThrow('connect ETIMEDOUT')
    expect(redisInstances).toHaveLength(1)

    let elapsed = 0
    const expectedWindows = [5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]
    for (const [index, windowMs] of expectedWindows.entries()) {
      elapsed += windowMs
      setSystemTime(new Date(start + elapsed - 1))
      await expect(getRedis('conn-down', url)).rejects.toThrow('connect ETIMEDOUT')
      expect(redisInstances).toHaveLength(index + 1)

      setSystemTime(new Date(start + elapsed))
      await expect(getRedis('conn-down', url)).rejects.toThrow('connect ETIMEDOUT')
      expect(redisInstances).toHaveLength(index + 2)
    }
  })

  it('shares backoff between caller-owned probes and cached clients', async () => {
    const { getRedis } = await importWithResolver()
    connectErrors = ['connect ETIMEDOUT']
    const url = 'redis://unreachable.example.com:6379'

    await expect(
      getRedis('conn-shared', url, 'Shared', undefined, { cache: false })
    ).rejects.toThrow('connect ETIMEDOUT')
    await expect(getRedis('conn-shared', url, 'Shared')).rejects.toThrow('connect ETIMEDOUT')
    expect(redisInstances).toHaveLength(1)

    // And in the other direction: a failed cached client holds off the next probe.
    setSystemTime(new Date(Date.now() + 5_000))
    await expect(getRedis('conn-shared', url, 'Shared')).rejects.toThrow('connect ETIMEDOUT')
    await expect(
      getRedis('conn-shared', url, 'Shared', undefined, { cache: false })
    ).rejects.toThrow('connect ETIMEDOUT')
    expect(redisInstances).toHaveLength(2)
  })

  it('resets backoff after a successful connection', async () => {
    const { getRedis } = await importWithResolver()
    connectErrors = ['connect ETIMEDOUT']
    const url = 'redis://flaky.example.com:6379'
    const start = Date.now()

    await expect(
      getRedis('conn-flaky', url, 'Flaky', undefined, { cache: false })
    ).rejects.toThrow()
    setSystemTime(new Date(start + 5_000))
    await expect(
      getRedis('conn-flaky', url, 'Flaky', undefined, { cache: false })
    ).rejects.toThrow()

    connectErrors = []
    setSystemTime(new Date(start + 15_000))
    await getRedis('conn-flaky', url, 'Flaky', undefined, { cache: false })

    // The next failure starts again from the 5s window rather than 20s.
    connectErrors = ['connect ETIMEDOUT']
    await expect(
      getRedis('conn-flaky', url, 'Flaky', undefined, { cache: false })
    ).rejects.toThrow()
    setSystemTime(new Date(start + 20_000))
    await expect(
      getRedis('conn-flaky', url, 'Flaky', undefined, { cache: false })
    ).rejects.toThrow()
    expect(redisInstances).toHaveLength(5)
  })

  it('reports the underlying error instead of "Connection is closed"', async () => {
    const { getRedis } = await importWithResolver()
    connectErrors = ['connect ECONNREFUSED 34.200.87.98:24799']

    await expect(getRedis('conn-refused', 'redis://refused.example.com:24799')).rejects.toThrow(
      'Failed to connect to Redis (conn-refused): connect ECONNREFUSED 34.200.87.98:24799'
    )
  })

  it('keeps permanent failures in cooldown for at least 30 seconds', async () => {
    const { getRedis } = await importWithResolver()
    connectErrors = ['NOAUTH Authentication required.']
    const url = 'redis://locked.example.com:6379'
    const start = Date.now()

    await expect(getRedis('conn-auth', url)).rejects.toThrow('NOAUTH')
    setSystemTime(new Date(start + 29_999))
    await expect(getRedis('conn-auth', url)).rejects.toThrow('NOAUTH')
    expect(redisInstances).toHaveLength(1)

    setSystemTime(new Date(start + 30_000))
    await expect(getRedis('conn-auth', url)).rejects.toThrow('NOAUTH')
    expect(redisInstances).toHaveLength(2)
  })

  it('keeps a permanent error as the cause when generic errors follow it', async () => {
    const { getRedis } = await importWithResolver()
    connectErrors = ['NOAUTH Authentication required.', 'Connection is closed.']

    await expect(getRedis('conn-noauth', 'redis://locked.example.com:6379')).rejects.toThrow(
      'Failed to connect to Redis (conn-noauth): NOAUTH Authentication required.'
    )
  })

  it('rejects queues on unresolvable hosts without creating them, then backs off', async () => {
    const { getQueue } = await importWithResolver()
    unresolvableHosts.add('deleted-review-app.example.com')
    const url = 'redis://deleted-review-app.example.com:6379'

    await expect(getQueue('conn-queue-dns', url, 'email')).rejects.toMatchObject({
      code: 'REDIS_UNAVAILABLE',
      message:
        'Failed to connect to Redis (conn-queue-dns): getaddrinfo ENOTFOUND deleted-review-app.example.com',
    })
    await expect(getQueue('conn-queue-dns', url, 'billing')).rejects.toThrow('ENOTFOUND')

    expect(queueInstances).toHaveLength(0)
    expect(resolvedHosts).toEqual(['deleted-review-app.example.com'])
  })

  it('does not rebuild a queue during the cooldown after a permanent error', async () => {
    const { getQueue } = await importWithResolver()
    const url = 'redis://locked.example.com:6379'
    const start = Date.now()

    const queue = await getQueue('conn-queue-auth', url, 'email')
    queueInstances[0]?.emit('error', new Error('NOAUTH Authentication required.'))

    setSystemTime(new Date(start + 29_999))
    await expect(getQueue('conn-queue-auth', url, 'email')).rejects.toThrow('NOAUTH')
    expect(queueInstances).toHaveLength(1)

    setSystemTime(new Date(start + 30_000))
    const rebuilt = await getQueue('conn-queue-auth', url, 'email')
    expect(rebuilt).not.toBe(queue)
    expect(queueInstances).toHaveLength(2)
  })

  it('evicts a queue whose connection ended and rebuilds it after the backoff', async () => {
    const { getQueue } = await importWithResolver()
    const url = 'redis://outage.example.com:6379'
    const start = Date.now()

    const queue = await getQueue('conn-queue-end', url, 'email')
    await flushQueueClients()
    queueInstances[0]?.emit('error', new Error('connect ECONNREFUSED 10.0.0.1:6379'))
    queueInstances[0]?.endConnection()

    expect(queueInstances[0]?.closed).toBe(true)
    setSystemTime(new Date(start + 4_999))
    await expect(getQueue('conn-queue-end', url, 'email')).rejects.toMatchObject({
      code: 'REDIS_UNAVAILABLE',
      message: 'Failed to connect to Redis (conn-queue-end): connect ECONNREFUSED 10.0.0.1:6379',
    })
    expect(queueInstances).toHaveLength(1)

    setSystemTime(new Date(start + 5_000))
    const rebuilt = await getQueue('conn-queue-end', url, 'email')
    expect(rebuilt).not.toBe(queue)
    expect(queueInstances).toHaveLength(2)
  })

  it('keeps the transport error as the cause when "Connection is closed" follows it', async () => {
    const { getQueue } = await importWithResolver()
    const url = 'redis://refused-queue.example.com:6379'

    await getQueue('conn-queue-cause', url, 'email')
    await flushQueueClients()
    queueInstances[0]?.emit('error', new Error('connect ECONNREFUSED 10.0.0.1:6379'))
    queueInstances[0]?.emit('error', new Error('Connection is closed.'))
    queueInstances[0]?.endConnection()

    await expect(getQueue('conn-queue-cause', url, 'email')).rejects.toThrow(
      'Failed to connect to Redis (conn-queue-cause): connect ECONNREFUSED 10.0.0.1:6379'
    )
  })

  it('evicts a queue that never connects', async () => {
    const { getQueue } = await importWithResolver()
    const url = 'redis://never-up.example.com:6379'
    const start = Date.now()
    queueConnectError = 'connect ETIMEDOUT'

    await getQueue('conn-queue-never', url, 'email')
    await flushQueueClients()

    expect(queueInstances[0]?.closed).toBe(true)
    await expect(getQueue('conn-queue-never', url, 'email')).rejects.toThrow('connect ETIMEDOUT')

    setSystemTime(new Date(start + 5_000))
    await getQueue('conn-queue-never', url, 'email')
    expect(queueInstances).toHaveLength(2)
  })

  it('backs off exponentially while rebuilt queues keep failing', async () => {
    const { getQueue } = await importWithResolver()
    const url = 'redis://still-down.example.com:6379'
    const start = Date.now()

    await getQueue('conn-queue-down', url, 'email')
    await flushQueueClients()
    queueInstances[0]?.endConnection()

    queueConnectError = 'connect ECONNREFUSED 10.0.0.1:6379'
    setSystemTime(new Date(start + 5_000))
    await getQueue('conn-queue-down', url, 'email')
    await flushQueueClients()

    setSystemTime(new Date(start + 14_999))
    await expect(getQueue('conn-queue-down', url, 'email')).rejects.toThrow('ECONNREFUSED')
    expect(queueInstances).toHaveLength(2)

    setSystemTime(new Date(start + 15_000))
    await getQueue('conn-queue-down', url, 'email')
    expect(queueInstances).toHaveLength(3)
  })

  it('counts queues that end in the same outage as one failure', async () => {
    const { getQueue } = await importWithResolver()
    const url = 'redis://many-queues.example.com:6379'
    const start = Date.now()

    for (const name of ['email', 'billing', 'reports', 'webhooks']) {
      await getQueue('conn-queue-many', url, name)
    }
    await flushQueueClients()
    for (const queue of queueInstances) queue.endConnection()

    // Four separate failures would have pushed the window out to 40s.
    setSystemTime(new Date(start + 5_000))
    await getQueue('conn-queue-many', url, 'email')
    expect(queueInstances).toHaveLength(5)
  })

  it('resets the backoff once a rebuilt queue connects', async () => {
    const { getQueue } = await importWithResolver()
    const url = 'redis://recovered.example.com:6379'
    const start = Date.now()

    await getQueue('conn-queue-recovered', url, 'email')
    await flushQueueClients()
    queueInstances[0]?.endConnection()

    setSystemTime(new Date(start + 5_000))
    await getQueue('conn-queue-recovered', url, 'email')
    await flushQueueClients()
    queueInstances[1]?.endConnection()

    // The next outage starts again from the 5s window rather than 10s.
    setSystemTime(new Date(start + 10_000))
    await getQueue('conn-queue-recovered', url, 'email')
    expect(queueInstances).toHaveLength(3)
  })

  it('does not evict a replacement when an evicted queue ends again', async () => {
    const { getQueue } = await importWithResolver()
    const url = 'redis://locked-then-open.example.com:6379'
    const start = Date.now()

    await getQueue('conn-queue-replaced', url, 'email')
    await flushQueueClients()
    queueInstances[0]?.emit('error', new Error('NOAUTH Authentication required.'))

    setSystemTime(new Date(start + 30_000))
    const replacement = await getQueue('conn-queue-replaced', url, 'email')
    await flushQueueClients()
    // The closed queue's client reports 'end' after its replacement is cached.
    queueInstances[0]?.endConnection()

    expect(await getQueue('conn-queue-replaced', url, 'email')).toBe(replacement)
    expect(queueInstances[1]?.closed).toBe(false)
  })
})
