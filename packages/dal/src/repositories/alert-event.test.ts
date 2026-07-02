import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from '@durabull/env'
import { closeDb, getDb } from '../db/client'
import { organization } from '../db/schemas/organization/schema'
import { user } from '../db/schemas/user/schema'
import type { AlertRule } from '../db/schemas/alert-rule/types'
import { alertEventRepository } from './alert-event'
import { alertRuleRepository } from './alert-rule'
import { redisConnectionRepository } from './redis-connection'

const TEST_ORG_ID = 'alert-event-org'
const TEST_USER_ID = 'alert-event-user'
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_ENV_CONNECTIONS?: boolean
  DURABULL_REDIS_URL_ENCRYPTION_KEY?: string
  DURABULL_SECRET_ENCRYPTION_KEY?: string
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalEnvConnectionsFlag = mutableEnv.DURABULL_ENV_CONNECTIONS
const originalRedisEncryptionKey = mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY
const originalSecretEncryptionKey = mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

async function seedBase(): Promise<{ connectionId: string; rule: AlertRule }> {
  const db = await getDb()
  const now = new Date()
  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Alert Event Org',
    slug: 'alert-event-org',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(user).values({
    id: TEST_USER_ID,
    name: 'Ada Operator',
    email: 'ada@example.com',
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

  const rule = await alertRuleRepository.create({
    organizationId: TEST_ORG_ID,
    connectionId: connection.id,
    queueName: 'email-send',
    name: 'Failure threshold',
    type: 'failure_threshold',
    config: { count: 5, windowMinutes: 5 },
    cooldownMinutes: 30,
  })

  return { connectionId: connection.id, rule }
}

async function createFiringEvent(rule: AlertRule, connectionId: string, queueName = 'email-send') {
  return alertEventRepository.create({
    alertRuleId: rule.id,
    organizationId: TEST_ORG_ID,
    connectionId,
    queueName,
    type: rule.type,
    status: 'firing',
    summary: 'Failures crossed the configured threshold.',
    firedAt: new Date(),
  })
}

describe('alertEventRepository', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-alert-event-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_ENV_CONNECTIONS = false
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    await closeDb()
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DURABULL_ENV_CONNECTIONS = originalEnvConnectionsFlag
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = originalRedisEncryptionKey
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY = originalSecretEncryptionKey

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

  it('acknowledges firing events with who and when, and only once', async () => {
    const { connectionId, rule } = await seedBase()
    const event = await createFiringEvent(rule, connectionId)

    const acknowledged = await alertEventRepository.acknowledge(
      event.id,
      TEST_ORG_ID,
      TEST_USER_ID
    )

    expect(acknowledged?.acknowledgedBy).toBe(TEST_USER_ID)
    expect(acknowledged?.acknowledgedAt).toBeInstanceOf(Date)
    expect(acknowledged?.status).toBe('firing')

    // Second acknowledge is a no-op (already acknowledged).
    await expect(
      alertEventRepository.acknowledge(event.id, TEST_ORG_ID, TEST_USER_ID)
    ).resolves.toBeNull()
  })

  it('rejects acknowledging resolved events and preserves ack through resolve', async () => {
    const { connectionId, rule } = await seedBase()

    const resolvedFirst = await createFiringEvent(rule, connectionId)
    await alertEventRepository.resolve(resolvedFirst.id, TEST_ORG_ID)
    await expect(
      alertEventRepository.acknowledge(resolvedFirst.id, TEST_ORG_ID, TEST_USER_ID)
    ).resolves.toBeNull()

    const ackedThenResolved = await createFiringEvent(rule, connectionId, 'reports')
    await alertEventRepository.acknowledge(ackedThenResolved.id, TEST_ORG_ID, TEST_USER_ID)
    const resolved = await alertEventRepository.resolve(ackedThenResolved.id, TEST_ORG_ID)

    expect(resolved?.status).toBe('resolved')
    expect(resolved?.acknowledgedBy).toBe(TEST_USER_ID)
    expect(resolved?.acknowledgedAt).toBeInstanceOf(Date)
  })

  it('unacknowledges a firing event', async () => {
    const { connectionId, rule } = await seedBase()
    const event = await createFiringEvent(rule, connectionId)

    await alertEventRepository.acknowledge(event.id, TEST_ORG_ID, TEST_USER_ID)
    const cleared = await alertEventRepository.unacknowledge(event.id, TEST_ORG_ID)

    expect(cleared?.acknowledgedAt).toBeNull()
    expect(cleared?.acknowledgedBy).toBeNull()
  })

  it('coalesces repeated suppressions into one event with a running count', async () => {
    const { connectionId, rule } = await seedBase()
    const anchor = await createFiringEvent(rule, connectionId)

    const base = {
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId,
      queueName: 'email-send',
      type: rule.type,
      summary: 'Still failing during cooldown.',
      context: { failedDelta: 12 },
      dedupeKey: `suppressed:${anchor.id}`,
    }

    const first = await alertEventRepository.upsertSuppressed(base)
    expect(first.created).toBe(true)
    expect(first.event.status).toBe('suppressed')
    expect((first.event.context as Record<string, unknown>).suppressedCount).toBe(1)

    const second = await alertEventRepository.upsertSuppressed(base)
    expect(second.created).toBe(false)
    expect(second.event.id).toBe(first.event.id)
    expect((second.event.context as Record<string, unknown>).suppressedCount).toBe(2)

    const third = await alertEventRepository.upsertSuppressed(base)
    expect((third.event.context as Record<string, unknown>).suppressedCount).toBe(3)
  })

  it('anchors cooldown lookups to non-suppressed events', async () => {
    const { connectionId, rule } = await seedBase()
    const anchor = await createFiringEvent(rule, connectionId)

    await alertEventRepository.upsertSuppressed({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId,
      queueName: 'email-send',
      type: rule.type,
      summary: 'Suppressed during cooldown.',
      context: {},
      dedupeKey: `suppressed:${anchor.id}`,
    })

    const mostRecentAny = await alertEventRepository.findMostRecentForRule(rule.id, 'email-send')
    expect(mostRecentAny?.status).toBe('suppressed')

    const mostRecentFired = await alertEventRepository.findMostRecentFiredForRule(
      rule.id,
      'email-send'
    )
    expect(mostRecentFired?.id).toBe(anchor.id)
    expect(mostRecentFired?.status).toBe('firing')
  })

  it('summarizes open events per connection split by acknowledgement', async () => {
    const { connectionId, rule } = await seedBase()

    const acked = await createFiringEvent(rule, connectionId, 'queue-a')
    await alertEventRepository.acknowledge(acked.id, TEST_ORG_ID, TEST_USER_ID)
    await createFiringEvent(rule, connectionId, 'queue-b')
    await createFiringEvent(rule, connectionId, 'queue-c')

    const resolved = await createFiringEvent(rule, connectionId, 'queue-d')
    await alertEventRepository.resolve(resolved.id, TEST_ORG_ID)

    const summary = await alertEventRepository.summarizeOpenByOrganization(TEST_ORG_ID)
    expect(summary).toEqual([
      { connectionId, firing: 2, acknowledged: 1, open: 3 },
    ])
  })

  it('filters by acknowledgement and returns the acknowledging user name', async () => {
    const { connectionId, rule } = await seedBase()

    const acked = await createFiringEvent(rule, connectionId, 'queue-a')
    await alertEventRepository.acknowledge(acked.id, TEST_ORG_ID, TEST_USER_ID)
    await createFiringEvent(rule, connectionId, 'queue-b')

    const ackedRows = await alertEventRepository.findByConnection(connectionId, TEST_ORG_ID, {
      offset: 0,
      limit: 10,
      acknowledged: true,
    })
    expect(ackedRows).toHaveLength(1)
    expect(ackedRows[0].id).toBe(acked.id)
    expect(ackedRows[0].acknowledgedByName).toBe('Ada Operator')

    const unackedRows = await alertEventRepository.findByConnection(connectionId, TEST_ORG_ID, {
      offset: 0,
      limit: 10,
      acknowledged: false,
    })
    expect(unackedRows).toHaveLength(1)
    expect(unackedRows[0].acknowledgedByName).toBeNull()

    await expect(
      alertEventRepository.countByConnection(connectionId, TEST_ORG_ID, { acknowledged: true })
    ).resolves.toBe(1)
  })
})
