import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from '@durabull/env'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '../db/client'
import {
  alertDestination,
  invitation,
  mcpServiceAccount,
  member,
  organization,
  redisConnection,
  user,
} from '../db/schemas'
import { billingRepository, parsePlanLimitDbError } from './billing'

const mutableEnv = env as { DATABASE_URL?: string; DURABULL_REDIS_URL_ENCRYPTION_KEY?: string }
const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR
let tempPgliteDir = ''

const ORG = 'billing-org'

async function seedOrganization() {
  const db = await getDb()
  const now = new Date()
  await db
    .insert(organization)
    .values({ id: ORG, name: 'Billing', slug: 'billing', createdAt: now, updatedAt: now })
  await db.insert(user).values({
    id: 'owner',
    name: 'Owner',
    email: 'owner@example.com',
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(member).values({
    id: 'm-owner',
    organizationId: ORG,
    userId: 'owner',
    role: 'owner',
    createdAt: now,
    updatedAt: now,
  })
}

async function enforceLimits(limits: Record<string, number | null>) {
  await billingRepository.saveEntitlement({
    organizationId: ORG,
    planCode: 'free',
    source: 'free',
    catalogVersion: 'test',
    features: [],
    limits,
    enforced: true,
  })
}

async function insertConnection(name: string, enabled = true) {
  const db = await getDb()
  const [row] = await db
    .insert(redisConnection)
    .values({ name, url: 'redis://localhost:6379', organizationId: ORG, enabled })
    .returning()
  return row
}

async function limitError(run: () => PromiseLike<unknown>) {
  try {
    await run()
  } catch (error) {
    return parsePlanLimitDbError(error)
  }
  return null
}

describe('billing capacity triggers', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-billing-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    await closeDb()
    await seedOrganization()
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    if (originalPgliteDir) process.env.DURABULL_PGLITE_DIR = originalPgliteDir
    else delete process.env.DURABULL_PGLITE_DIR
    if (tempPgliteDir) {
      await rm(tempPgliteDir, { recursive: true, force: true })
      tempPgliteDir = ''
    }
  })

  it('imposes no limit without an enforced entitlement (self-hosted)', async () => {
    for (let i = 0; i < 4; i += 1) await insertConnection(`c${i}`)
    const usage = await billingRepository.getUsage(ORG)
    expect(usage['connections.enabled']).toBe(4)
  })

  it('rejects connections beyond the limit and ignores disabled ones', async () => {
    await enforceLimits({ 'connections.enabled': 2 })
    await insertConnection('a')
    await insertConnection('b')
    await insertConnection('disabled', false)

    let caught: unknown = null
    try {
      await insertConnection('c')
    } catch (error) {
      caught = error
    }
    expect(parsePlanLimitDbError(caught)).toEqual({
      limit: 'connections.enabled',
      usage: 2,
      allowed: 2,
    })

    const db = await getDb()
    const [disabled] = await db
      .select()
      .from(redisConnection)
      .where(eq(redisConnection.name, 'disabled'))
    expect(
      await limitError(() =>
        db.update(redisConnection).set({ enabled: true }).where(eq(redisConnection.id, disabled.id))
      )
    ).not.toBeNull()
  })

  it('commits only capacity within the limit for concurrent creates', async () => {
    await enforceLimits({ 'connections.enabled': 5 })
    for (let i = 0; i < 4; i += 1) await insertConnection(`seed-${i}`)
    const results = await Promise.allSettled([insertConnection('x'), insertConnection('y')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await billingRepository.getUsage(ORG))['connections.enabled']).toBe(5)
  })

  it('reserves member capacity for pending invitations', async () => {
    await enforceLimits({ 'members.reserved': 2 })
    const db = await getDb()
    await db.insert(invitation).values({
      id: 'inv-1',
      organizationId: ORG,
      email: 'a@example.com',
      role: 'member',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId: 'owner',
    })
    expect(
      await limitError(() =>
        db.insert(invitation).values({
          id: 'inv-2',
          organizationId: ORG,
          email: 'b@example.com',
          role: 'member',
          status: 'pending',
          expiresAt: new Date(Date.now() + 86_400_000),
          inviterId: 'owner',
        })
      )
    ).not.toBeNull()
    expect((await billingRepository.getUsage(ORG))['members.reserved']).toBe(2)
  })

  it('excludes suspended resources from usage', async () => {
    await enforceLimits({ 'alerts.destinations': 1, 'service_accounts.enabled': 0 })
    const db = await getDb()
    const [destination] = await db
      .insert(alertDestination)
      .values({
        organizationId: ORG,
        name: 'one',
        type: 'email',
        config: { target: 'a@example.com' },
      })
      .returning()
    expect(
      await limitError(() =>
        db.insert(alertDestination).values({ organizationId: ORG, name: 'two', type: 'email' })
      )
    ).not.toBeNull()

    await billingRepository.suspend(
      ORG,
      [{ kind: 'alert_destination', resourceId: destination.id }],
      'test'
    )
    expect((await billingRepository.getUsage(ORG))['alerts.destinations']).toBe(0)

    expect(
      await limitError(() =>
        db.insert(mcpServiceAccount).values({ organizationId: ORG, name: 'sa' })
      )
    ).not.toBeNull()
  })

  it('keeps one open checkout attempt per organization', async () => {
    const base = {
      organizationId: ORG,
      createdByUserId: 'owner',
      planCode: 'team',
      billingInterval: 'month',
      stripePriceId: 'price_team',
      trial: false,
      expiresAt: new Date(Date.now() + 60_000),
    }
    const first = await billingRepository.createCheckoutAttempt({ ...base, idempotencyKey: 'k1' })
    const second = await billingRepository.createCheckoutAttempt({ ...base, idempotencyKey: 'k2' })
    expect(first).not.toBeNull()
    expect(second).toBeNull()
  })

  it('collapses duplicate webhook events and claims each once', async () => {
    const event = {
      id: 'evt_1',
      type: 'customer.subscription.updated',
      livemode: false,
      stripeObjectId: 'sub_1',
      stripeCustomerId: 'cus_1',
      stripeCreatedAt: new Date(),
    }
    expect(await billingRepository.recordWebhookEvent(event)).toBe(true)
    expect(await billingRepository.recordWebhookEvent(event)).toBe(false)
    const claimed = await billingRepository.claimWebhookEvents({
      now: new Date(),
      limit: 10,
      staleClaimMs: 60_000,
    })
    expect(claimed.map((e) => e.id)).toEqual(['evt_1'])
    const again = await billingRepository.claimWebhookEvents({
      now: new Date(),
      limit: 10,
      staleClaimMs: 60_000,
    })
    expect(again).toHaveLength(0)
  })

  it('increments the entitlement revision only when privileges change', async () => {
    await enforceLimits({ 'connections.enabled': 1 })
    const first = await billingRepository.findEntitlement(ORG)
    await enforceLimits({ 'connections.enabled': 1 })
    const unchanged = await billingRepository.findEntitlement(ORG)
    await enforceLimits({ 'connections.enabled': 5 })
    const changed = await billingRepository.findEntitlement(ORG)
    expect(unchanged?.revision).toBe(first?.revision)
    expect(changed?.revision).toBe((first?.revision ?? 0) + 1)
  })

  it('serializes work under the organization lock', async () => {
    const order: string[] = []
    await Promise.all([
      billingRepository.withOrganizationLock(ORG, async () => {
        order.push('a:start')
        await new Promise((resolve) => setTimeout(resolve, 20))
        order.push('a:end')
      }),
      billingRepository.withOrganizationLock(ORG, async () => {
        order.push('b:start')
        order.push('b:end')
      }),
    ])
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  })
})
