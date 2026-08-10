import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'

const TEST_CONNECTION_ID = '11111111-1111-4111-8111-111111111111'

type FakeJob = {
  getState: ReturnType<typeof mock>
  updateData: ReturnType<typeof mock>
  retry: ReturnType<typeof mock>
}

let fakeJob: FakeJob | null
let getJobMock: ReturnType<typeof mock>
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

    mock.module('../lib/connection-options', () => ({
      getConnectionRedisOptions: () => ({}),
    }))
    mock.module('../lib/redis', () => ({
      getQueue: mock(async () => ({
        getJob: getJobMock,
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
    getJobMock = mock(async () => fakeJob)
    mock.module('../lib/redis', () => ({
      getQueue: mock(async () => ({
        getJob: getJobMock,
      })),
    }))

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

  it('retry with jobData and one jobIds entry calls updateData before retry', async () => {
    const app = await createJobsRouteApp()
    const payload = { rewritten: true }

    const res = await app.request('/emails/jobs/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: ['job-1'], jobData: payload }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: 1, failed: 0, errors: [] })
    expect(fakeJob?.updateData).toHaveBeenCalledTimes(1)
    expect(fakeJob?.updateData.mock.calls[0]?.[0]).toEqual(payload)
    expect(fakeJob?.retry).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['updateData', 'retry'])
  })

  it('retry does not requeue the job when the payload rewrite fails', async () => {
    fakeJob = {
      getState: mock(async () => 'failed'),
      updateData: mock(async () => {
        throw new Error('redis write failed')
      }),
      retry: mock(async () => {
        callOrder.push('retry')
      }),
    }
    getJobMock = mock(async () => fakeJob)
    mock.module('../lib/redis', () => ({
      getQueue: mock(async () => ({
        getJob: getJobMock,
      })),
    }))

    const app = await createJobsRouteApp()

    const res = await app.request('/emails/jobs/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: ['job-1'], jobData: { rewritten: true } }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: number
      failed: number
      errors: Array<{ jobId: string; error: string }>
    }
    expect(body.success).toBe(0)
    expect(body.failed).toBe(1)
    expect(body.errors[0]?.jobId).toBe('job-1')
    expect(body.errors[0]?.error).toContain('redis write failed')
    expect(fakeJob.retry).not.toHaveBeenCalled()
    expect(callOrder).toEqual([])
  })

  it('retry rejects jobData combined with statuses', async () => {
    const app = await createJobsRouteApp()

    const res = await app.request('/emails/jobs/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statuses: ['failed'], jobData: { x: 1 } }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(JSON.stringify(body)).toContain(
      'jobData can only be supplied when retrying a single job'
    )
    expect(fakeJob?.updateData).not.toHaveBeenCalled()
    expect(fakeJob?.retry).not.toHaveBeenCalled()
  })

  it('retry rejects jobData with two jobIds', async () => {
    const app = await createJobsRouteApp()

    const res = await app.request('/emails/jobs/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: ['job-1', 'job-2'], jobData: { x: 1 } }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(JSON.stringify(body)).toContain(
      'jobData can only be supplied when retrying a single job'
    )
    expect(fakeJob?.updateData).not.toHaveBeenCalled()
    expect(fakeJob?.retry).not.toHaveBeenCalled()
  })

  it('retry without jobData never calls updateData', async () => {
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
