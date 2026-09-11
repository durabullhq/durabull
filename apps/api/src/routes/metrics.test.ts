import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { alertRuleRepository, closeDb, getDb, organization, redisConnection } from '@durabull/dal'
import { env } from '@durabull/env'
import { Hono } from 'hono'
import { buildRedisHealthSnapshot } from '../lib/redis-health'
import { recordRedisHealthSnapshot } from '../lib/redis-health-history'

const TEST_ORG_ID = 'metrics-routes-org'
const TEST_CONNECTION_ID = '77777777-7777-4777-8777-777777777777'
const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_REDIS_HEALTH_RETENTION_DAYS?: number
}
const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalRetentionDays = mutableEnv.DURABULL_REDIS_HEALTH_RETENTION_DAYS
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

async function createMetricsRouteApp() {
  const { default: metricsRoutes } = await import('./metrics')
  return new Hono()
    .use('*', async (c, next) => {
      c.set('connectionId', TEST_CONNECTION_ID)
      c.set('connectionUrl', 'redis://localhost:6379/0')
      c.set('connectionPrefix', 'bull')
      c.set('organizationId', TEST_ORG_ID)
      await next()
    })
    .route('/', metricsRoutes)
}

describe('metrics routes', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-metrics-routes-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_REDIS_HEALTH_RETENTION_DAYS = 45
    await closeDb()

    const db = await getDb()
    const now = new Date()
    await db.insert(organization).values({
      id: TEST_ORG_ID,
      name: 'Metrics Routes Org',
      slug: 'metrics-routes-org',
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
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DURABULL_REDIS_HEALTH_RETENTION_DAYS = originalRetentionDays
    if (originalPgliteDir) process.env.DURABULL_PGLITE_DIR = originalPgliteDir
    else delete process.env.DURABULL_PGLITE_DIR
    if (tempPgliteDir) await rm(tempPgliteDir, { recursive: true, force: true })
  })

  it('returns bounded Redis health history with active alert thresholds', async () => {
    const capturedAt = new Date(Date.now() - 60_000)
    const snapshot = buildRedisHealthSnapshot(
      [
        'used_memory:83886080',
        'used_memory_rss:94371840',
        'maxmemory:104857600',
        'used_cpu_sys:4',
        'used_cpu_user:6',
        'connected_clients:900',
        'maxclients:1000',
        'blocked_clients:2',
        'evicted_keys:5',
        'rejected_connections:1',
      ].join('\r\n'),
      'Primary Redis',
      capturedAt,
      null
    )
    await recordRedisHealthSnapshot(TEST_CONNECTION_ID, snapshot)
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: TEST_CONNECTION_ID,
      name: 'Redis memory pressure',
      type: 'redis_health',
      config: { metric: 'memory_usage_percent', threshold: 75 },
      cooldownMinutes: 30,
    })

    const app = await createMetricsRouteApp()
    const response = await app.request('/redis-health?windowMinutes=60&targetPoints=60')

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      latest: Record<string, unknown>
      range: { totalBuckets: number }
      retentionDays: number
      staleAfterMs: number
      thresholds: Array<Record<string, unknown>>
    }
    expect(body.latest).toMatchObject({
      memoryUsagePercent: 80,
      connectedClientsPercent: 90,
    })
    expect(body.range.totalBuckets).toBeLessThanOrEqual(60)
    expect(body.retentionDays).toBe(30)
    expect(body.staleAfterMs).toBeGreaterThanOrEqual(180_000)
    expect(body.thresholds).toEqual([
      {
        ruleId: rule.id,
        name: 'Redis memory pressure',
        metric: 'memory_usage_percent',
        threshold: 75,
      },
    ])
  })
})
