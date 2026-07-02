import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from '@durabull/env'
import { closeDb, getDb } from '../db/client'
import { organization } from '../db/schemas/organization/schema'
import { decryptSecret } from '../db/secret-encryption'
import { alertRuleRepository } from './alert-rule'
import { alertWebhookDestinationRepository } from './alert-destination'
import { redisConnectionRepository } from './redis-connection'

const TEST_ORG_ID = 'alert-webhook-destination-org'
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

async function seedOrganization() {
  const db = await getDb()
  const now = new Date()
  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Alert Webhook Destination Org',
    slug: 'alert-webhook-destination-org',
    createdAt: now,
    updatedAt: now,
  })
}

describe('alertWebhookDestinationRepository', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-alert-webhook-destination-'))
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

  it('stores signing secrets encrypted and preserves them when omitted on update', async () => {
    await seedOrganization()
    const destination = await alertWebhookDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Pager',
      url: 'https://example.com/hook',
      signingSecret: 'abcdefghijklmnop',
    })

    expect(destination.encryptedSigningSecret).toMatch(/^enc:v1:/)
    expect(decryptSecret(destination.encryptedSigningSecret!)).toBe('abcdefghijklmnop')

    const updated = await alertWebhookDestinationRepository.update(destination.id, TEST_ORG_ID, {
      name: 'Pager alerts',
    })

    expect(updated?.encryptedSigningSecret).toBe(destination.encryptedSigningSecret)
  })

  it('counts alert rules that reference a saved destination', async () => {
    await seedOrganization()
    const destination = await alertWebhookDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Incident intake',
      url: 'https://example.com/hook',
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
      notificationChannels: [{ type: 'webhook', destinationId: destination.id }],
      cooldownMinutes: 30,
    })

    await expect(
      alertWebhookDestinationRepository.countRuleReferences(destination.id, TEST_ORG_ID)
    ).resolves.toBe(1)
  })
})
