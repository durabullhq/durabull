import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  alertDestinationRepository,
  alertRuleRepository,
  closeDb,
  getDb,
  organization,
  redisConnectionRepository,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { Hono } from 'hono'

const TEST_ORG_ID = 'alert-destination-route-org'
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_SECRET_ENCRYPTION_KEY?: string
  DURABULL_REDIS_URL_ENCRYPTION_KEY?: string
  DURABULL_ENV_CONNECTIONS?: boolean
  RESEND_API_KEY?: string
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalSecretKey = mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY
const originalRedisEncryptionKey = mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY
const originalEnvConnectionsFlag = mutableEnv.DURABULL_ENV_CONNECTIONS
const originalResendKey = mutableEnv.RESEND_API_KEY
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

async function seedOrganization() {
  const db = await getDb()
  const now = new Date()
  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Alert Destination Route Org',
    slug: 'alert-destination-route-org',
    createdAt: now,
    updatedAt: now,
  })
}

async function createRouteApp() {
  const { default: destinationRoutes } = await import('./alert-destinations')
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('organizationId', TEST_ORG_ID)
    await next()
  })
  return app.route('/', destinationRoutes)
}

async function createLegacyRouteApp() {
  const { default: webhookDestinationRoutes } = await import('./alert-webhook-destinations')
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('organizationId', TEST_ORG_ID)
    await next()
  })
  return app.route('/', webhookDestinationRoutes)
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

describe('alert destination routes', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-alert-destination-routes-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_ENV_CONNECTIONS = false
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    mutableEnv.RESEND_API_KEY = undefined
    await closeDb()
    await seedOrganization()
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY = originalSecretKey
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = originalRedisEncryptionKey
    mutableEnv.DURABULL_ENV_CONNECTIONS = originalEnvConnectionsFlag
    mutableEnv.RESEND_API_KEY = originalResendKey

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

  it('creates, lists, updates, and deletes email destinations', async () => {
    const app = await createRouteApp()

    const createResponse = await app.request(
      '/',
      jsonRequest('POST', {
        type: 'email',
        name: 'On-call email',
        config: { target: 'oncall@example.com' },
      })
    )
    expect(createResponse.status).toBe(201)
    const created = (await createResponse.json()) as {
      destination: { id: string; type: string; config?: { target?: string } }
    }
    expect(created.destination.type).toBe('email')
    expect(created.destination.config?.target).toBe('oncall@example.com')

    const listResponse = await app.request('/')
    const list = (await listResponse.json()) as {
      destinations: Array<{ id: string; type: string; inUseByRuleCount: number }>
    }
    expect(list.destinations).toHaveLength(1)
    expect(list.destinations[0]?.inUseByRuleCount).toBe(0)

    const updateResponse = await app.request(
      `/${created.destination.id}`,
      jsonRequest('PATCH', { config: { target: 'team@example.com' } })
    )
    expect(updateResponse.status).toBe(200)
    const updated = (await updateResponse.json()) as {
      destination: { config?: { target?: string } }
    }
    expect(updated.destination.config?.target).toBe('team@example.com')

    const invalidUpdate = await app.request(
      `/${created.destination.id}`,
      jsonRequest('PATCH', { config: { target: 'not-an-email' } })
    )
    expect(invalidUpdate.status).toBe(400)

    const deleteResponse = await app.request(`/${created.destination.id}`, { method: 'DELETE' })
    expect(deleteResponse.status).toBe(200)
  })

  it('rejects webhook payload fields on non-webhook destinations', async () => {
    const app = await createRouteApp()
    const created = await alertDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Email dest',
      type: 'email',
      config: { target: 'ops@example.com' },
    })

    const urlUpdate = await app.request(
      `/${created.id}`,
      jsonRequest('PATCH', { url: 'https://example.com/hook' })
    )
    expect(urlUpdate.status).toBe(400)

    const secretUpdate = await app.request(
      `/${created.id}`,
      jsonRequest('PATCH', { signingSecret: 'super-secret-webhook-value' })
    )
    expect(secretUpdate.status).toBe(400)
  })

  it('refuses to delete or disable destinations referenced by rules', async () => {
    const app = await createRouteApp()
    const destination = await alertDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Routed email',
      type: 'email',
      config: { target: 'ops@example.com' },
    })
    const connection = await redisConnectionRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Primary Redis',
      url: 'redis://localhost:6379/0',
      environment: 'development',
      isDefault: true,
    })
    await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: connection.id,
      queueName: 'email-send',
      name: 'Failure threshold',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      notificationChannels: [{ type: 'destination', destinationId: destination.id }],
      cooldownMinutes: 30,
    })

    const deleteResponse = await app.request(`/${destination.id}`, { method: 'DELETE' })
    expect(deleteResponse.status).toBe(409)

    const disableResponse = await app.request(
      `/${destination.id}`,
      jsonRequest('PATCH', { enabled: false })
    )
    expect(disableResponse.status).toBe(409)

    const listResponse = await app.request('/')
    const list = (await listResponse.json()) as {
      destinations: Array<{ inUseByRuleCount: number }>
    }
    expect(list.destinations[0]?.inUseByRuleCount).toBe(1)
  })

  it('reports email test readiness based on email configuration', async () => {
    const app = await createRouteApp()
    const destination = await alertDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Ops email',
      type: 'email',
      config: { target: 'ops@example.com' },
    })

    const response = await app.request(`/${destination.id}/test`, { method: 'POST' })
    // RESEND_API_KEY is unset in tests, so the test endpoint reports the
    // misconfiguration instead of pretending the destination works.
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      success: false,
      error: expect.stringContaining('RESEND_API_KEY'),
    })
  })

  it('keeps the legacy webhook-destinations alias scoped to webhook destinations', async () => {
    await alertDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Ops email',
      type: 'email',
      config: { target: 'ops@example.com' },
    })
    await alertDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Hook',
      url: 'https://example.com/hook',
    })

    const legacyApp = await createLegacyRouteApp()
    const response = await legacyApp.request('/')
    const body = (await response.json()) as { destinations: Array<{ name: string }> }
    expect(body.destinations).toHaveLength(1)
    expect(body.destinations[0]?.name).toBe('Hook')
  })

  it('requires a valid Linear integration to create linear destinations', async () => {
    const app = await createRouteApp()
    const response = await app.request(
      '/',
      jsonRequest('POST', {
        type: 'linear',
        name: 'Linear triage',
        config: { teamId: 'team-1' },
      })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('Linear integration'),
    })
  })
})
