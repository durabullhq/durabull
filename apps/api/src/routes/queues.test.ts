import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb, getDb, organization, redisConnection, redisDiscoveredQueue } from '@durabull/dal'
import { env } from '@durabull/env'
import { Hono } from 'hono'

const TEST_ORG_ID = 'queue-routes-org'
const TEST_CONNECTION_ID = '66666666-6666-4666-8666-666666666666'

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
    name: 'Queue Routes Org',
    slug: 'queue-routes-org',
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

async function createQueuesRouteApp() {
  const { default: queuesRoutes } = await import('./queues')

  return new Hono()
    .use('*', async (c, next) => {
      c.set('connectionId', TEST_CONNECTION_ID)
      c.set('connectionUrl', 'redis://localhost:6379/0')
      c.set('connectionName', 'Primary Redis')
      c.set('connectionPrefix', 'bull')
      c.set('organizationId', TEST_ORG_ID)
      await next()
    })
    .route('/', queuesRoutes)
}

describe('queues routes', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-queue-routes-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    await closeDb()
    await seedBaseConnection()

    mock.module('../lib/connection-options', () => ({
      getConnectionRedisOptions: () => ({}),
    }))
    mock.module('../lib/queue-discovery', () => ({
      getQueueDiscoveryStatus: async () => ({
        running: false,
        startedAt: null,
        completedAt: Date.now(),
        lastError: null,
        indexed: { total: 2, confirmed: 2, pending: 0, lastDiscoveredAt: Date.now() },
      }),
      startQueueDiscovery: async () => ({}),
      waitForQueueDiscovery: async () => ({}),
    }))
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

  it('aggregates prioritized counts across queues into totalJobCounts', async () => {
    const countsByQueue: Record<string, Record<string, number>> = {
      emails: {
        waiting: 10,
        active: 1,
        delayed: 0,
        completed: 5,
        failed: 2,
        paused: 0,
        prioritized: 4,
      },
      reports: {
        waiting: 3,
        active: 0,
        delayed: 1,
        completed: 9,
        failed: 0,
        paused: 0,
        prioritized: 6,
      },
    }

    const getQueueMock = mock(async (_connId: string, _url: string, name: string) => ({
      getJobCounts: async () => countsByQueue[name] ?? {},
      isPaused: async () => false,
    }))

    mock.module('../lib/redis', () => ({
      getQueue: getQueueMock,
      safeGetWorkers: async () => [],
      debugGetBullKeys: async () => [],
    }))

    await seedDiscoveredQueue('emails')
    await seedDiscoveredQueue('reports')

    const app = await createQueuesRouteApp()
    const response = await app.request('/')

    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      queues: Array<{ name: string; jobCounts: { prioritized: number } }>
      totalJobCounts: { prioritized: number; waiting: number }
    }

    expect(body.totalJobCounts.prioritized).toBe(10)
    expect(body.totalJobCounts.waiting).toBe(13)

    const emails = body.queues.find((q) => q.name === 'emails')
    expect(emails?.jobCounts.prioritized).toBe(4)
  })

  it('filters queue list by name query', async () => {
    const getQueueMock = mock(async () => ({
      getJobCounts: async () => ({
        waiting: 0,
        active: 0,
        delayed: 0,
        completed: 0,
        failed: 0,
        paused: 0,
        prioritized: 0,
      }),
      isPaused: async () => false,
    }))

    mock.module('../lib/redis', () => ({
      getQueue: getQueueMock,
      safeGetWorkers: async () => [],
      debugGetBullKeys: async () => [],
    }))

    await seedDiscoveredQueue('emails')
    await seedDiscoveredQueue('reports')
    await seedDiscoveredQueue('email-digest')

    const app = await createQueuesRouteApp()
    const response = await app.request('/?name=email')

    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      total: number
      totalPages: number
      queues: Array<{ name: string }>
    }

    expect(body.total).toBe(2)
    expect(body.totalPages).toBe(1)
    expect(body.queues.map((queue) => queue.name).sort()).toEqual(['email-digest', 'emails'])
  })
})
