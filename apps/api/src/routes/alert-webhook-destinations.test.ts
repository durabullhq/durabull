import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  alertWebhookDestination,
  alertRuleRepository,
  closeDb,
  eq,
  getDb,
  organization,
  redisConnectionRepository,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { Hono } from 'hono'

const TEST_ORG_ID = 'alert-webhook-destination-route-org'
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_SECRET_ENCRYPTION_KEY?: string
  DURABULL_REDIS_URL_ENCRYPTION_KEY?: string
  DURABULL_ENV_CONNECTIONS?: boolean
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalSecretKey = mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY
const originalRedisEncryptionKey = mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY
const originalEnvConnectionsFlag = mutableEnv.DURABULL_ENV_CONNECTIONS
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

async function seedOrganization() {
  const db = await getDb()
  const now = new Date()
  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Alert Webhook Destination Route Org',
    slug: 'alert-webhook-destination-route-org',
    createdAt: now,
    updatedAt: now,
  })
}

async function createRouteApp() {
  const { default: webhookDestinationRoutes } = await import('./alert-webhook-destinations')
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('organizationId', TEST_ORG_ID)
    await next()
  })
  return app.route('/', webhookDestinationRoutes)
}

describe('alert webhook destination routes', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-alert-webhook-destination-routes-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_ENV_CONNECTIONS = false
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    await closeDb()
    await seedOrganization()
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY = originalSecretKey
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = originalRedisEncryptionKey
    mutableEnv.DURABULL_ENV_CONNECTIONS = originalEnvConnectionsFlag

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

  it('creates and lists sanitized webhook destinations', async () => {
    const app = await createRouteApp()
    const createResponse = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Incident intake',
        url: 'https://example.com/durabull',
        signingSecret: 'abcdefghijklmnop',
      }),
    })

    expect(createResponse.status).toBe(201)
    const created = (await createResponse.json()) as {
      destination: { id: string; secretConfigured: boolean; secretLast4?: string }
    }
    expect(created.destination.secretConfigured).toBe(true)
    expect(created.destination.secretLast4).toBe('mnop')

    const listResponse = await app.request('/')
    expect(listResponse.status).toBe(200)
    const listed = (await listResponse.json()) as {
      destinations: Array<{ id: string; name: string; secretConfigured: boolean }>
    }
    expect(listed.destinations).toEqual([
      expect.objectContaining({
        id: created.destination.id,
        name: 'Incident intake',
        secretConfigured: true,
      }),
    ])
  })

  it('lists destinations with unreadable secrets without exposing or throwing', async () => {
    const app = await createRouteApp()
    const createResponse = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Corrupt secret',
        url: 'https://example.com/durabull',
        signingSecret: 'super-secret-webhook-value',
      }),
    })
    const created = (await createResponse.json()) as { destination: { id: string } }
    const db = await getDb()
    await db
      .update(alertWebhookDestination)
      .set({ encryptedSigningSecret: 'enc:v1:corrupt' })
      .where(eq(alertWebhookDestination.id, created.destination.id))

    const listResponse = await app.request('/')

    expect(listResponse.status).toBe(200)
    const body = (await listResponse.json()) as {
      destinations: Array<{ secretConfigured: boolean; secretLast4?: string }>
    }
    expect(body.destinations[0]).toMatchObject({ secretConfigured: true })
    expect(body.destinations[0]?.secretLast4).toBeUndefined()
  })

  it('returns a 400 when testing a destination with an unreadable secret', async () => {
    const app = await createRouteApp()
    const createResponse = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Corrupt test secret',
        url: 'https://example.com/durabull',
        signingSecret: 'super-secret-webhook-value',
      }),
    })
    const created = (await createResponse.json()) as { destination: { id: string } }
    const db = await getDb()
    await db
      .update(alertWebhookDestination)
      .set({ encryptedSigningSecret: 'enc:v1:corrupt' })
      .where(eq(alertWebhookDestination.id, created.destination.id))

    const testResponse = await app.request(`/${created.destination.id}/test`, { method: 'POST' })

    expect(testResponse.status).toBe(400)
    expect(await testResponse.json()).toEqual({
      error: 'Webhook destination signing secret could not be decrypted.',
    })
  })

  it('blocks deleting destinations that are still referenced by rules', async () => {
    const app = await createRouteApp()
    const createResponse = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Incident intake',
        url: 'https://example.com/durabull',
      }),
    })
    const created = (await createResponse.json()) as { destination: { id: string } }
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
      notificationChannels: [{ type: 'webhook', destinationId: created.destination.id }],
      cooldownMinutes: 30,
    })

    const deleteResponse = await app.request(`/${created.destination.id}`, { method: 'DELETE' })

    expect(deleteResponse.status).toBe(409)
  })

  it('blocks disabling destinations that are still referenced by rules', async () => {
    const app = await createRouteApp()
    const createResponse = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Incident intake',
        url: 'https://example.com/durabull',
      }),
    })
    const created = (await createResponse.json()) as { destination: { id: string } }
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
      notificationChannels: [{ type: 'webhook', destinationId: created.destination.id }],
      cooldownMinutes: 30,
    })

    const disableResponse = await app.request(`/${created.destination.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })

    expect(disableResponse.status).toBe(409)
  })
})
