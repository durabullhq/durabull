import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from '@durabull/env'
import { closeDb, getDb } from '../db/client'
import { organization } from '../db/schemas/organization/schema'
import { alertRuleRepository } from './alert-rule'
import { redisConnectionRepository } from './redis-connection'

const TEST_ORG_ID = 'alert-rule-org'
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_ENV_CONNECTIONS?: boolean
  DURABULL_REDIS_URL_ENCRYPTION_KEY?: string
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalEnvConnectionsFlag = mutableEnv.DURABULL_ENV_CONNECTIONS
const originalRedisEncryptionKey = mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

async function seedConnection(): Promise<string> {
  const db = await getDb()
  const now = new Date()
  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Alert Rule Org',
    slug: 'alert-rule-org',
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

  return connection.id
}

async function createRule(connectionId: string, name: string) {
  return alertRuleRepository.create({
    organizationId: TEST_ORG_ID,
    connectionId,
    queueName: 'email-send',
    name,
    type: 'failure_threshold',
    config: { count: 5, windowMinutes: 5 },
    cooldownMinutes: 30,
  })
}

describe('alertRuleRepository', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-alert-rule-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_ENV_CONNECTIONS = false
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    await closeDb()
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DURABULL_ENV_CONNECTIONS = originalEnvConnectionsFlag
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = originalRedisEncryptionKey

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

  it('excludes snoozed rules from findAllActive until the snooze expires', async () => {
    const connectionId = await seedConnection()
    const active = await createRule(connectionId, 'Active rule')
    const snoozed = await createRule(connectionId, 'Snoozed rule')
    const expired = await createRule(connectionId, 'Expired snooze rule')
    const disabled = await createRule(connectionId, 'Disabled rule')

    await alertRuleRepository.setMutedUntil(
      snoozed.id,
      TEST_ORG_ID,
      new Date(Date.now() + 60 * 60 * 1000)
    )
    await alertRuleRepository.setMutedUntil(
      expired.id,
      TEST_ORG_ID,
      new Date(Date.now() - 60 * 1000)
    )
    await alertRuleRepository.update(disabled.id, TEST_ORG_ID, { enabled: false })

    const activeRules = await alertRuleRepository.findAllActive()
    const activeIds = activeRules.map((rule) => rule.id).sort()

    expect(activeIds).toEqual([active.id, expired.id].sort())
  })

  it('sets and clears mutedUntil', async () => {
    const connectionId = await seedConnection()
    const rule = await createRule(connectionId, 'Snoozable rule')

    const until = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const snoozed = await alertRuleRepository.setMutedUntil(rule.id, TEST_ORG_ID, until)
    expect(snoozed?.mutedUntil?.getTime()).toBe(until.getTime())

    const cleared = await alertRuleRepository.setMutedUntil(rule.id, TEST_ORG_ID, null)
    expect(cleared?.mutedUntil).toBeNull()

    await expect(
      alertRuleRepository.setMutedUntil(rule.id, 'other-org', until)
    ).resolves.toBeNull()
  })
})
