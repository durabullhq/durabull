import { type APIResponse, test as base, expect, type Page } from '@playwright/test'

export const test = base
export { expect }

export const TEST_ORG_SLUG = 'acme'
export const TEST_CONNECTION_NAME = 'Acme Production'
export const TEST_QUEUE_NAME = 'payment-processing'

type Connection = {
  id: string
  name: string
  isDefault: boolean
  environment: string
}

type CreateConnectionInput = {
  name: string
  url: string
  environment?: 'development' | 'staging' | 'production'
  isDefault?: boolean
}

type QueueSummary = {
  name: string
}

type JobDetail = {
  id: string
  name: string
  status: string
  data?: Record<string, unknown>
  delay?: number
  stacktraceCount?: number
}

type JobSummary = {
  id: string
  name: string
  status: string
}

type ScheduledJobsResponse = {
  scheduledJobs: Array<{
    queueName: string
    jobName: string
    schedulerId: string
    pattern?: string
    every?: number
  }>
  total: number
}

type AlertDestinationRecord = {
  id: string
  name: string
  type: 'webhook' | 'email' | 'linear'
}

async function apiJson<T>(response: APIResponse, context: string): Promise<T> {
  if (response.ok()) {
    return (await response.json()) as T
  }

  let body = ''
  try {
    body = await response.text()
  } catch {
    body = '<unable to read body>'
  }
  throw new Error(`${context} failed with ${response.status()}: ${body.slice(0, 500)}`)
}

export async function ensureActiveOrg(page: Page, orgSlug = TEST_ORG_SLUG): Promise<void> {
  await page.goto(`/${orgSlug}`)
  await expect(page.getByTestId('org-selector')).toBeVisible({ timeout: 15000 })
  await expect
    .poll(
      async () => {
        const response = await page.request.get('/api/session')
        if (!response.ok()) return null
        const data = (await response.json()) as { session?: { activeOrganizationId?: string } }
        return data.session?.activeOrganizationId ?? null
      },
      { timeout: 15000 }
    )
    .not.toBeNull()
}

export async function getConnections(page: Page): Promise<Connection[]> {
  const response = await page.request.get('/api/connections')
  const data = await apiJson<{ connections: Connection[] }>(response, 'GET /api/connections')
  if (!data.connections || data.connections.length === 0) {
    throw new Error('No connections found. Ensure the seed script ran successfully.')
  }
  return data.connections
}

export async function createConnection(
  page: Page,
  input: CreateConnectionInput
): Promise<Connection> {
  const response = await page.request.post('/api/connections', {
    data: {
      name: input.name,
      url: input.url,
      environment: input.environment ?? 'development',
      isDefault: input.isDefault ?? false,
    },
  })

  const data = await apiJson<{ connection: Connection }>(response, 'POST /api/connections')
  return data.connection
}

export async function deleteConnection(page: Page, connectionId: string): Promise<void> {
  const response = await page.request.delete(`/api/connections/${connectionId}`)
  await apiJson<{ success: boolean }>(response, `DELETE /api/connections/${connectionId}`)
}

export async function getDefaultConnectionId(page: Page): Promise<string> {
  const connections = await getConnections(page)
  const defaultConnection =
    connections.find((connection) => connection.name === TEST_CONNECTION_NAME) ||
    connections.find((connection) => connection.isDefault) ||
    connections[0]

  if (!defaultConnection) {
    throw new Error('Unable to determine a default connection.')
  }

  return defaultConnection.id
}

export async function getQueues(page: Page, connectionId: string): Promise<QueueSummary[]> {
  const response = await page.request.get(`/api/c/${connectionId}/queues?page=1&pageSize=100`)
  const data = await apiJson<{ queues: QueueSummary[] }>(
    response,
    `GET /api/c/${connectionId}/queues`
  )
  return data.queues ?? []
}

async function runQueueDiscovery(page: Page, connectionId: string): Promise<void> {
  const response = await page.request.post(
    `/api/c/${connectionId}/queues/discovery?wait=1&scanCount=2000`
  )
  await apiJson(response, `POST /api/c/${connectionId}/queues/discovery`)
}

