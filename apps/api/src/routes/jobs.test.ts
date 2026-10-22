import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'

const TEST_CONNECTION_ID = '11111111-1111-4111-8111-111111111111'

type FakeJob = {
  getState: ReturnType<typeof mock>
  updateData: ReturnType<typeof mock>
  retry: ReturnType<typeof mock>
}

type StoredJob = { id: string; name: string; data: unknown; state: string }

let fakeJob: FakeJob | null
let getJobMock: ReturnType<typeof mock>
let callOrder: string[]
let fakeQueue: ReturnType<typeof createFakeQueue> | null

function createFakeQueue(storedJobs: StoredJob[]) {
  const jobsById = new Map(storedJobs.map((job) => [job.id, job]))
  const jobsInTypes = (types: string[]) =>
    Array.from(jobsById.values()).filter((job) => types.includes(job.state))

  return {
    jobsById,
    getJob: mock(async (id: string) => {
      const stored = jobsById.get(id)
      if (!stored) return undefined
      return {
        id: stored.id,
        name: stored.name,
        data: stored.data,
        getState: async () => stored.state,
        retry: async () => {
          stored.state = 'waiting'
        },
        promote: async () => {
          stored.state = 'waiting'
        },
        remove: async () => {
          jobsById.delete(stored.id)
        },
      }
    }),
    getRanges: mock(async (types: string[], start: number, end: number) =>
      jobsInTypes(types)
        .slice(start, end + 1)
        .map((job) => job.id)
    ),
    getJobCountByTypes: mock(async (...types: string[]) => jobsInTypes(types).length),
    removeJobScheduler: mock(async () => true),
  }
}

