import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  alertCheckCursorRepository,
  alertDeliveryRepository,
  alertEventRepository,
  alertRuleRepository,
  alertWebhookDestination,
  alertWebhookDestinationRepository,
  closeDb,
  eq,
  getDb,
  organization,
  redisConnection,
  redisDiscoveredQueue,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { Hono } from 'hono'

const TEST_ORG_ID = 'alert-routes-org'
const TEST_CONNECTION_ID = '55555555-5555-4555-8555-555555555555'

const mutableEnv = env as {
  DATABASE_URL?: string
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

async function seedBaseConnection() {
  const db = await getDb()
  const now = new Date()

  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Alert Routes Org',
    slug: 'alert-routes-org',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(redisConnection).values({
    id: TEST_CONNECTION_ID,
    name: 'Primary Redis',
    url: 'redis://localhost:6379/0',
    environment: 'development',
    isDefault: true,
    organizationId: TEST_ORG_ID,
    createdAt: now,
    updatedAt: now,
  })
}

async function seedDiscoveredQueue(name: string) {
  const db = await getDb()
  const now = new Date()

  await db.insert(redisDiscoveredQueue).values({
    connectionId: TEST_CONNECTION_ID,
    name,
    state: 'confirmed',
    lastDiscoveredAt: now,
    createdAt: now,
    updatedAt: now,
  })
}

async function createAlertsRouteApp() {
  const { default: alertsRoutes } = await import('./alerts')

  return new Hono()
    .use('*', async (c, next) => {
      c.set('connectionId', TEST_CONNECTION_ID)
      c.set('connectionUrl', 'redis://localhost:6379/0')
      c.set('connectionName', 'Primary Redis')
      c.set('organizationId', TEST_ORG_ID)
      await next()
    })
    .route('/', alertsRoutes)
}

function jsonRequest(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

describe('alerts routes', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-alert-routes-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    await closeDb()
    await seedBaseConnection()
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl

    if (originalPgliteDir) {
      process.env.DURABULL_PGLITE_DIR = originalPgliteDir
    } else {
      delete process.env.DURABULL_PGLITE_DIR
    }

    if (tempPgliteDir) {
      await rm(tempPgliteDir, { recursive: true, force: true })
      tempPgliteDir = ''
    }
  })

  it('rejects invalid rule configs on create', async () => {
    const app = await createAlertsRouteApp()

    const response = await app.request(
      '/rules',
      jsonRequest({
        name: 'Failure spike',
        type: 'failure_threshold',
        queueName: 'email-send',
        config: { count: 0, windowMinutes: 5 },
        notificationChannels: [],
        cooldownMinutes: 30,
        enabled: true,
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('Invalid config'),
    })
  })

  it('rejects multiple Linear notification channels', async () => {
    const app = await createAlertsRouteApp()

    const response = await app.request(
      '/rules',
      jsonRequest({
        name: 'Too many Linear routes',
        type: 'job_failed',
        queueName: 'email-send',
        config: { maxIssuesPerPoll: 10 },
        notificationChannels: [
          { type: 'linear', target: 'org-default', teamId: 'team-1' },
          { type: 'linear', target: 'org-default', teamId: 'team-2' },
        ],
        cooldownMinutes: 30,
        enabled: true,
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Only one Linear notification channel is supported per rule.',
    })
  })

  it('rejects saved webhook destinations that do not exist', async () => {
    const app = await createAlertsRouteApp()

    const response = await app.request(
      '/rules',
      jsonRequest({
        name: 'Missing webhook destination',
        type: 'failure_threshold',
        queueName: 'email-send',
        config: { count: 5, windowMinutes: 5 },
        notificationChannels: [
          { type: 'webhook', destinationId: '11111111-1111-4111-8111-111111111111' },
        ],
        cooldownMinutes: 30,
        enabled: true,
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Webhook destination not found.' })
  })

  it('rejects disabled saved webhook destinations', async () => {
    const app = await createAlertsRouteApp()
    const destination = await alertWebhookDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Incident intake',
      url: 'https://example.com/durabull',
      enabled: false,
    })

    const response = await app.request(
      '/rules',
      jsonRequest({
        name: 'Disabled webhook destination',
        type: 'failure_threshold',
        queueName: 'email-send',
        config: { count: 5, windowMinutes: 5 },
        notificationChannels: [{ type: 'webhook', destinationId: destination.id }],
        cooldownMinutes: 30,
        enabled: true,
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Webhook destination "Incident intake" is disabled.',
    })
  })

  it('creates rules with valid saved webhook destinations', async () => {
    const app = await createAlertsRouteApp()
    const destination = await alertWebhookDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Incident intake',
      url: 'https://example.com/durabull',
    })

    const response = await app.request(
      '/rules',
      jsonRequest({
        name: 'Saved webhook destination',
        type: 'failure_threshold',
        queueName: 'email-send',
        config: { count: 5, windowMinutes: 5 },
        notificationChannels: [{ type: 'webhook', destinationId: destination.id }],
        cooldownMinutes: 30,
        enabled: true,
      })
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      rule: {
        notificationChannels: [{ type: 'webhook', destinationId: destination.id }],
      },
    })
  })

  it('rejects saved webhook destinations with unreadable signing secrets', async () => {
    const app = await createAlertsRouteApp()
    const destination = await alertWebhookDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Corrupt secret',
      url: 'https://example.com/durabull',
      signingSecret: 'super-secret-webhook-value',
    })
    const db = await getDb()
    await db
      .update(alertWebhookDestination)
      .set({ encryptedSigningSecret: 'enc:v1:corrupt' })
      .where(eq(alertWebhookDestination.id, destination.id))

    const response = await app.request(
      '/rules',
      jsonRequest({
        name: 'Corrupt saved webhook destination',
        type: 'failure_threshold',
        queueName: 'email-send',
        config: { count: 5, windowMinutes: 5 },
        notificationChannels: [{ type: 'webhook', destinationId: destination.id }],
        cooldownMinutes: 30,
        enabled: true,
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Webhook destination "Corrupt secret" signing secret could not be decrypted.',
    })
  })

  it('rejects webhook channels with both custom URL and saved destination fields', async () => {
    const app = await createAlertsRouteApp()

    const response = await app.request(
      '/rules',
      jsonRequest({
        name: 'Ambiguous webhook channel',
        type: 'failure_threshold',
        queueName: 'email-send',
        config: { count: 5, windowMinutes: 5 },
        notificationChannels: [
          {
            type: 'webhook',
            url: 'https://example.com/durabull',
            destinationId: '11111111-1111-4111-8111-111111111111',
          },
        ],
        cooldownMinutes: 30,
        enabled: true,
      })
    )

    expect(response.status).toBe(400)
  })

  it('rejects duplicate custom webhook URLs on one rule', async () => {
    const app = await createAlertsRouteApp()

    const response = await app.request(
      '/rules',
      jsonRequest({
        name: 'Duplicate custom webhooks',
        type: 'failure_threshold',
        queueName: 'email-send',
        config: { count: 5, windowMinutes: 5 },
        notificationChannels: [
          { type: 'webhook', url: 'https://example.com/durabull' },
          { type: 'webhook', url: 'https://example.com/durabull' },
        ],
        cooldownMinutes: 30,
        enabled: true,
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Duplicate custom webhook URLs are not allowed on the same alert rule.',
    })
  })

  it('rejects duplicate saved webhook destinations on one rule', async () => {
    const app = await createAlertsRouteApp()
    const destination = await alertWebhookDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Incident intake',
      url: 'https://example.com/durabull',
    })

    const response = await app.request(
      '/rules',
      jsonRequest({
        name: 'Duplicate saved webhooks',
        type: 'failure_threshold',
        queueName: 'email-send',
        config: { count: 5, windowMinutes: 5 },
        notificationChannels: [
          { type: 'webhook', destinationId: destination.id },
          { type: 'webhook', destinationId: destination.id },
        ],
        cooldownMinutes: 30,
        enabled: true,
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Duplicate saved webhook destinations are not allowed on the same alert rule.',
    })
  })

  it('rejects the fifty-first rule on a connection', async () => {
    for (let index = 0; index < 50; index += 1) {
      await alertRuleRepository.create({
        organizationId: TEST_ORG_ID,
        connectionId: TEST_CONNECTION_ID,
        queueName: `queue-${index}`,
        name: `Rule ${index}`,
        type: 'failure_threshold',
        config: { count: 5, windowMinutes: 5 },
        cooldownMinutes: 30,
      })
    }

    const app = await createAlertsRouteApp()
    const response = await app.request(
      '/rules',
      jsonRequest({
        name: 'Rule 51',
        type: 'failure_threshold',
        queueName: 'overflow',
        config: { count: 5, windowMinutes: 5 },
        notificationChannels: [],
        cooldownMinutes: 30,
        enabled: true,
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Maximum of 50 alert rules per connection',
    })
  })

  it('resolves active incidents when a rule is muted', async () => {
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Mute me',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    const event = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Incident is firing',
      context: {},
      firedAt: new Date(),
    })

    const app = await createAlertsRouteApp()
    const response = await app.request(`/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })

    expect(response.status).toBe(200)

    const events = await alertEventRepository.findByRule(rule.id, { offset: 0, limit: 10 })
    expect(events).toHaveLength(1)
    expect(events[0]?.id).toBe(event.id)
    expect(events[0]?.status).toBe('resolved')

    const updatedRule = await alertRuleRepository.findById(rule.id, TEST_ORG_ID)
    expect(updatedRule?.enabled).toBe(false)
  })

  it('returns a 400 from the live test endpoint when no queue is available yet', async () => {
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: null,
      name: 'Any queue failures',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    const app = await createAlertsRouteApp()
    const response = await app.request(`/rules/${rule.id}/test`, { method: 'POST' })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'No queue available to test this rule yet',
    })
  })

  it('returns a live evaluation snapshot without persisting a firing event', async () => {
    const getQueueMock = mock(async () => ({
      getJobCounts: async () => ({
        failed: 12,
        waiting: 1,
        active: 0,
        completed: 80,
      }),
      getMetrics: async (metric: string) => ({
        meta: { count: metric === 'failed' ? 12 : 80 },
        data: metric === 'failed' ? [7, 5] : [40, 40],
      }),
    }))
    mock.module('../lib/redis', () => ({
      getQueue: getQueueMock,
    }))

    await seedDiscoveredQueue('email-send')
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: null,
      queueFilterMode: 'exclude',
      filterQueueNames: [],
      name: 'Live test',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })
    await alertCheckCursorRepository.upsert({
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      lastCheckedAt: new Date(Date.now() - 5 * 60_000),
      lastFailedCount: 2,
      lastCompletedCount: 70,
    })

    const app = await createAlertsRouteApp()
    const response = await app.request(`/rules/${rule.id}/test`, { method: 'POST' })

    expect(response.status).toBe(200)
    expect(getQueueMock).toHaveBeenCalledTimes(1)

    const body = (await response.json()) as {
      evaluation: { triggered: boolean; context: { delta: number } }
      snapshot: { queueName: string }
    }
    expect(body.snapshot.queueName).toBe('email-send')
    expect(body.evaluation.triggered).toBe(true)
    expect(body.evaluation.context.delta).toBe(10)

    const events = await alertEventRepository.findByRule(rule.id, { offset: 0, limit: 10 })
    expect(events).toHaveLength(0)
  })

  it('lists connection events and resolves them through the API', async () => {
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Incident history',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    const event = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Needs action',
      context: { jobId: 'job-1' },
      firedAt: new Date(),
    })

    await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Different job',
      context: { jobId: 'job-2' },
      firedAt: new Date(),
    })

    const app = await createAlertsRouteApp()

    const listResponse = await app.request('/events?status=firing')
    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toMatchObject({
      events: [
        expect.objectContaining({ status: 'firing' }),
        expect.objectContaining({ status: 'firing' }),
      ],
    })

    const filteredResponse = await app.request(
      '/events?status=firing&queueName=email-send&jobId=job-1'
    )
    expect(filteredResponse.status).toBe(200)
    const filteredBody = (await filteredResponse.json()) as { events: unknown[] }
    expect(filteredBody.events).toHaveLength(1)
    expect(filteredBody.events[0]).toMatchObject({ id: event.id, status: 'firing' })

    const resolveResponse = await app.request(`/events/${event.id}/resolve`, { method: 'POST' })
    expect(resolveResponse.status).toBe(200)
    expect(await resolveResponse.json()).toMatchObject({
      event: expect.objectContaining({ id: event.id, status: 'resolved' }),
    })
  })

  it('retries a failed delivery and re-attempts it through the API', async () => {
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Retryable incident',
      type: 'job_failed',
      config: { maxIssuesPerPoll: 10 },
      notificationChannels: [{ type: 'linear', target: 'org-default', teamId: 'INTAKE' }],
      cooldownMinutes: 30,
    })

    const event = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Linear delivery failed',
      context: { jobId: 'job-1' },
      firedAt: new Date(),
    })

    await alertDeliveryRepository.enqueueMany([
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'linear',
        target: 'org-default:INTAKE',
        providerMetadata: { type: 'linear', target: 'org-default', teamId: 'INTAKE' },
      },
    ])

    const [claimed] = await alertDeliveryRepository.claimDueForEvent(event.id)
    expect(claimed).toBeDefined()
    await alertDeliveryRepository.markFailed(claimed.id, {
      error: 'Linear integration is not configured for this organization.',
      retryable: false,
      expectedClaimedAt: claimed.claimedAt as Date,
    })

    const app = await createAlertsRouteApp()
    const response = await app.request(`/events/${event.id}/deliveries/${claimed.id}/retry`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      event: { deliveries: Array<{ id: string; status: string; attemptCount: number }> }
    }
    const delivery = body.event.deliveries.find((entry) => entry.id === claimed.id)
    expect(delivery?.status).toBe('failed')
    expect(delivery?.attemptCount).toBe(2)
  })

  it('retries only the targeted delivery when other deliveries are also due', async () => {
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Multi-channel incident',
      type: 'job_failed',
      config: { maxIssuesPerPoll: 10 },
      notificationChannels: [
        { type: 'email', target: 'ops@example.com' },
        { type: 'linear', target: 'org-default', teamId: 'INTAKE' },
      ],
      cooldownMinutes: 30,
    })

    const event = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'One channel failed',
      context: { jobId: 'job-1' },
      firedAt: new Date(),
    })

    const [emailDelivery, linearDelivery] = await alertDeliveryRepository.enqueueMany([
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'email',
        target: 'ops@example.com',
      },
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'linear',
        target: 'org-default:INTAKE',
        providerMetadata: { type: 'linear', target: 'org-default', teamId: 'INTAKE' },
      },
    ])

    const [claimedLinear] = await alertDeliveryRepository.claimById(linearDelivery!.id, event.id)
    await alertDeliveryRepository.markFailed(claimedLinear!.id, {
      error: 'Linear integration is not configured for this organization.',
      retryable: false,
      expectedClaimedAt: claimedLinear!.claimedAt as Date,
    })

    const app = await createAlertsRouteApp()
    const response = await app.request(
      `/events/${event.id}/deliveries/${linearDelivery!.id}/retry`,
      { method: 'POST' }
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      event: { deliveries: Array<{ id: string; status: string; attemptCount: number }> }
    }
    const retried = body.event.deliveries.find((entry) => entry.id === linearDelivery!.id)
    const untouched = body.event.deliveries.find((entry) => entry.id === emailDelivery!.id)

    expect(retried?.status).toBe('failed')
    expect(retried?.attemptCount).toBe(2)
    expect(untouched?.status).toBe('pending')
    expect(untouched?.attemptCount).toBe(0)
  })

  it('returns 404 when retrying a delivery that is not in a retryable state', async () => {
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Pending delivery',
      type: 'job_failed',
      config: { maxIssuesPerPoll: 10 },
      notificationChannels: [{ type: 'linear', target: 'org-default', teamId: 'INTAKE' }],
      cooldownMinutes: 30,
    })

    const event = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Pending linear delivery',
      context: {},
      firedAt: new Date(),
    })

    const [pending] = await alertDeliveryRepository.enqueueMany([
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'linear',
        target: 'org-default:INTAKE',
        providerMetadata: { type: 'linear', target: 'org-default', teamId: 'INTAKE' },
      },
    ])

    const app = await createAlertsRouteApp()
    const response = await app.request(`/events/${event.id}/deliveries/${pending.id}/retry`, {
      method: 'POST',
    })

    expect(response.status).toBe(404)
  })

  it('rejects webhook URLs that target private networks', async () => {
    const app = await createAlertsRouteApp()

    const response = await app.request(
      '/rules',
      jsonRequest({
        name: 'Webhook SSRF guard',
        type: 'job_failed',
        queueName: 'email-send',
        config: { maxIssuesPerPoll: 10 },
        notificationChannels: [{ type: 'webhook', url: 'https://127.0.0.1/hook' }],
        cooldownMinutes: 30,
        enabled: true,
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('private or local IP'),
    })
  })

  it('masks webhook secrets when returning alert rules', async () => {
    const app = await createAlertsRouteApp()

    const createResponse = await app.request(
      '/rules',
      jsonRequest({
        name: 'Webhook secret masking',
        type: 'job_failed',
        queueName: 'email-send',
        config: { maxIssuesPerPoll: 10 },
        notificationChannels: [
          {
            type: 'webhook',
            url: 'https://example.com/hook',
            secret: 'abcdefghijklmnop',
          },
        ],
        cooldownMinutes: 30,
        enabled: true,
      })
    )

    expect(createResponse.status).toBe(201)
    const createBody = (await createResponse.json()) as {
      rule: { notificationChannels: Array<Record<string, unknown>> }
    }
    expect(createBody.rule.notificationChannels[0]).toEqual({
      type: 'webhook',
      url: 'https://example.com/hook',
      secretConfigured: true,
      secretLast4: 'mnop',
    })

    const listResponse = await app.request('/rules')
    const listBody = (await listResponse.json()) as {
      rules: Array<{ notificationChannels: Array<Record<string, unknown>> }>
    }
    expect(listBody.rules[0]?.notificationChannels[0]).toEqual({
      type: 'webhook',
      url: 'https://example.com/hook',
      secretConfigured: true,
      secretLast4: 'mnop',
    })
  })

  it('masks webhook secrets in event delivery metadata', async () => {
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Webhook delivery masking',
      type: 'job_failed',
      config: { maxIssuesPerPoll: 10 },
      notificationChannels: [
        {
          type: 'webhook',
          url: 'https://example.com/hook',
          secret: 'abcdefghijklmnop',
        },
      ],
      cooldownMinutes: 30,
    })

    const event = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Webhook delivery test',
      context: {},
      firedAt: new Date(),
    })

    await alertDeliveryRepository.enqueueMany([
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'webhook',
        target: 'https://example.com/hook',
        providerMetadata: {
          type: 'webhook',
          url: 'https://example.com/hook',
          secret: 'abcdefghijklmnop',
          httpStatus: 503,
        },
      },
    ])

    const app = await createAlertsRouteApp()
    const response = await app.request('/events?status=firing')
    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      events: Array<{
        deliveries: Array<{ providerMetadata?: Record<string, unknown> }>
      }>
    }
    const delivery = body.events.find((entry) => entry.deliveries.length > 0)?.deliveries[0]
    expect(delivery?.providerMetadata).toEqual({
      type: 'webhook',
      url: 'https://example.com/hook',
      httpStatus: 503,
      secretConfigured: true,
      secretLast4: 'mnop',
    })
    expect(delivery?.providerMetadata?.secret).toBeUndefined()
  })

  it('snoozes and unsnoozes a rule without touching its open incidents', async () => {
    const app = await createAlertsRouteApp()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Failure threshold',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })
    const event = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Open incident',
      firedAt: new Date(),
    })

    const snoozeResponse = await app.request(
      `/rules/${rule.id}/snooze`,
      jsonRequest({ minutes: 60 })
    )
    expect(snoozeResponse.status).toBe(200)
    const snoozed = (await snoozeResponse.json()) as {
      rule: { state: string; mutedUntil: string | null }
    }
    expect(snoozed.rule.state).toBe('snoozed')
    expect(new Date(snoozed.rule.mutedUntil ?? 0).getTime()).toBeGreaterThan(Date.now())

    // Snooze must not resolve open incidents (unlike disabling the rule).
    const stillFiring = await alertEventRepository.findById(event.id, TEST_ORG_ID)
    expect(stillFiring?.status).toBe('firing')

    const unsnoozeResponse = await app.request(`/rules/${rule.id}/snooze`, { method: 'DELETE' })
    expect(unsnoozeResponse.status).toBe(200)
    const unsnoozed = (await unsnoozeResponse.json()) as {
      rule: { state: string; mutedUntil: string | null }
    }
    expect(unsnoozed.rule.state).toBe('active')
    expect(unsnoozed.rule.mutedUntil).toBeNull()
  })

  it('validates snooze payloads and rule existence', async () => {
    const app = await createAlertsRouteApp()

    const missing = await app.request(
      '/rules/66666666-6666-4666-8666-666666666666/snooze',
      jsonRequest({ minutes: 60 })
    )
    expect(missing.status).toBe(404)

    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Failure threshold',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    const tooLong = await app.request(
      `/rules/${rule.id}/snooze`,
      jsonRequest({ minutes: 10081 })
    )
    expect(tooLong.status).toBe(400)
  })

  it('reports rule state in list responses', async () => {
    const app = await createAlertsRouteApp()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Failure threshold',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })
    await alertRuleRepository.setMutedUntil(
      rule.id,
      TEST_ORG_ID,
      new Date(Date.now() + 60 * 60_000)
    )

    const response = await app.request('/rules')
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      rules: Array<{ id: string; state: string; mutedUntil: string | null }>
    }
    expect(body.rules.find((entry) => entry.id === rule.id)?.state).toBe('snoozed')
  })
})
