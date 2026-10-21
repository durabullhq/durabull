import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import { hc, type InferResponseType } from 'hono/client'

const redis = { sscan: mock(), hscan: mock(), zscan: mock() }
const getJobState = mock(async (id: string) => (id === 'gone' ? 'unknown' : 'failed'))
const job = {
  parentKey: 'bull:dev:root:parent',
  getState: mock(async () => 'waiting-children'),
  getDependenciesCount: mock(async () => ({ unprocessed: 2, processed: 3, failed: 1, ignored: 1 })),
}
const getJob = mock(async () => job as typeof job | null)
const getQueue = mock(async (_id: string, _url: string, name: string) => ({
  opts: { prefix: 'bull:dev' },
  toKey: (id: string) => `bull:dev:${name}:${id}`,
  client: Promise.resolve(redis),
  getJob,
  getJobState,
}))

mock.module('../lib/redis', () => ({ getQueue }))
mock.module('../lib/connection-options', () => ({ getConnectionRedisOptions: () => ({}) }))
const { default: routes } = await import('./job-dependencies')
const client = hc<typeof routes>('http://localhost')
type Dependencies = InferResponseType<
  (typeof client)[':queueName']['jobs'][':jobId']['dependencies']['$get'],
  200
>
const app = new Hono()
  .use('*', async (c, next) => {
    c.set('connectionId', 'test-connection')
    c.set('connectionUrl', 'redis://localhost:6379')
    c.set('connectionPrefix', 'bull:dev')
    await next()
  })
  .route('/', routes)

describe('job dependencies', () => {
  beforeEach(() => {
    getJob.mockClear()
    getJob.mockImplementation(async () => job)
    getQueue.mockClear()
    getJobState.mockClear()
    redis.sscan.mockReset()
    redis.hscan.mockReset()
    redis.zscan.mockReset()
    redis.sscan.mockResolvedValue(['0', ['bull:dev:child:repeat:key:123', 'bull:dev:child:gone']])
    job.parentKey = 'bull:dev:root:parent'
  })

  it('returns parent and child states, counts, and removed references without loading child payloads', async () => {
    const res = await app.request('/parents/jobs/one/dependencies')
    expect(res.status).toBe(200)
    const data = (await res.json()) as Dependencies
    expect(data.parent).toEqual({
      key: job.parentKey,
      queueName: 'root',
      jobId: 'parent',
      status: 'failed',
    })
    expect(data.children).toEqual([
      {
        key: 'bull:dev:child:repeat:key:123',
        queueName: 'child',
        jobId: 'repeat:key:123',
        status: 'failed',
      },
      { key: 'bull:dev:child:gone', queueName: 'child', jobId: 'gone', status: 'unknown' },
    ])
    expect(data.counts).toEqual({ unprocessed: 2, processed: 3, failed: 1, ignored: 1 })
    expect(data.nextCursor).toBeNull()
    expect(getJob).toHaveBeenCalledTimes(1)
    expect(redis.sscan).toHaveBeenCalledWith('bull:dev:parents:one:dependencies', '0', 'COUNT', 20)
  })

  it('preserves large Redis cursors and scan overflow without dropping children', async () => {
    const cursor = '18446744073709551615'
    redis.sscan.mockResolvedValue([cursor, ['bull:dev:child:a', 'bull:dev:child:b']])
    const res = await app.request(`/parents/jobs/one/dependencies?cursor=${cursor}&pageSize=1`)
    const data = (await res.json()) as Dependencies
    expect(data.nextCursor).toBe(cursor)
    expect(data.children).toHaveLength(2)
    expect(redis.sscan).toHaveBeenCalledWith(
      'bull:dev:parents:one:dependencies',
      cursor,
      'COUNT',
      1
    )
  })

  it.each([
    ['processed', 'processed', 'hscan'],
    ['ignored', 'failed', 'hscan'],
    ['failed', 'unsuccessful', 'zscan'],
  ] as const)('reads %s children without exposing stored result values', async (kind, suffix, method) => {
    redis[method].mockResolvedValue(['0', ['bull:dev:child:one', 'private-result']])
    const res = await app.request(`/parents/jobs/one/dependencies?kind=${kind}`)
    const data = (await res.json()) as Dependencies
    expect(data.children).toHaveLength(1)
    expect(JSON.stringify(data)).not.toContain('private-result')
    expect(redis[method]).toHaveBeenCalledWith(`bull:dev:parents:one:${suffix}`, '0', 'COUNT', 20)
    expect(redis.sscan).not.toHaveBeenCalled()
  })

  it('does not resolve references outside the configured prefix', async () => {
    job.parentKey = 'other:root:one'
    redis.sscan.mockResolvedValue(['0', ['bull:prod:child:one']])
    const data = (await (
      await app.request('/parents/jobs/one/dependencies')
    ).json()) as Dependencies
    expect(data.parent?.status).toBe('outside-connection')
    expect(data.children[0].queueName).toBeNull()
    expect(getJobState).not.toHaveBeenCalled()
    expect(getQueue).toHaveBeenCalledTimes(1)
  })

  it('returns 404 for a missing job without scanning', async () => {
    getJob.mockResolvedValue(null)
    const res = await app.request('/parents/jobs/missing/dependencies')
    expect(res.status).toBe(404)
    expect(redis.sscan).not.toHaveBeenCalled()
  })

  it.each([
    'cursor=abc',
    'cursor=-1',
    'cursor=1.5',
    'cursor=18446744073709551616',
    'pageSize=0',
    'pageSize=101',
    'kind=all',
  ])('rejects invalid input %s before accessing Redis', async (query) => {
    const res = await app.request(`/parents/jobs/one/dependencies?${query}`)
    expect(res.status).toBe(400)
    expect(getQueue).not.toHaveBeenCalled()
  })
})