export async function getScheduledJobs(
  page: Page,
  connectionId: string
): Promise<ScheduledJobsResponse> {
  const response = await page.request.get(`/api/c/${connectionId}/scheduled-jobs`)
  return apiJson<ScheduledJobsResponse>(response, `GET /api/c/${connectionId}/scheduled-jobs`)
}

export async function getScheduledJobsForQueue(
  page: Page,
  connectionId: string,
  queueName: string
): Promise<ScheduledJobsResponse> {
  const response = await page.request.get(
    `/api/c/${connectionId}/scheduled-jobs/queue/${encodeURIComponent(queueName)}`
  )
  return apiJson<ScheduledJobsResponse>(
    response,
    `GET /api/c/${connectionId}/scheduled-jobs/queue/${queueName}`
  )
}

export async function removeScheduledJob(
  page: Page,
  options: { connectionId: string; queueName: string; schedulerId: string }
): Promise<void> {
  const response = await page.request.delete(
    `/api/c/${options.connectionId}/scheduled-jobs/queue/${encodeURIComponent(options.queueName)}/${encodeURIComponent(options.schedulerId)}`
  )

  await apiJson(
    response,
    `DELETE /api/c/${options.connectionId}/scheduled-jobs/queue/${options.queueName}/${options.schedulerId}`
  )
}

export async function getJobs(
  page: Page,
  connectionId: string,
  queueName: string,
  options?: {
    status?: string
    name?: string
    jobId?: string
    data?: string
    page?: number
    pageSize?: number
  }
): Promise<{ jobs: JobSummary[]; total: number }> {
  const params = new URLSearchParams()
  if (options?.status) params.set('status', options.status)
  if (options?.name) params.set('name', options.name)
  if (options?.jobId) params.set('jobId', options.jobId)
  if (options?.data) params.set('data', options.data)
  params.set('page', String(options?.page ?? 1))
  params.set('pageSize', String(options?.pageSize ?? 20))
  const response = await page.request.get(
    `/api/c/${connectionId}/queues/${queueName}/jobs?${params.toString()}`
  )
  return apiJson<{ jobs: JobSummary[]; total: number }>(
    response,
    `GET /api/c/${connectionId}/queues/${queueName}/jobs`
  )
}

export async function findJobByStatus(
  page: Page,
  connectionId: string,
  status: string
): Promise<{ queueName: string; jobId: string }> {
  const queues = await getQueues(page, connectionId)
  for (const queue of queues) {
    const data = await getJobs(page, connectionId, queue.name, {
      status,
      page: 1,
      pageSize: 1,
    })
    if (data.jobs.length > 0) {
      return { queueName: queue.name, jobId: String(data.jobs[0].id) }
    }
  }
  throw new Error(`No jobs with status "${status}" found in any queue.`)
}

export async function getTestQueueName(page: Page, connectionId: string): Promise<string> {
  let queues = await getQueues(page, connectionId)

  if (queues.length === 0) {
    await runQueueDiscovery(page, connectionId)
    queues = await getQueues(page, connectionId)
  }

  if (queues.length === 0) {
    throw new Error('No queues found. Ensure Redis seed data exists.')
  }

  const match = queues.find((queue) => queue.name === TEST_QUEUE_NAME)
  if (!match) {
    const available = queues.map((queue) => queue.name).join(', ')
    throw new Error(`Expected queue "${TEST_QUEUE_NAME}" not found. Available queues: ${available}`)
  }

  return match.name
}

export async function createJob(
  page: Page,
  options: {
    connectionId: string
    queueName: string
    name: string
    data: unknown
    delay?: number
    priority?: number
    attempts?: number
  }
): Promise<string> {
  const response = await page.request.post(
    `/api/c/${options.connectionId}/queues/${options.queueName}/jobs`,
    {
      data: {
        name: options.name,
        data: options.data,
        delay: options.delay,
        priority: options.priority,
        attempts: options.attempts,
      },
    }
  )

  const data = await apiJson<{ jobId: string | number }>(
    response,
    `POST /api/c/${options.connectionId}/queues/${options.queueName}/jobs`
  )
  return String(data.jobId)
}

