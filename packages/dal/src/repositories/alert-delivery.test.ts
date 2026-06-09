import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from '@durabull/env'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '../db/client'
import { alertDelivery } from '../db/schemas/alert-delivery/schema'
import { organization } from '../db/schemas/organization/schema'
import { alertDeliveryRepository } from './alert-delivery'
import { alertEventRepository } from './alert-event'
import { alertRuleRepository } from './alert-rule'
import { redisConnectionRepository } from './redis-connection'

const TEST_ORG_ID = 'alert-delivery-org'
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_ENV_CONNECTIONS?: boolean
  DURABULL_REDIS_URL_ENCRYPTION_KEY?: string
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalEnvConnectionsFlag = mutableEnv.DURABULL_ENV_CONNECTIONS
const originalEncryptionKey = mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

async function seedAlertEvent() {
  const db = await getDb()
  const now = new Date()

  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Alert Delivery Org',
    slug: 'alert-delivery-org',
    createdAt: now,
    updatedAt: now,
  })

  const connection = await redisConnectionRepository.create({
    name: 'Primary Redis',
    url: 'redis://localhost:6379/0',
    environment: 'development',
    isDefault: true,
    organizationId: TEST_ORG_ID,
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

  return alertEventRepository.create({
    alertRuleId: rule.id,
    organizationId: TEST_ORG_ID,
    connectionId: connection.id,
    queueName: 'email-send',
    type: 'failure_threshold',
    status: 'firing',
    summary: 'Queue failure threshold breached',
    context: {},
    firedAt: now,
  })
}

describe('alertDeliveryRepository', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-alert-delivery-'))
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
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = originalEncryptionKey

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

  it('claims due deliveries without reclaiming fresh or delivered rows', async () => {
    const event = await seedAlertEvent()
    await alertDeliveryRepository.enqueueMany([
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'email',
        target: 'ops@example.com',
      },
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'linear',
        target: 'org-default:team-1::::',
      },
    ])

    const firstClaim = await alertDeliveryRepository.claimDueForEvent(event.id, 1)
    expect(firstClaim).toHaveLength(1)
    expect(firstClaim[0]?.status).toBe('claimed')
    expect(firstClaim[0]?.claimedAt).toBeInstanceOf(Date)

    await alertDeliveryRepository.markDelivered(firstClaim[0]!.id, {}, firstClaim[0]!.claimedAt!)

    const secondClaim = await alertDeliveryRepository.claimDueForEvent(event.id)
    expect(secondClaim).toHaveLength(1)
    expect(secondClaim[0]?.id).not.toBe(firstClaim[0]?.id)

    const finalClaim = await alertDeliveryRepository.claimDueForEvent(event.id)
    expect(finalClaim).toHaveLength(0)
  })

  it('claims only the requested delivery by id', async () => {
    const event = await seedAlertEvent()
    const deliveries = await alertDeliveryRepository.enqueueMany([
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'email',
        target: 'ops@example.com',
      },
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'linear',
        target: 'org-default:team-1::::',
      },
    ])

    const [claimed] = await alertDeliveryRepository.claimById(deliveries[1]!.id, event.id)
    expect(claimed?.id).toBe(deliveries[1]!.id)
    expect(claimed?.status).toBe('claimed')

    const listed = await alertDeliveryRepository.listByEvent(event.id)
    expect(listed.find((row) => row.id === deliveries[0]!.id)?.status).toBe('pending')
    expect(listed.find((row) => row.id === deliveries[1]!.id)?.status).toBe('claimed')
  })

  it('does not reclaim non-retryable failed deliveries', async () => {
    const event = await seedAlertEvent()
    await alertDeliveryRepository.enqueueMany([
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'linear',
        target: 'org-default:team-1::::',
      },
    ])

    const [delivery] = await alertDeliveryRepository.claimDueForEvent(event.id)
    expect(delivery).toBeDefined()
    await alertDeliveryRepository.markFailed(delivery!.id, {
      error: 'Manual reconciliation required',
      retryable: false,
      expectedClaimedAt: delivery!.claimedAt!,
    })

    const claimed = await alertDeliveryRepository.claimDueForEvent(event.id)
    expect(claimed).toHaveLength(0)
  })

  it('claims due deliveries across events for the monitor sweep', async () => {
    const event = await seedAlertEvent()
    await alertDeliveryRepository.enqueueMany([
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'webhook',
        target: 'https://example.com/hook',
      },
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'email',
        target: 'ops@example.com',
      },
    ])

    const [retryable, permanent] = await alertDeliveryRepository.claimDueForEvent(event.id)
    expect(retryable).toBeDefined()
    expect(permanent).toBeDefined()

    await alertDeliveryRepository.markFailed(retryable!.id, {
      error: 'HTTP 500',
      retryable: true,
      nextRetryAt: new Date(Date.now() - 1000),
      expectedClaimedAt: retryable!.claimedAt!,
    })
    await alertDeliveryRepository.markFailed(permanent!.id, {
      error: 'HTTP 400',
      retryable: false,
      expectedClaimedAt: permanent!.claimedAt!,
    })

    const due = await alertDeliveryRepository.claimDue()
    expect(due.map((delivery) => delivery.id)).toEqual([retryable!.id])
  })

  it('only lets the current claim complete or fail a delivery', async () => {
    const event = await seedAlertEvent()
    await alertDeliveryRepository.enqueueMany([
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'email',
        target: 'ops@example.com',
      },
    ])

    const [claim] = await alertDeliveryRepository.claimDueForEvent(event.id)
    expect(claim?.claimedAt).toBeInstanceOf(Date)

    const db = await getDb()
    const stolenClaimedAt = new Date(claim!.claimedAt!.getTime() + 1000)
    await db
      .update(alertDelivery)
      .set({ status: 'claimed', claimedAt: stolenClaimedAt })
      .where(eq(alertDelivery.id, claim!.id))

    expect(await alertDeliveryRepository.markDelivered(claim!.id, {}, claim!.claimedAt!)).toBe(
      false
    )
    expect(
      await alertDeliveryRepository.markFailed(claim!.id, {
        error: 'stale worker failed',
        retryable: true,
        expectedClaimedAt: claim!.claimedAt!,
      })
    ).toBe(false)

    expect(await alertDeliveryRepository.markDelivered(claim!.id, {}, stolenClaimedAt)).toBe(true)

    const [delivery] = await alertDeliveryRepository.listByEvent(event.id)
    expect(delivery?.status).toBe('delivered')
  })
})
