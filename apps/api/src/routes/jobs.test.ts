import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'

const TEST_CONNECTION_ID = '11111111-1111-4111-8111-111111111111'

type FakeJob = {
  getState: ReturnType<typeof mock>
  updateData: ReturnType<typeof mock>
  retry: ReturnType<typeof mock>
}

type ListedJob = {
  id: string
  name: string
  attemptsMade: number
  timestamp: number
  finishedOn?: number
  data: Record<string, unknown>
  opts: Record<string, unknown>
}

let fakeJob: FakeJob | null
let getJobMock: ReturnType<typeof mock>
let jobsByState: Record<string, ListedJob[]>
let callOrder: string[]

async function createJobsRouteApp() {
  const { default: jobsRoutes } = await import('./jobs')

  return new Hono()
    .use('*', async (c, next) => {
      c.set('connectionId', TEST_CONNECTION_ID)
      c.set('connectionUrl', 'redis://localhost:6379/0')
      c.set('connectionPrefix', 'bull')
      await next()
    })
    .route('/', jobsRoutes)
}

describe('jobs routes', () => {
  beforeEach(() => {
    callOrder = []
    fakeJob = {
      getState: mock(async () => 'failed'),
      updateData: mock(async () => {
        callOrder.push('updateData')
      }),
      retry: mock(async () => {
        callOrder.push('retry')
      }),
    }
    getJobMock = mock(async () => fakeJob)
    jobsByState = {}

    mock.module('../lib/connection-options', () => ({
      getConnectionRedisOptions: () => ({}),
    }))
    mock.module('../lib/redis', () => ({
      getQueue: mock(async () => ({
        getJob: getJobMock,
        getJobs: mock(async ([state]: string[]) => jobsByState[state] ?? []),
      })),
    }))
  })

  it('update-data succeeds on a failed job and calls updateData with the parsed payload', async () => {
    const app = await createJobsRouteApp()
    const payload = { message: 'rewritten', nested: { ok: true } }

    const res = await app.request('/emails/jobs/job-1/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: payload }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, state: 'failed' })
    expect(fakeJob?.updateData).toHaveBeenCalledTimes(1)
    expect(fakeJob?.updateData.mock.calls[0]?.[0]).toEqual(payload)
  })

  it('update-data returns 404 when the job is missing', async () => {
    fakeJob = null
    const app = await createJobsRouteApp()

    const res = await app.request('/emails/jobs/missing/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { ok: true } }),
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Job not found' })
  })

  it('update-data returns 409 and does not call updateData when the job is active', async () => {
    fakeJob = {
      getState: mock(async () => 'active'),
      updateData: mock(async () => {
        callOrder.push('updateData')
      }),
      retry: mock(async () => {
        callOrder.push('retry')
      }),
    }
    const app = await createJobsRouteApp()

    const res = await app.request('/emails/jobs/job-1/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { ok: true } }),
    })

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string; state: string }
    expect(body.state).toBe('active')
    expect(typeof body.error).toBe('string')
    expect(body.error).toContain('active')
    expect(fakeJob.updateData).not.toHaveBeenCalled()
  })

  it('update-data rejects a body with no data key', async () => {
    const app = await createJobsRouteApp()

    const res = await app.request('/emails/jobs/job-1/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(JSON.stringify(body)).toContain('data is required')
  })

  it('update-data accepts a non-object payload such as an array', async () => {
    const app = await createJobsRouteApp()
    const payload = [1, 'two', { three: true }]

    const res = await app.request('/emails/jobs/job-1/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: payload }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, state: 'failed' })
    expect(fakeJob?.updateData.mock.calls[0]?.[0]).toEqual(payload)
  })

  it('update-data accepts an explicit null payload', async () => {
    const app = await createJobsRouteApp()

    const res = await app.request('/emails/jobs/job-1/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: null }),
    })

    expect(res.status).toBe(200)
    expect(fakeJob?.updateData).toHaveBeenCalledTimes(1)
    expect(fakeJob?.updateData.mock.calls[0]?.[0]).toBeNull()
  })

  it('single-job retry updates data before retrying', async () => {
    const app = await createJobsRouteApp()
    const payload = { rewritten: true }

    const res = await app.request('/emails/jobs/job-1/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: payload }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(fakeJob?.updateData).toHaveBeenCalledTimes(1)
    expect(fakeJob?.updateData.mock.calls[0]?.[0]).toEqual(payload)
    expect(fakeJob?.retry).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['updateData', 'retry'])
  })

  it('single-job retry preserves an explicit null replacement', async () => {
    const app = await createJobsRouteApp()

    const res = await app.request('/emails/jobs/job-1/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: null }),
    })

    expect(res.status).toBe(200)
    expect(fakeJob?.updateData.mock.calls[0]?.[0]).toBeNull()
    expect(callOrder).toEqual(['updateData', 'retry'])
  })

  it('single-job retry returns 404 when the job is missing', async () => {
    fakeJob = null
    const app = await createJobsRouteApp()

    const res = await app.request('/emails/jobs/missing/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Job not found' })
  })

  it('single-job retry does not requeue when the payload rewrite fails', async () => {
    fakeJob = {
      getState: mock(async () => 'failed'),
      updateData: mock(async () => {
        throw new Error('redis write failed')
      }),
      retry: mock(async () => {
        callOrder.push('retry')
      }),
    }
    const app = await createJobsRouteApp()

    const res = await app.request('/emails/jobs/job-1/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { rewritten: true } }),
    })

    expect(res.status).toBe(500)
    expect(fakeJob.retry).not.toHaveBeenCalled()
    expect(callOrder).toEqual([])
  })

  it('single-job retry rejects a job that is no longer failed', async () => {
    fakeJob = {
      getState: mock(async () => 'completed'),
      updateData: mock(async () => {
        callOrder.push('updateData')
      }),
      retry: mock(async () => {
        callOrder.push('retry')
      }),
    }
    const app = await createJobsRouteApp()

    const res = await app.request('/emails/jobs/job-1/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { rewritten: true } }),
    })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'Only failed jobs can be retried',
      state: 'completed',
    })
    expect(fakeJob?.updateData).not.toHaveBeenCalled()
    expect(fakeJob?.retry).not.toHaveBeenCalled()
  })

  it('single-job retry without data never calls updateData', async () => {
    const app = await createJobsRouteApp()

    const res = await app.request('/emails/jobs/job-1/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(fakeJob?.updateData).not.toHaveBeenCalled()
    expect(fakeJob?.retry).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['retry'])
  })

  it('bulk retry remains data-agnostic', async () => {
    const app = await createJobsRouteApp()

    const res = await app.request('/emails/jobs/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: ['job-1'] }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: 1, failed: 0, errors: [] })
    expect(fakeJob?.updateData).not.toHaveBeenCalled()
    expect(fakeJob?.retry).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['retry'])
  })

  describe('list sorting', () => {
    const listedJob = (job: Partial<ListedJob> & { id: string }): ListedJob => ({
      name: 'send-email',
      attemptsMade: 0,
      timestamp: 0,
      data: {},
      opts: {},
      ...job,
    })

    const listJobIds = async (query: string) => {
      const app = await createJobsRouteApp()
      const res = await app.request(`/emails/jobs?${query}`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { jobs: Array<{ id: string }> }
      return body.jobs.map((job) => job.id)
    }

    it('sorts jobs from every state by attempts in both directions', async () => {
      jobsByState = {
        waiting: [listedJob({ id: '1', attemptsMade: 0 })],
        failed: [listedJob({ id: '2', attemptsMade: 3 }), listedJob({ id: '3', attemptsMade: 1 })],
      }

      expect(await listJobIds('sortBy=attempts&sortOrder=asc')).toEqual(['1', '3', '2'])
      expect(await listJobIds('sortBy=attempts&sortOrder=desc')).toEqual(['2', '3', '1'])
    })

    it('sorts numeric job ids by value, not as text', async () => {
      jobsByState = {
        completed: [listedJob({ id: '10' }), listedJob({ id: '9' }), listedJob({ id: '100' })],
      }

      expect(await listJobIds('sortBy=id&sortOrder=asc')).toEqual(['9', '10', '100'])
    })

    it('keeps unfinished jobs last when sorting by finished time', async () => {
      jobsByState = {
        waiting: [listedJob({ id: 'pending' })],
        completed: [
          listedJob({ id: 'early', finishedOn: 1_000 }),
          listedJob({ id: 'late', finishedOn: 2_000 }),
        ],
      }

      expect(await listJobIds('sortBy=finished&sortOrder=asc')).toEqual([
        'early',
        'late',
        'pending',
      ])
      expect(await listJobIds('sortBy=finished&sortOrder=desc')).toEqual([
        'late',
        'early',
        'pending',
      ])
    })

    it('sorts by created time inside a status filter', async () => {
      jobsByState = {
        failed: [
          listedJob({ id: 'a', timestamp: 3_000 }),
          listedJob({ id: 'b', timestamp: 1_000 }),
          listedJob({ id: 'c', timestamp: 2_000 }),
        ],
        completed: [listedJob({ id: 'other', timestamp: 0 })],
      }

      expect(await listJobIds('status=failed&sortBy=created&sortOrder=desc')).toEqual([
        'a',
        'c',
        'b',
      ])
    })
  })
})
