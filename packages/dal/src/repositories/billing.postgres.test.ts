import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { env } from '@durabull/env'
import { eq, sql } from 'drizzle-orm'
import { closeDb, getDb, getPgPool } from '../db/client'
import { invitation, member, organization, redisConnection, user } from '../db/schemas'
import { billingRepository, parsePlanLimitDbError } from './billing'

/**
 * PostgreSQL verification of the billing concurrency guarantees. PGlite runs
 * on a single connection, so these tests exercise real parallel sessions.
 * Opt in with DURABULL_TEST_POSTGRES_URL pointing at a disposable database.
 */
const postgresUrl = process.env.DURABULL_TEST_POSTGRES_URL
const describePostgres = postgresUrl ? describe : describe.skip
const mutableEnv = env as { DATABASE_URL?: string; DATABASE_MIGRATION_URL?: string }
const originalDatabaseUrl = mutableEnv.DATABASE_URL
const ORG = `pg-billing-${Date.now()}`

async function enforce(limits: Record<string, number | null>) {
  await billingRepository.saveEntitlement({
    organizationId: ORG,
    planCode: 'team',
    source: 'subscription',
    catalogVersion: 'test',
    features: [],
    limits,
    enforced: true,
  })
}

describePostgres('billing on PostgreSQL', () => {
  beforeAll(async () => {
    mutableEnv.DATABASE_URL = postgresUrl
    // Optional: run migrations over a direct URL while the app goes through a pooler.
    mutableEnv.DATABASE_MIGRATION_URL = process.env.DURABULL_TEST_POSTGRES_MIGRATION_URL
    await closeDb()
    const db = await getDb()
    const now = new Date()
    await db
      .insert(organization)
      .values({ id: ORG, name: 'PG', slug: ORG, createdAt: now, updatedAt: now })
    await db.insert(user).values({
      id: `${ORG}-owner`,
      name: 'Owner',
      email: `${ORG}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(member).values({
      id: `${ORG}-m`,
      organizationId: ORG,
      userId: `${ORG}-owner`,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    })
  })

  afterAll(async () => {
    const db = await getDb()
    await db.delete(organization).where(eq(organization.id, ORG))
    await db.delete(user).where(eq(user.id, `${ORG}-owner`))
    await db.execute(sql`DELETE FROM billing_webhook_event WHERE id LIKE ${`${ORG}%`}`)
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DATABASE_MIGRATION_URL = undefined
  })

  it('commits exactly the remaining capacity under 20 parallel sessions', async () => {
    await enforce({ 'connections.enabled': 5 })
    const db = await getDb()
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        db
          .insert(redisConnection)
          .values({ name: `c${i}`, url: 'redis://localhost:6379', organizationId: ORG })
          .then(() => 'ok')
      )
    )
    const committed = results.filter((r) => r.status === 'fulfilled').length
    const rejected = results.filter(
      (r) =>
        r.status === 'rejected' && parsePlanLimitDbError(r.reason)?.limit === 'connections.enabled'
    ).length
    expect(committed).toBe(5)
    expect(rejected).toBe(15)
    expect((await billingRepository.getUsage(ORG))['connections.enabled']).toBe(5)
  })

  it('serializes concurrent invitations against the seat limit', async () => {
    await enforce({ 'connections.enabled': 5, 'members.reserved': 3 })
    const db = await getDb()
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        db.insert(invitation).values({
          id: `${ORG}-inv-${i}`,
          organizationId: ORG,
          email: `invitee${i}@example.com`,
          role: 'member',
          status: 'pending',
          expiresAt: new Date(Date.now() + 86_400_000),
          inviterId: `${ORG}-owner`,
        })
      )
    )
    // Owner holds one of three seats; two invitations fit.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2)
    expect((await billingRepository.getUsage(ORG))['members.reserved']).toBe(3)
  })

  it('serializes organization billing work across separate sessions', async () => {
    const order: string[] = []
    const pool = await getPgPool()
    const observer = await pool.connect()
    try {
      const first = billingRepository.withOrganizationLock(ORG, async () => {
        order.push('a:start')
        // A different session cannot take the advisory lock while it is held.
        const probe = await observer.query(
          'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
          [`durabull_billing:${ORG}`]
        )
        order.push(`probe:${probe.rows[0].locked}`)
        await new Promise((resolve) => setTimeout(resolve, 50))
        order.push('a:end')
      })
      const second = billingRepository.withOrganizationLock(ORG, async () => {
        order.push('b')
      })
      await Promise.all([first, second])
    } finally {
      observer.release()
    }
    expect(order).toEqual(['a:start', 'probe:false', 'a:end', 'b'])
  })

  it('does not exhaust the main pool when many organizations are locked at once', async () => {
    // More concurrent lock holders than the main pool's default 10 clients,
    // each needing a main-pool query while holding its lock.
    const db = await getDb()
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        billingRepository.withOrganizationLock(`${ORG}-many-${i}`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 20))
          const rows = await db.execute(sql`SELECT 1 AS one`)
          return rows.rows.length
        })
      )
    )
    expect(results).toEqual(Array.from({ length: 16 }, () => 1))
  }, 20_000)

  it('leaves no organization lock behind, even behind a transaction pooler', async () => {
    // Behind PgBouncer in transaction mode, a session lock and its unlock can
    // run on different server backends; this must never leave a lock held.
    // Concurrent cycles make a pooler hand consecutive statements of one
    // client to different backends, as production traffic does.
    const organizationIds = [0, 1, 2].map((n) => `${ORG}-leak-${n}`)
    const db = await getDb()
    await Promise.all(
      organizationIds.map(async (organizationId) => {
        for (let i = 0; i < 10; i += 1) {
          await billingRepository.withOrganizationLock(organizationId, async () => {
            await db.execute(sql`SELECT pg_sleep(0.005)`)
          })
        }
      })
    )
    // Only this database and the lock keys used above: advisory locks are
    // per database, and other databases or tests may hold their own. A bigint
    // key is shown as classid (high 32 bits) and objid (low 32 bits).
    const pool = await getPgPool()
    const held = await pool.query(
      `SELECT count(*)::int AS held
         FROM pg_locks l
        WHERE l.locktype = 'advisory'
          AND l.granted
          AND l.objsubid = 1
          AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND ((l.classid::bigint << 32) | l.objid::bigint) IN (
            SELECT hashtextextended('durabull_billing:' || id, 0) FROM unnest($1::text[]) AS id
          )`,
      [organizationIds]
    )
    expect(held.rows[0].held).toBe(0)
  })

  it('never hands one webhook event to two concurrent workers', async () => {
    for (let i = 0; i < 30; i += 1) {
      await billingRepository.recordWebhookEvent({
        id: `${ORG}-evt-${i}`,
        type: 'customer.subscription.updated',
        livemode: false,
        stripeObjectId: 'sub',
        stripeCustomerId: 'cus',
        stripeCreatedAt: new Date(),
      })
    }
    const claims = await Promise.all(
      Array.from({ length: 6 }, () =>
        billingRepository.claimWebhookEvents({ now: new Date(), limit: 10, staleClaimMs: 60_000 })
      )
    )
    const ids = claims
      .flat()
      .map((event) => event.id)
      .filter((id) => id.startsWith(ORG))
    expect(ids).toHaveLength(30)
    expect(new Set(ids).size).toBe(30)
  })
})
