import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  alertEventRepository,
  alertRuleRepository,
  closeDb,
  getDb,
  organization,
  redisConnection,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { Hono } from 'hono'

const TEST_ORG_ID = 'alert-global-org'
const FIRST_CONNECTION_ID = '66666666-6666-4666-8666-666666666666'
const SECOND_CONNECTION_ID = '77777777-7777-4777-8777-777777777777'

const mutableEnv = env as {
  DATABASE_URL?: string
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

async function seedOrganization() {
  const db = await getDb()
  const now = new Date()

  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Alert Global Org',
    slug: 'alert-global-org',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(redisConnection).values([
    {
      id: FIRST_CONNECTION_ID,
      name: 'Primary Redis',
      url: 'redis://localhost:6379/0',
      environment: 'development',
      isDefault: true,
      organizationId: TEST_ORG_ID,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: SECOND_CONNECTION_ID,
      name: 'Worker Redis',
      url: 'redis://localhost:6379/1',
      environment: 'staging',
      isDefault: false,
      organizationId: TEST_ORG_ID,
      createdAt: now,
      updatedAt: now,
    },
  ])
}

async function createGlobalAlertsRouteApp() {
  const { default: alertsGlobalRoutes } = await import('./alerts-global')

  return new Hono()
    .use('*', async (c, next) => {
      c.set('organizationId', TEST_ORG_ID)
      await next()
    })
    .route('/', alertsGlobalRoutes)
}

describe('global alerts routes', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-alert-global-routes-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    await closeDb()
    await seedOrganization()
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

  it('returns organization-wide event history filtered by status', async () => {
    const firstRule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Email failures',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })
    const secondRule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: SECOND_CONNECTION_ID,
      queueName: 'invoice-send',
      name: 'Invoice failures',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    await alertEventRepository.create({
      alertRuleId: firstRule.id,
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      type: firstRule.type,
      status: 'resolved',
      summary: 'Resolved incident',
      context: {},
      firedAt: new Date(Date.now() - 10 * 60_000),
    })
    await alertEventRepository.create({
      alertRuleId: secondRule.id,
      organizationId: TEST_ORG_ID,
      connectionId: SECOND_CONNECTION_ID,
      queueName: 'invoice-send',
      type: secondRule.type,
      status: 'firing',
      summary: 'Active incident',
      context: {},
      firedAt: new Date(),
    })

    const app = await createGlobalAlertsRouteApp()
    const response = await app.request('/events?status=resolved')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      events: [expect.objectContaining({ status: 'resolved', connectionId: FIRST_CONNECTION_ID })],
    })
  })

  it('returns open incident counts grouped by connection', async () => {
    const firstRule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Email failures',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })
    const secondRule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: SECOND_CONNECTION_ID,
      queueName: 'invoice-send',
      name: 'Invoice failures',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    await alertEventRepository.create({
      alertRuleId: firstRule.id,
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      type: firstRule.type,
      status: 'firing',
      summary: 'Primary incident',
      context: {},
      firedAt: new Date(),
    })
    await alertEventRepository.create({
      alertRuleId: firstRule.id,
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      type: firstRule.type,
      status: 'firing',
      summary: 'Primary incident 2',
      context: {},
      firedAt: new Date(Date.now() - 1_000),
    })
    await alertEventRepository.create({
      alertRuleId: secondRule.id,
      organizationId: TEST_ORG_ID,
      connectionId: SECOND_CONNECTION_ID,
      queueName: 'invoice-send',
      type: secondRule.type,
      status: 'resolved',
      summary: 'Resolved elsewhere',
      context: {},
      firedAt: new Date(),
    })

    const app = await createGlobalAlertsRouteApp()
    const response = await app.request('/summary')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      connections: [{ connectionId: FIRST_CONNECTION_ID, count: 2 }],
    })
  })
})