export async function getJob(
  page: Page,
  connectionId: string,
  queueName: string,
  jobId: string
): Promise<JobDetail> {
  const response = await page.request.get(
    `/api/c/${connectionId}/queues/${queueName}/jobs/${jobId}`
  )
  return apiJson<JobDetail>(
    response,
    `GET /api/c/${connectionId}/queues/${queueName}/jobs/${jobId}`
  )
}

export async function removeJobs(
  page: Page,
  options: {
    connectionId: string
    queueName: string
    jobIds: string[]
    removeScheduler?: boolean
  }
): Promise<void> {
  if (options.jobIds.length === 0) return

  const response = await page.request.post(
    `/api/c/${options.connectionId}/queues/${options.queueName}/jobs/remove`,
    {
      data: {
        jobIds: options.jobIds,
        removeScheduler: options.removeScheduler ?? false,
      },
    }
  )

  await apiJson(
    response,
    `POST /api/c/${options.connectionId}/queues/${options.queueName}/jobs/remove`
  )
}

export async function purgeQueue(
  page: Page,
  options: {
    connectionId: string
    queueName: string
    statuses?: string[]
    keepMostRecent?: number
  }
): Promise<{ totalRemoved: number }> {
  const response = await page.request.post(
    `/api/c/${options.connectionId}/queues/${encodeURIComponent(options.queueName)}/clean`,
    {
      data: {
        confirmName: options.queueName,
        statuses: options.statuses ?? ['all'],
        keepMostRecent: options.keepMostRecent ?? 0,
      },
    }
  )
  return apiJson<{ totalRemoved: number }>(
    response,
    `POST clean on ${options.connectionId}/${options.queueName}`
  )
}

export async function retryFailedJobs(
  page: Page,
  connectionId: string,
  queueName: string
): Promise<void> {
  const response = await page.request.post(
    `/api/c/${connectionId}/queues/${encodeURIComponent(queueName)}/jobs/retry`,
    { data: { statuses: ['failed'] } }
  )
  await apiJson(response, `POST retry failed jobs on ${queueName}`)
}

export async function getRedisKeySearch(
  page: Page,
  connectionId: string,
  pattern: string,
  options?: { pageSize?: number; excludeBull?: boolean }
): Promise<Array<{ key: string; type: string }>> {
  const params = new URLSearchParams({ pattern })
  if (options?.pageSize) params.set('pageSize', String(options.pageSize))
  if (options?.excludeBull) params.set('excludeBull', 'true')
  const response = await page.request.get(
    `/api/c/${connectionId}/redis-keys/search?${params.toString()}`
  )
  const data = await apiJson<{ keys: Array<{ key: string; type: string }> }>(
    response,
    `GET redis-keys/search ${pattern}`
  )
  return data.keys ?? []
}

export async function setRedisKeyValue(
  page: Page,
  connectionId: string,
  key: string,
  value: unknown
): Promise<void> {
  // The API exposes read/delete only, so tests seed keys through a dedicated
  // e2e prefix using the debug endpoint's underlying Redis client.
  const response = await page.request.post(`/api/c/${connectionId}/queues/debug/seed-key`, {
    data: { key, value },
    failOnStatusCode: false,
  })
  if (response.status() === 404) {
    throw new Error('debug/seed-key endpoint unavailable; seed via tooling/scripts instead')
  }
}

export async function createWebhookDestination(
  page: Page,
  input: { name: string; url: string }
): Promise<AlertDestinationRecord> {
  const response = await page.request.post('/api/alerts/destinations', {
    data: { type: 'webhook', name: input.name, url: input.url },
  })
  const data = await apiJson<{ destination: AlertDestinationRecord }>(
    response,
    'POST /api/alerts/destinations'
  )
  return data.destination
}

export async function deleteDestination(page: Page, destinationId: string): Promise<void> {
  await apiJson(
    await page.request.delete(`/api/alerts/destinations/${destinationId}`),
    `DELETE /api/alerts/destinations/${destinationId}`
  )
}