function postJson(app: Hono, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

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
    fakeQueue = null

    mock.module('../lib/connection-options', () => ({
      getConnectionRedisOptions: () => ({}),
    }))
    mock.module('../lib/redis', () => ({
      getQueue: mock(async () => fakeQueue ?? { getJob: getJobMock }),
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
})

describe('bulk job actions with a filter', () => {
  beforeEach(() => {
    mock.module('../lib/connection-options', () => ({
      getConnectionRedisOptions: () => ({}),
    }))
    mock.module('../lib/redis', () => ({
      getQueue: mock(async () => fakeQueue),
    }))
  })

  it('counts with the state totals when the filter has no search', async () => {
    fakeQueue = createFakeQueue([
      { id: '1', name: 'send-email', data: {}, state: 'failed' },
      { id: '2', name: 'send-email', data: {}, state: 'waiting' },
    ])
    const app = await createJobsRouteApp()

    const res = await postJson(app, '/emails/jobs/count', { status: 'failed' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ total: 1 })
    expect(fakeQueue.getRanges).not.toHaveBeenCalled()
  })

  it('counts every job that matches name and data across several batches', async () => {
    const storedJobs = Array.from({ length: 2500 }, (_, index) => ({
      id: String(index),
      name: index % 2 === 0 ? 'send-email' : 'resize-image',
      data: { tenant: index % 5 === 0 ? 'acme' : 'globex' },
      state: 'failed',
    }))
    fakeQueue = createFakeQueue(storedJobs)
    const app = await createJobsRouteApp()

    const res = await postJson(app, '/emails/jobs/count', {
      status: 'failed',
      name: 'EMAIL',
      data: 'acme',
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ total: 250 })
    const rangeSizes = fakeQueue.getRanges.mock.calls.map(
      ([, start, end]) => (end as number) - (start as number) + 1
    )
    expect(rangeSizes.every((size) => size <= 1000)).toBe(true)
    expect(fakeQueue.getRanges).toHaveBeenCalledTimes(3)
  })

  it('leaves out scheduled job instances when hideScheduled is set', async () => {
    fakeQueue = createFakeQueue([
      { id: 'repeat:daily:1700000000000', name: 'report', data: {}, state: 'delayed' },
      { id: 'job-1', name: 'report', data: {}, state: 'delayed' },
    ])
    const app = await createJobsRouteApp()

    const res = await postJson(app, '/emails/jobs/count', { hideScheduled: true })

    expect(await res.json()).toEqual({ total: 1 })
  })

  it('matches only the exact job when the job ID filter names an existing job', async () => {
    fakeQueue = createFakeQueue([
      { id: '1', name: 'a', data: {}, state: 'failed' },
      { id: '10', name: 'a', data: {}, state: 'failed' },
      { id: '11', name: 'a', data: {}, state: 'failed' },
    ])
    const app = await createJobsRouteApp()

    const exactRes = await postJson(app, '/emails/jobs/count', { jobId: '1' })
    const substringRes = await postJson(app, '/emails/jobs/count', { jobId: '1', name: 'b' })

    expect(await exactRes.json()).toEqual({ total: 1 })
    expect(await substringRes.json()).toEqual({ total: 0 })
  })

  it('removes every matching job, also jobs that are not loaded in the table', async () => {
    const storedJobs = Array.from({ length: 1200 }, (_, index) => ({
      id: `job-${index}`,
      name: index < 1100 ? 'send-email' : 'resize-image',
      data: {},
      state: 'waiting',
    }))
    fakeQueue = createFakeQueue(storedJobs)
    const app = await createJobsRouteApp()

    const res = await postJson(app, '/emails/jobs/remove', { filter: { name: 'send-email' } })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: 1100, failed: 0, errors: [] })
    expect(fakeQueue.jobsById.size).toBe(100)
    expect(
      Array.from(fakeQueue.jobsById.values()).every((job) => job.name === 'resize-image')
    ).toBe(true)
  })

  it('retries only the failed jobs that match the filter', async () => {
    fakeQueue = createFakeQueue([
      { id: '1', name: 'send-email', data: {}, state: 'failed' },
      { id: '2', name: 'send-email', data: {}, state: 'failed' },
      { id: '3', name: 'resize-image', data: {}, state: 'failed' },
      { id: '4', name: 'send-email', data: {}, state: 'completed' },
    ])
    const app = await createJobsRouteApp()

    const res = await postJson(app, '/emails/jobs/retry', {
      filter: { status: 'failed', name: 'send-email' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: 2, failed: 0, errors: [] })
    expect(fakeQueue.jobsById.get('1')?.state).toBe('waiting')
    expect(fakeQueue.jobsById.get('2')?.state).toBe('waiting')
    expect(fakeQueue.jobsById.get('3')?.state).toBe('failed')
    expect(fakeQueue.jobsById.get('4')?.state).toBe('completed')
  })

  it('invokes every delayed job that matches the filter', async () => {
    fakeQueue = createFakeQueue([
      { id: '1', name: 'send-email', data: {}, state: 'delayed' },
      { id: '2', name: 'resize-image', data: {}, state: 'delayed' },
    ])
    const app = await createJobsRouteApp()

    const res = await postJson(app, '/emails/jobs/invoke', {
      filter: { status: 'delayed', name: 'send-email' },
    })

    expect(await res.json()).toEqual({ success: 1, failed: 0, errors: [] })
    expect(fakeQueue.jobsById.get('1')?.state).toBe('waiting')
    expect(fakeQueue.jobsById.get('2')?.state).toBe('delayed')
  })

  it('reports every failure but returns at most 100 errors', async () => {
    const storedJobs = Array.from({ length: 150 }, (_, index) => ({
      id: `job-${index}`,
      name: 'report',
      data: {},
      state: 'completed',
    }))
    fakeQueue = createFakeQueue(storedJobs)
    fakeQueue.getJob = mock(async (id: string) => ({
      id,
      getState: async () => 'completed',
      remove: async () => {
        throw new Error('Permission denied')
      },
    })) as unknown as typeof fakeQueue.getJob
    const app = await createJobsRouteApp()

    const res = await postJson(app, '/emails/jobs/remove', { filter: { status: 'completed' } })

    expect(res.status).toBe(409)
    const body = (await res.json()) as { failed: number; errors: unknown[] }
    expect(body.failed).toBe(150)
    expect(body.errors).toHaveLength(100)
  })

  it('rejects a request that sends both jobIds and a filter', async () => {
    fakeQueue = createFakeQueue([])
    const app = await createJobsRouteApp()

    const removeRes = await postJson(app, '/emails/jobs/remove', { jobIds: ['1'], filter: {} })
    const invokeRes = await postJson(app, '/emails/jobs/invoke', {})
    const retryRes = await postJson(app, '/emails/jobs/retry', {
      statuses: ['failed'],
      filter: {},
    })

    expect(removeRes.status).toBe(400)
    expect(invokeRes.status).toBe(400)
    expect(retryRes.status).toBe(400)
  })
})
