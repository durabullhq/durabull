import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb, getDb, organization, redisConnectionRepository } from '@durabull/dal'
import { env } from '@durabull/env'
import { buildRedisHealthSnapshot, type RedisHealthSnapshot } from './redis-health'
import {
  getRedisHealthHistory,
  getRedisHealthRetentionDays,
  pruneRedisHealthHistory,
  recordRedisHealthSnapshot,
} from './redis-health-history'

const TEST_ORG_ID = 'redis-health-history-org'
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_ENV_CONNECTIONS?: boolean
  DURABULL_REDIS_URL_ENCRYPTION_KEY?: string
  DURABULL_REDIS_HEALTH_RETENTION_DAYS?: number
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalEnvConnections = mutableEnv.DURABULL_ENV_CONNECTIONS
const originalEncryptionKey = mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY
const originalRetentionDays = mutableEnv.DURABULL_REDIS_HEALTH_RETENTION_DAYS
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''
let connectionId = ''

function redisInfo(usedMemoryMib: number, cpuSeconds: number): string {
  const mib = 1024 * 1024
  return [
    `used_memory:${usedMemoryMib * mib}`,
    `used_memory_rss:${(usedMemoryMib + 16) * mib}`,
    `maxmemory:${1024 * mib}`,
    `used_cpu_sys:${cpuSeconds / 2}`,
    `used_cpu_user:${cpuSeconds / 2}`,
    'allocator_frag_ratio:1.2',
    `allocator_frag_bytes:${20 * mib}`,
    'connected_clients:50',
    'maxclients:1000',
    'blocked_clients:1',
    'evicted_keys:10',
    'rejected_connections:2',
  ].join('\r\n')
}

