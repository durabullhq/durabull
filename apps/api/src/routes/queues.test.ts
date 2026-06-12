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

  describe('sorting and filtering', () => {
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
      webhooks: {
        waiting: 7,
        active: 2,
        delayed: 0,
        completed: 1,
        failed: 8,
        paused: 0,
        prioritized: 0,
      },
    }
    const pausedQueues = new Set(['reports'])

    async function seedThreeQueues() {
      mock.module('../lib/queue-discovery', () => ({
        getQueueDiscoveryStatus: async () => ({
          running: false,
          startedAt: null,
          completedAt: Date.now(),
          lastError: null,
          indexed: { total: 3, confirmed: 3, pending: 0, lastDiscoveredAt: Date.now() },
        }),
        startQueueDiscovery: async () => ({}),
        waitForQueueDiscovery: async () => ({}),
      }))
      mock.module('../lib/redis', () => ({
        getQueue: async (_connId: string, _url: string, name: string) => ({
          getJobCounts: async () => countsByQueue[name] ?? {},
          isPaused: async () => pausedQueues.has(name),
        }),
        safeGetWorkers: async () => [],
        debugGetBullKeys: async () => [],
      }))

      await seedDiscoveredQueue('emails')
      await seedDiscoveredQueue('reports')
      await seedDiscoveredQueue('webhooks')

      return createQueuesRouteApp()
    }

    type ListBody = {
      queues: Array<{ name: string; status: string }>
      total: number
      totalUnfiltered: number
      totalJobCounts: { waiting: number }
    }

    it('sorts by a numeric job count column descending', async () => {
      const app = await seedThreeQueues()
      const response = await app.request('/?sortBy=failed&sortOrder=desc')

      expect(response.status).toBe(200)
      const body = (await response.json()) as ListBody
      expect(body.queues.map((q) => q.name)).toEqual(['webhooks', 'emails', 'reports'])
    })

    it('sorts by name descending', async () => {
      const app = await seedThreeQueues()
      const response = await app.request('/?sortBy=name&sortOrder=desc')

      const body = (await response.json()) as ListBody
      expect(body.queues.map((q) => q.name)).toEqual(['webhooks', 'reports', 'emails'])
    })

    it('filters by name search, case-insensitively', async () => {
      const app = await seedThreeQueues()
      const response = await app.request('/?search=RePoRt')

      const body = (await response.json()) as ListBody
      expect(body.queues.map((q) => q.name)).toEqual(['reports'])
      expect(body.total).toBe(1)
      expect(body.totalUnfiltered).toBe(3)
    })

    it('filters by status', async () => {
      const app = await seedThreeQueues()
      const response = await app.request('/?status=paused')

      const body = (await response.json()) as ListBody
      expect(body.queues.map((q) => q.name)).toEqual(['reports'])
      expect(body.queues[0]?.status).toBe('paused')
    })

    it('keeps connection-wide totals independent of filters', async () => {
      const app = await seedThreeQueues()
      const response = await app.request('/?search=emails')

      const body = (await response.json()) as ListBody
      expect(body.total).toBe(1)
      expect(body.totalJobCounts.waiting).toBe(20)
    })

    it('rejects an invalid sort column', async () => {
      const app = await seedThreeQueues()
      const response = await app.request('/?sortBy=bogus')

      expect(response.status).toBe(400)
    })
  })
})
