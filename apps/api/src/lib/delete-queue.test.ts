import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  and,
  closeDb,
  eq,
  getDb,
  organization,
  redisConnection,
  redisDiscoveredQueue,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { deleteQueueWithDiscoveryCleanup } from './delete-queue'

const TEST_ORG_ID = 'queue-delete-org'
const TEST_CONNECTION_ID = '11111111-1111-4111-8111-111111111111'
const TEST_QUEUE_NAME = 'conversation-message'

const originalPgliteDir = process.env.DURABULL_PGLITE_DIR
const mutableEnv = env as {
  DATABASE_URL?: string
}
const originalDatabaseUrl = mutableEnv.DATABASE_URL

let tempPgliteDir = ''

async function seedDiscoveredQueue() {
  const db = await getDb()
  const now = new Date()

  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Queue Delete Org',
    slug: 'queue-delete-org',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(redisConnection).values({
    id: TEST_CONNECTION_ID,
    name: 'Primary Redis',
    url: 'redis://localhost:6379/0',
    isDefault: true,
    environment: 'development',
    organizationId: TEST_ORG_ID,
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(redisDiscoveredQueue).values({
    connectionId: TEST_CONNECTION_ID,
    name: TEST_QUEUE_NAME,
    state: 'confirmed',
    lastDiscoveredAt: now,
    createdAt: now,
    updatedAt: now,
  })
}

async function getDiscoveredQueueRow() {
  const db = await getDb()
  const rows = await db
    .select()
    .from(redisDiscoveredQueue)
    .where(
      and(
        eq(redisDiscoveredQueue.connectionId, TEST_CONNECTION_ID),
        eq(redisDiscoveredQueue.name, TEST_QUEUE_NAME)
      )
    )

  return rows[0] ?? null
}

describe('deleteQueueWithDiscoveryCleanup', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-delete-queue-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    await closeDb()
    await seedDiscoveredQueue()
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

  it('removes the discovered queue row after Redis deletion succeeds', async () => {
    let obliterateCalls = 0

    await deleteQueueWithDiscoveryCleanup(TEST_CONNECTION_ID, TEST_QUEUE_NAME, {
      async obliterate() {
        obliterateCalls += 1
      },
    })

    expect(obliterateCalls).toBe(1)
    expect(await getDiscoveredQueueRow()).toBeNull()
  })

  it('rolls back the discovered queue row when Redis deletion fails', async () => {
    await expect(
      deleteQueueWithDiscoveryCleanup(TEST_CONNECTION_ID, TEST_QUEUE_NAME, {
        async obliterate() {
          throw new Error('Redis delete failed')
        },
      })
    ).rejects.toThrow('Redis delete failed')

    expect(await getDiscoveredQueueRow()).not.toBeNull()
  })
})