describe('Redis health history', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-redis-health-history-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_ENV_CONNECTIONS = false
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    await closeDb()

    const db = await getDb()
    const now = new Date()
    await db.insert(organization).values({
      id: TEST_ORG_ID,
      name: 'Redis Health History Org',
      slug: TEST_ORG_ID,
      createdAt: now,
      updatedAt: now,
    })
    const connection = await redisConnectionRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Primary Redis',
      url: 'redis://localhost:6379/0',
      environment: 'development',
      isDefault: true,
    })
    connectionId = connection.id
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DURABULL_ENV_CONNECTIONS = originalEnvConnections
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = originalEncryptionKey
    mutableEnv.DURABULL_REDIS_HEALTH_RETENTION_DAYS = originalRetentionDays
    if (originalPgliteDir) process.env.DURABULL_PGLITE_DIR = originalPgliteDir
    else delete process.env.DURABULL_PGLITE_DIR
    await rm(tempPgliteDir, { recursive: true, force: true })
  })

  it('records one sample per minute and returns bounded, gap-aware history', async () => {
    const start = new Date('2026-09-02T18:00:15.000Z')
    const first = buildRedisHealthSnapshot(redisInfo(256, 10), 'Primary Redis', start)
    const replacement = buildRedisHealthSnapshot(
      redisInfo(300, 11),
      'Primary Redis',
      new Date('2026-09-02T18:00:45.000Z'),
      first
    )
    const later = buildRedisHealthSnapshot(
      redisInfo(512, 14),
      'Primary Redis',
      new Date('2026-09-02T18:04:15.000Z'),
      replacement
    )

    await recordRedisHealthSnapshot(connectionId, first)
    await recordRedisHealthSnapshot(connectionId, replacement)
    await recordRedisHealthSnapshot(connectionId, later)

    const history = await getRedisHealthHistory(connectionId, {
      from: new Date('2026-09-02T18:00:00.000Z'),
      to: new Date('2026-09-02T18:05:00.000Z'),
      targetPoints: 6,
    })

    expect(history.range).toMatchObject({ bucketMinutes: 1, totalBuckets: 6, sampledBuckets: 2 })
    expect(history.series).toHaveLength(6)
    expect(history.series[0]).toMatchObject({
      capturedAt: '2026-09-02T18:00:00.000Z',
      sampleCount: 1,
      usedMemoryBytes: 300 * 1024 * 1024,
    })
    expect(history.series[1]).toMatchObject({ sampleCount: 0, usedMemoryBytes: null })
    expect(history.series[4]).toMatchObject({
      capturedAt: '2026-09-02T18:04:00.000Z',
      sampleCount: 1,
      usedMemoryBytes: 512 * 1024 * 1024,
    })
    expect(history.latest?.usedMemoryBytes).toBe(512 * 1024 * 1024)
  })

  it('preserves alert-triggering peaks when downsampling', async () => {
    const times = [
      new Date('2026-09-02T18:00:00.000Z'),
      new Date('2026-09-02T18:01:00.000Z'),
      new Date('2026-09-02T18:02:00.000Z'),
    ]
    const memoryValues = [200, 900, 300]
    let previous: RedisHealthSnapshot | null = null
    for (const [index, capturedAt] of times.entries()) {
      const snapshot = buildRedisHealthSnapshot(
        redisInfo(memoryValues[index] ?? 0, 10 + index),
        'Primary Redis',
        capturedAt,
        previous
      )
      await recordRedisHealthSnapshot(connectionId, snapshot)
      previous = snapshot
    }

    const history = await getRedisHealthHistory(connectionId, {
      from: times[0],
      to: times[2],
      targetPoints: 1,
    })

    expect(history.series).toHaveLength(1)
    expect(history.series[0]?.usedMemoryBytes).toBe(900 * 1024 * 1024)
    expect(history.series[0]?.memoryUsagePercent).toBeCloseTo(87.891, 3)
  })

  it('calculates coverage at the configured collection cadence', async () => {
    const start = new Date('2026-09-02T18:00:00.000Z')
    let previous: RedisHealthSnapshot | null = null
    for (let minute = 0; minute <= 15; minute += 5) {
      const snapshot = buildRedisHealthSnapshot(
        redisInfo(256 + minute, 10 + minute),
        'Primary Redis',
        new Date(start.getTime() + minute * 60_000),
        previous
      )
      await recordRedisHealthSnapshot(connectionId, snapshot)
      previous = snapshot
    }

    const history = await getRedisHealthHistory(connectionId, {
      from: start,
      to: new Date(start.getTime() + 15 * 60_000),
      targetPoints: 480,
      expectedSampleIntervalMinutes: 5,
    })

    expect(history.range).toMatchObject({
      bucketMinutes: 5,
      totalBuckets: 4,
      sampledBuckets: 4,
      coveragePercent: 100,
    })
  })

  it('does not count a not-yet-due sampling bucket as a gap', async () => {
    await recordRedisHealthSnapshot(
      connectionId,
      buildRedisHealthSnapshot(
        redisInfo(256, 10),
        'Primary Redis',
        new Date('2026-09-02T18:02:00.000Z')
      )
    )

    const history = await getRedisHealthHistory(connectionId, {
      from: new Date('2026-09-02T18:00:00.000Z'),
      to: new Date('2026-09-02T18:06:00.000Z'),
      targetPoints: 480,
      expectedSampleIntervalMinutes: 5,
    })

    expect(history.range).toMatchObject({
      to: '2026-09-02T18:00:00.000Z',
      totalBuckets: 1,
      sampledBuckets: 1,
      coveragePercent: 100,
    })
  })

  it('does not count a field-empty INFO response as usable coverage', async () => {
    await recordRedisHealthSnapshot(
      connectionId,
      buildRedisHealthSnapshot('', 'Primary Redis', new Date('2026-09-02T18:00:00.000Z'))
    )

    const history = await getRedisHealthHistory(connectionId, {
      from: new Date('2026-09-02T18:00:00.000Z'),
      to: new Date('2026-09-02T18:00:00.000Z'),
      targetPoints: 1,
    })

    expect(history.range).toMatchObject({ sampledBuckets: 0, coveragePercent: 0 })
    expect(history.series[0]).toMatchObject({ sampleCount: 0, usedMemoryBytes: null })
  })

  it('caps retention at the longest observable window', () => {
    mutableEnv.DURABULL_REDIS_HEALTH_RETENTION_DAYS = 3_650
    expect(getRedisHealthRetentionDays()).toBe(30)
  })

  it('deletes expired samples in bounded batches while preserving recent history', async () => {
    const now = Date.now()
    const daysAgo = (days: number, minuteOffset = 0) =>
      new Date(now - days * 24 * 60 * 60 * 1000 + minuteOffset * 60_000)

    for (let index = 0; index < 5; index += 1) {
      await recordRedisHealthSnapshot(
        connectionId,
        buildRedisHealthSnapshot(
          redisInfo(128 + index, 10 + index),
          'Primary Redis',
          daysAgo(45, index)
        )
      )
    }
    await recordRedisHealthSnapshot(
      connectionId,
      buildRedisHealthSnapshot(redisInfo(512, 20), 'Primary Redis', daysAgo(2))
    )

    const cleanup = await pruneRedisHealthHistory({
      retentionDays: 30,
      batchSize: 2,
      maxBatches: 2,
    })
    const partiallyCleaned = await getRedisHealthHistory(connectionId, {
      from: daysAgo(60),
      to: new Date(now),
      targetPoints: 120,
    })

    expect(cleanup).toMatchObject({ deleted: 4, limitReached: true, retentionDays: 30 })
    expect(partiallyCleaned.latest?.usedMemoryBytes).toBe(512 * 1024 * 1024)
    expect(partiallyCleaned.range.sampledBuckets).toBe(2)

    const completedCleanup = await pruneRedisHealthHistory({
      retentionDays: 30,
      batchSize: 2,
      maxBatches: 2,
    })
    const remaining = await getRedisHealthHistory(connectionId, {
      from: daysAgo(60),
      to: new Date(now),
      targetPoints: 120,
    })
    expect(completedCleanup).toMatchObject({ deleted: 1, limitReached: false })
    expect(remaining.range.sampledBuckets).toBe(1)
  })
})
