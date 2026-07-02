import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from '@durabull/env'
import { closeDb, getDb } from '../db/client'
import { organization } from '../db/schemas/organization/schema'
import { decryptSecret } from '../db/secret-encryption'
import { alertRuleRepository } from './alert-rule'
import { alertDestinationRepository, alertWebhookDestinationRepository } from './alert-destination'
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

  it('counts rules referencing a destination via the generalized channel variant', async () => {
    await seedOrganization()
    const destination = await alertDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'On-call email',
      type: 'email',
      config: { target: 'oncall@example.com' },
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
      notificationChannels: [{ type: 'destination', destinationId: destination.id }],
      cooldownMinutes: 30,
    })

    await expect(
      alertDestinationRepository.countRuleReferences(destination.id, TEST_ORG_ID)
    ).resolves.toBe(1)
  })

  it('creates typed destinations and enforces per-type invariants', async () => {
    await seedOrganization()

    const email = await alertDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Ops email',
      type: 'email',
      config: { target: 'ops@example.com' },
    })
    expect(email.type).toBe('email')
    expect(email.url).toBeNull()
    expect(email.config).toEqual({ target: 'ops@example.com' })

    const linear = await alertDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Linear triage',
      type: 'linear',
      config: { teamId: 'team-123', priority: 2 },
    })
    expect(linear.type).toBe('linear')

    await expect(
      alertDestinationRepository.create({
        organizationId: TEST_ORG_ID,
        name: 'Broken webhook',
        type: 'webhook',
      })
    ).rejects.toThrow('Webhook destinations require a URL.')

    await expect(
      alertDestinationRepository.create({
        organizationId: TEST_ORG_ID,
        name: 'Broken email',
        type: 'email',
        config: { target: 'not-an-email' },
      })
    ).rejects.toThrow('valid target email')
  })

  it('lists destinations by ids scoped to the organization and filters by type', async () => {
    await seedOrganization()
    const webhook = await alertDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Hook',
      url: 'https://example.com/hook',
    })
    const email = await alertDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Mail',
      type: 'email',
      config: { target: 'mail@example.com' },
    })

    const byIds = await alertDestinationRepository.listByIds(
      [webhook.id, email.id, '00000000-0000-4000-8000-000000000000'],
      TEST_ORG_ID
    )
    expect(byIds.map((d) => d.id).sort()).toEqual([webhook.id, email.id].sort())

    const webhooksOnly = await alertDestinationRepository.listByOrganization(TEST_ORG_ID, {
      type: 'webhook',
    })
    expect(webhooksOnly).toHaveLength(1)
    expect(webhooksOnly[0].id).toBe(webhook.id)

    await expect(alertDestinationRepository.listByIds([], TEST_ORG_ID)).resolves.toEqual([])
  })
})
