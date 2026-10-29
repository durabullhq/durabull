import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { getDatabaseMode, getDb, getPgLockPool } from '../db/client'
import { alertDestination } from '../db/schemas/alert-destination/schema'
import { alertRule } from '../db/schemas/alert-rule/schema'
import {
  type BillingCheckoutAttemptStatus,
  type BillingLimitsJson,
  type BillingResourceKind,
  billingCheckoutAttempt,
  billingEntitlementOverride,
  billingNoticeDelivery,
  billingOperatorAction,
  billingResourceSuspension,
  billingSubscription,
  billingWebhookEvent,
  organizationBillingAccount,
  organizationEntitlement,
} from '../db/schemas/billing/schema'
import type {
  BillingCheckoutAttempt,
  BillingEntitlementOverride,
  BillingResourceSuspension,
  BillingSubscription,
  BillingWebhookEvent,
  NewBillingSubscription,
  NewOrganizationEntitlement,
  OrganizationBillingAccount,
  OrganizationEntitlement,
} from '../db/schemas/billing/types'
import { mcpServiceAccount } from '../db/schemas/mcp-policy/schema'
import { invitation, member, organization } from '../db/schemas/organization/schema'
import { redisConnection } from '../db/schemas/redis-connection/schema'
import { user } from '../db/schemas/user/schema'

export const CAPACITY_USAGE_KEYS = [
  'connections.enabled',
  'members.reserved',
  'alerts.enabled',
  'alerts.destinations',
  'service_accounts.enabled',
] as const
export type CapacityUsageKey = (typeof CAPACITY_USAGE_KEYS)[number]

/** Error raised by the capacity triggers (SQLSTATE DBL01). */
export interface PlanLimitDbViolation {
  limit: string
  usage: number
  allowed: number
}

function rowsFromExecute<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (
    typeof result === 'object' &&
    result !== null &&
    Array.isArray((result as { rows?: unknown[] }).rows)
  ) {
    return (result as { rows: T[] }).rows
  }
  return []
}

/**
 * Detect a capacity-trigger rejection anywhere in an error's cause chain.
 * Drizzle wraps driver errors, so the SQLSTATE can be nested.
 */
export function parsePlanLimitDbError(error: unknown): PlanLimitDbViolation | null {
  let current: unknown = error
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current === 'object') {
      const record = current as {
        code?: unknown
        detail?: unknown
        message?: unknown
        cause?: unknown
      }
      const isLimit =
        record.code === 'DBL01' ||
        (typeof record.message === 'string' &&
          record.message.includes('durabull_plan_limit_reached'))
      if (isLimit) {
        try {
          const detail = typeof record.detail === 'string' ? JSON.parse(record.detail) : null
          if (detail && typeof detail.limit === 'string') {
            return {
              limit: detail.limit,
              usage: Number(detail.usage) || 0,
              allowed: Number(detail.allowed) || 0,
            }
          }
        } catch {
          // Fall through to an unspecified violation.
        }
        return { limit: 'unknown', usage: 0, allowed: 0 }
      }
      current = record.cause
    } else {
      break
    }
  }
  return null
}

const localOrganizationLocks = new Map<string, Promise<void>>()

/** Longest a request waits behind another replica holding the same organization lock. */
const ORGANIZATION_LOCK_TIMEOUT = '30s'

async function withProcessLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = localOrganizationLocks.get(key) ?? Promise.resolve()
  let release: () => void = () => {}
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const chained = previous.then(() => current)
  localOrganizationLocks.set(key, chained)
  await previous
  try {
    return await fn()
  } finally {
    release()
    if (localOrganizationLocks.get(key) === chained) localOrganizationLocks.delete(key)
  }
}

export const billingRepository = {
  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  /**
   * Run `fn` while holding the organization's billing lock. Reconciliation,
   * entitlement materialization and checkout creation all take this lock so
   * two replicas cannot interleave state changes for one organization.
   */
  async withOrganizationLock<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
    const key = `durabull_billing:${organizationId}`
    return withProcessLock(key, async () => {
      if (getDatabaseMode() !== 'postgres') return fn()
      // A transaction-scoped advisory lock held open on a dedicated client
      // serializes replicas without forcing `fn` into one transaction.
      // Transaction scope matters behind a transaction-pooling proxy such as
      // PgBouncer: a transaction stays on one server backend, whereas a
      // session lock and its unlock can land on different backends and leak.
      // Ending the transaction (or losing the connection) always releases it.
      // The client comes from a separate lock pool so held locks cannot starve
      // `fn` of connections, and lock_timeout bounds the wait.
      const pool = await getPgLockPool()
      const client = await pool.connect()
      let endError: Error | undefined
      try {
        await client.query('BEGIN')
        await client.query(`SET LOCAL lock_timeout = '${ORGANIZATION_LOCK_TIMEOUT}'`)
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key])
        return await fn()
      } finally {
        try {
          // Nothing is written on this client; ending the transaction only
          // releases the lock.
          await client.query('ROLLBACK')
        } catch (error) {
          endError = error instanceof Error ? error : new Error(String(error))
          console.error('[billing] Failed to release organization lock', endError)
        }
        // A connection whose transaction could not be ended is destroyed,
        // which also releases the lock.
        client.release(endError)
      }
    })
  },

  // ---------------------------------------------------------------------------
  // Customer accounts
  // ---------------------------------------------------------------------------

  async findAccount(organizationId: string): Promise<OrganizationBillingAccount | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(organizationBillingAccount)
      .where(eq(organizationBillingAccount.organizationId, organizationId))
      .limit(1)
    return rows[0] ?? null
  },

  async findAccountByCustomerId(customerId: string): Promise<OrganizationBillingAccount | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(organizationBillingAccount)
      .where(eq(organizationBillingAccount.stripeCustomerId, customerId))
      .limit(1)
    return rows[0] ?? null
  },

  /** Bind a customer once; an existing binding is immutable and returned as-is. */
  async bindAccount(input: {
    organizationId: string
    stripeCustomerId: string
    livemode: boolean
    billingContactUserId: string | null
  }): Promise<OrganizationBillingAccount> {
    const db = await getDb()
    await db
      .insert(organizationBillingAccount)
      .values(input)
      .onConflictDoNothing({ target: organizationBillingAccount.organizationId })
    const account = await this.findAccount(input.organizationId)
    if (!account) throw new Error('Failed to bind billing account.')
    return account
  },

  async markTrialConsumed(organizationId: string, at: Date): Promise<void> {
    const db = await getDb()
    await db
      .update(organizationBillingAccount)
      .set({ trialConsumedAt: at, updatedAt: at })
      .where(
        and(
          eq(organizationBillingAccount.organizationId, organizationId),
          isNull(organizationBillingAccount.trialConsumedAt)
        )
      )
  },

  async countTrialsStartedByUser(userId: string): Promise<number> {
    const db = await getDb()
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationBillingAccount)
      .where(
        and(
          eq(organizationBillingAccount.billingContactUserId, userId),
          sql`${organizationBillingAccount.trialConsumedAt} IS NOT NULL`
        )
      )
    return Number(row?.count ?? 0)
  },

  async listAccounts(): Promise<OrganizationBillingAccount[]> {
    const db = await getDb()
    return db
      .select()
      .from(organizationBillingAccount)
      .orderBy(asc(organizationBillingAccount.createdAt))
  },

  // ---------------------------------------------------------------------------
  // Subscription projection
  // ---------------------------------------------------------------------------

  async upsertSubscription(
    data: Omit<NewBillingSubscription, 'id' | 'createdAt' | 'updatedAt' | 'isCurrent'>
  ): Promise<BillingSubscription> {
    const db = await getDb()
    const now = new Date()
    const [row] = await db
      .insert(billingSubscription)
      .values({ ...data, updatedAt: now })
      .onConflictDoUpdate({
        target: billingSubscription.stripeSubscriptionId,
        set: { ...data, updatedAt: now },
      })
      .returning()
    return row
  },

  /** Mark exactly one subscription as current (or none) for the organization. */
  async setCurrentSubscription(
    organizationId: string,
    stripeSubscriptionId: string | null
  ): Promise<void> {
    const db = await getDb()
    await db.transaction(async (tx) => {
      await tx
        .update(billingSubscription)
        .set({ isCurrent: false })
        .where(
          and(
            eq(billingSubscription.organizationId, organizationId),
            eq(billingSubscription.isCurrent, true),
            stripeSubscriptionId
              ? ne(billingSubscription.stripeSubscriptionId, stripeSubscriptionId)
              : sql`true`
          )
        )
      if (stripeSubscriptionId) {
        await tx
          .update(billingSubscription)
          .set({ isCurrent: true })
          .where(
            and(
              eq(billingSubscription.organizationId, organizationId),
              eq(billingSubscription.stripeSubscriptionId, stripeSubscriptionId)
            )
          )
      }
    })
  },

  async findCurrentSubscription(organizationId: string): Promise<BillingSubscription | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(billingSubscription)
      .where(
        and(
          eq(billingSubscription.organizationId, organizationId),
          eq(billingSubscription.isCurrent, true)
        )
      )
      .limit(1)
    return rows[0] ?? null
  },

  async findSubscriptionByStripeId(
    stripeSubscriptionId: string
  ): Promise<BillingSubscription | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(billingSubscription)
      .where(eq(billingSubscription.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1)
    return rows[0] ?? null
  },

  async listSubscriptions(organizationId: string): Promise<BillingSubscription[]> {
    const db = await getDb()
    return db
      .select()
      .from(billingSubscription)
      .where(eq(billingSubscription.organizationId, organizationId))
      .orderBy(desc(billingSubscription.stripeCreatedAt))
  },

  // ---------------------------------------------------------------------------
  // Effective entitlement snapshot
  // ---------------------------------------------------------------------------

  /** Organizations whose stored entitlement is currently enforced by the capacity triggers. */
  async listEnforcedOrganizationIds(): Promise<string[]> {
    const db = await getDb()
    const rows = await db
      .select({ id: organizationEntitlement.organizationId })
      .from(organizationEntitlement)
      .where(eq(organizationEntitlement.enforced, true))
    return rows.map((row) => row.id)
  },

  /** Mark an entitlement informational so the capacity triggers stop enforcing it. */
  async markEntitlementUnenforced(organizationId: string): Promise<void> {
    const db = await getDb()
    await db
      .update(organizationEntitlement)
      .set({ enforced: false, updatedAt: new Date() })
      .where(eq(organizationEntitlement.organizationId, organizationId))
  },

  async findEntitlement(organizationId: string): Promise<OrganizationEntitlement | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(organizationEntitlement)
      .where(eq(organizationEntitlement.organizationId, organizationId))
      .limit(1)
    return rows[0] ?? null
  },

  /**
   * Write the materialized entitlement. The revision increases only when the
   * privileges change so caches on other replicas can detect staleness.
   */
  async saveEntitlement(
    data: Omit<NewOrganizationEntitlement, 'revision' | 'createdAt' | 'updatedAt'>
  ): Promise<OrganizationEntitlement> {
    const db = await getDb()
    const existing = await this.findEntitlement(data.organizationId)
    const privilegesChanged =
      !existing ||
      existing.planCode !== data.planCode ||
      existing.enforced !== (data.enforced ?? false) ||
      existing.degraded !== (data.degraded ?? false) ||
      JSON.stringify(existing.features) !== JSON.stringify(data.features ?? []) ||
      JSON.stringify(existing.limits) !== JSON.stringify(data.limits ?? {})
    const revision = existing ? existing.revision + (privilegesChanged ? 1 : 0) : 1
    const now = new Date()
    const [row] = await db
      .insert(organizationEntitlement)
      .values({ ...data, revision, updatedAt: now })
      .onConflictDoUpdate({
        target: organizationEntitlement.organizationId,
        set: { ...data, revision, updatedAt: now },
      })
      .returning()
    return row
  },

  async setContractLimits(organizationId: string, limits: BillingLimitsJson | null): Promise<void> {
    const db = await getDb()
    await db
      .update(organizationEntitlement)
      .set({ contractLimits: limits, reevaluateAt: new Date() })
      .where(eq(organizationEntitlement.organizationId, organizationId))
  },

  async setMigrationGrant(organizationId: string, expiresAt: Date | null): Promise<void> {
    const db = await getDb()
    await db
      .update(organizationEntitlement)
      .set({ migrationGrantExpiresAt: expiresAt, reevaluateAt: new Date() })
      .where(eq(organizationEntitlement.organizationId, organizationId))
  },

  /** Organizations whose entitlement may change because a recorded deadline passed. */
  async listEntitlementsDue(now: Date, limit = 200): Promise<string[]> {
    const db = await getDb()
    const rows = await db
      .select({ organizationId: organizationEntitlement.organizationId })
      .from(organizationEntitlement)
      .where(
        or(
          lte(organizationEntitlement.reevaluateAt, now),
          lte(organizationEntitlement.graceExpiresAt, now),
          lte(organizationEntitlement.capacityAdjustmentExpiresAt, now),
          lte(organizationEntitlement.migrationGrantExpiresAt, now),
          lte(organizationEntitlement.historyRetentionFloorExpiresAt, now)
        )
      )
      .orderBy(asc(organizationEntitlement.updatedAt))
      .limit(limit)
    return rows.map((row) => row.organizationId)
  },

  async findOrganization(
    organizationId: string
  ): Promise<{ id: string; name: string; slug: string; createdAt: Date } | null> {
    const db = await getDb()
    const rows = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: organization.createdAt,
      })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1)
    return rows[0] ?? null
  },

  async findOrganizationCreatedAt(organizationId: string): Promise<Date | null> {
    const db = await getDb()
    const rows = await db
      .select({ createdAt: organization.createdAt })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1)
    return rows[0]?.createdAt ?? null
  },

  async listAllOrganizationIds(): Promise<Array<{ id: string; createdAt: Date }>> {
    const db = await getDb()
    return db
      .select({ id: organization.id, createdAt: organization.createdAt })
      .from(organization)
      .orderBy(asc(organization.createdAt))
  },

  /** Owners of an organization, oldest first (the first is the founding owner). */
  async listOwners(
    organizationId: string
  ): Promise<Array<{ userId: string; email: string; name: string; createdAt: Date }>> {
    const db = await getDb()
    return db
      .select({
        userId: member.userId,
        email: user.email,
        name: user.name,
        createdAt: member.createdAt,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(and(eq(member.organizationId, organizationId), eq(member.role, 'owner')))
      .orderBy(asc(member.createdAt), asc(member.id))
  },

  /** Organizations whose access currently comes from an unexpired beta transition grant. */
  async listMigrationGrantOrganizations(
    now: Date
  ): Promise<Array<{ id: string; name: string; slug: string; migrationGrantExpiresAt: Date }>> {
    const db = await getDb()
    const rows = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        migrationGrantExpiresAt: organizationEntitlement.migrationGrantExpiresAt,
      })
      .from(organizationEntitlement)
      .innerJoin(organization, eq(organizationEntitlement.organizationId, organization.id))
      .where(
        and(
          eq(organizationEntitlement.source, 'migration_grant'),
          gt(organizationEntitlement.migrationGrantExpiresAt, now)
        )
      )
      .orderBy(asc(organization.createdAt))
    return rows.flatMap((row) =>
      row.migrationGrantExpiresAt
        ? [{ ...row, migrationGrantExpiresAt: row.migrationGrantExpiresAt }]
        : []
    )
  },

  /**
   * Claim one notice email before sending it. Returns null when it was already
   * sent or another worker is sending it; a failed attempt, or one stuck in
   * `sending` since before `staleBefore`, can be claimed again.
   */
  async claimNoticeDelivery(input: {
    organizationId: string
    kind: 'transition_notice' | 'reminder_7d' | 'reminder_1d'
    userId: string
    email: string
    now: Date
    staleBefore: Date
  }): Promise<{ id: string; attempts: number } | null> {
    const db = await getDb()
    const result = await db.execute(sql`
      INSERT INTO ${billingNoticeDelivery}
        (id, organization_id, kind, user_id, email, status, attempts, created_at, updated_at)
      VALUES
        (gen_random_uuid(), ${input.organizationId}, ${input.kind}, ${input.userId},
         ${input.email}, 'sending', 1, ${input.now}, ${input.now})
      ON CONFLICT (organization_id, kind, user_id) DO UPDATE
        SET status = 'sending',
            email = EXCLUDED.email,
            attempts = ${billingNoticeDelivery}.attempts + 1,
            error = NULL,
            updated_at = EXCLUDED.updated_at
        WHERE ${billingNoticeDelivery}.status = 'failed'
           OR (${billingNoticeDelivery}.status = 'sending'
               AND ${billingNoticeDelivery}.updated_at < ${input.staleBefore})
      RETURNING id, attempts
    `)
    return rowsFromExecute<{ id: string; attempts: number }>(result)[0] ?? null
  },

  async completeNoticeDelivery(
    id: string,
    outcome: { sent: true; providerMessageId: string | null } | { sent: false; error: string }
  ): Promise<void> {
    const db = await getDb()
    const now = new Date()
    await db
      .update(billingNoticeDelivery)
      .set(
        outcome.sent
          ? {
              status: 'sent',
              providerMessageId: outcome.providerMessageId,
              sentAt: now,
              updatedAt: now,
            }
          : { status: 'failed', error: outcome.error.slice(0, 1000), updatedAt: now }
      )
      .where(eq(billingNoticeDelivery.id, id))
  },

  /** Whether any owner of the organization has been sent this notice. */
  async hasSentNotice(
    organizationId: string,
    kind: 'transition_notice' | 'reminder_7d' | 'reminder_1d'
  ): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .select({ id: billingNoticeDelivery.id })
      .from(billingNoticeDelivery)
      .where(
        and(
          eq(billingNoticeDelivery.organizationId, organizationId),
          eq(billingNoticeDelivery.kind, kind),
          eq(billingNoticeDelivery.status, 'sent')
        )
      )
      .limit(1)
    return rows.length > 0
  },

  async listNoticeDeliveries(organizationId: string) {
    const db = await getDb()
    return db
      .select()
      .from(billingNoticeDelivery)
      .where(eq(billingNoticeDelivery.organizationId, organizationId))
      .orderBy(asc(billingNoticeDelivery.createdAt))
  },

  async listEntitlements(): Promise<OrganizationEntitlement[]> {
    const db = await getDb()
    return db.select().from(organizationEntitlement)
  },

  // ---------------------------------------------------------------------------
  // Webhook inbox
  // ---------------------------------------------------------------------------

  /** Record an event; returns false when this event id was already stored. */
  async recordWebhookEvent(input: {
    id: string
    type: string
    livemode: boolean
    stripeObjectId: string | null
    stripeCustomerId: string | null
    stripeCreatedAt: Date | null
  }): Promise<boolean> {
    const db = await getDb()
    const inserted = await db
      .insert(billingWebhookEvent)
      // Due by the application clock, which claimWebhookEvents compares
      // against; the database default could be ahead of it.
      .values({ ...input, status: 'pending', nextAttemptAt: new Date() })
      .onConflictDoNothing({ target: billingWebhookEvent.id })
      .returning({ id: billingWebhookEvent.id })
    return inserted.length > 0
  },

  /** Claim due events, recovering claims abandoned by a crashed worker. */
  async claimWebhookEvents(options: {
    now: Date
    limit: number
    staleClaimMs: number
  }): Promise<BillingWebhookEvent[]> {
    const db = await getDb()
    const staleCutoff = new Date(options.now.getTime() - options.staleClaimMs)
    const result = await db.execute(sql`
      UPDATE ${billingWebhookEvent} AS event
      SET status = 'processing',
          claimed_at = ${options.now},
          attempts = event.attempts + 1
      WHERE event.id IN (
        SELECT candidate.id
        FROM ${billingWebhookEvent} AS candidate
        WHERE (
            candidate.status IN ('pending', 'failed')
            AND candidate.next_attempt_at <= ${options.now}
          )
          OR (
            candidate.status = 'processing'
            AND candidate.claimed_at <= ${staleCutoff}
          )
        ORDER BY candidate.stripe_created_at NULLS FIRST, candidate.received_at
        LIMIT ${options.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        event.id,
        event.type,
        event.livemode,
        event.stripe_object_id AS "stripeObjectId",
        event.stripe_customer_id AS "stripeCustomerId",
        event.organization_id AS "organizationId",
        event.status,
        event.attempts,
        event.next_attempt_at AS "nextAttemptAt",
        event.claimed_at AS "claimedAt",
        event.last_error AS "lastError",
        event.stripe_created_at AS "stripeCreatedAt",
        event.received_at AS "receivedAt",
        event.processed_at AS "processedAt"
    `)
    return rowsFromExecute<BillingWebhookEvent>(result)
  },

  async markWebhookProcessed(id: string, organizationId: string | null): Promise<void> {
    const db = await getDb()
    await db
      .update(billingWebhookEvent)
      .set({ status: 'processed', processedAt: new Date(), lastError: null, organizationId })
      .where(eq(billingWebhookEvent.id, id))
  },

  async markWebhookFailed(
    id: string,
    input: { error: string; nextAttemptAt: Date | null; organizationId?: string | null }
  ): Promise<void> {
    const db = await getDb()
    await db
      .update(billingWebhookEvent)
      .set({
        status: input.nextAttemptAt ? 'failed' : 'dead',
        lastError: input.error.slice(0, 500),
        nextAttemptAt: input.nextAttemptAt ?? new Date(),
        ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      })
      .where(eq(billingWebhookEvent.id, id))
  },

  async retryWebhookEvent(id: string): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .update(billingWebhookEvent)
      .set({ status: 'pending', nextAttemptAt: new Date(), lastError: null })
      .where(
        and(eq(billingWebhookEvent.id, id), inArray(billingWebhookEvent.status, ['failed', 'dead']))
      )
      .returning({ id: billingWebhookEvent.id })
    return rows.length > 0
  },

  async listWebhookEvents(options: {
    statuses?: BillingWebhookEvent['status'][]
    limit?: number
  }): Promise<BillingWebhookEvent[]> {
    const db = await getDb()
    return db
      .select()
      .from(billingWebhookEvent)
      .where(options.statuses ? inArray(billingWebhookEvent.status, options.statuses) : sql`true`)
      .orderBy(desc(billingWebhookEvent.receivedAt))
      .limit(options.limit ?? 50)
  },

  async webhookInboxStats(now: Date): Promise<{
    pending: number
    failed: number
    dead: number
    oldestPendingAgeMs: number | null
  }> {
    const db = await getDb()
    const [row] = await db
      .select({
        pending: sql<number>`count(*) filter (where ${billingWebhookEvent.status} in ('pending', 'processing'))::int`,
        failed: sql<number>`count(*) filter (where ${billingWebhookEvent.status} = 'failed')::int`,
        dead: sql<number>`count(*) filter (where ${billingWebhookEvent.status} = 'dead')::int`,
        oldest: sql<Date | null>`min(${billingWebhookEvent.receivedAt}) filter (where ${billingWebhookEvent.status} in ('pending', 'processing', 'failed'))`,
      })
      .from(billingWebhookEvent)
    const oldest = row?.oldest ? new Date(row.oldest) : null
    return {
      pending: Number(row?.pending ?? 0),
      failed: Number(row?.failed ?? 0),
      dead: Number(row?.dead ?? 0),
      oldestPendingAgeMs: oldest ? now.getTime() - oldest.getTime() : null,
    }
  },

  // ---------------------------------------------------------------------------
  // Checkout attempts
  // ---------------------------------------------------------------------------

  async findOpenCheckoutAttempt(organizationId: string): Promise<BillingCheckoutAttempt | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(billingCheckoutAttempt)
      .where(
        and(
          eq(billingCheckoutAttempt.organizationId, organizationId),
          eq(billingCheckoutAttempt.status, 'open')
        )
      )
      .limit(1)
    return rows[0] ?? null
  },

  /** Create the single open attempt; returns null when another one already exists. */
  async createCheckoutAttempt(input: {
    organizationId: string
    createdByUserId: string | null
    planCode: string
    billingInterval: string
    stripePriceId: string
    trial: boolean
    idempotencyKey: string
    expiresAt: Date
  }): Promise<BillingCheckoutAttempt | null> {
    const db = await getDb()
    const rows = await db
      .insert(billingCheckoutAttempt)
      .values({ ...input, status: 'open' })
      .onConflictDoNothing()
      .returning()
    return rows[0] ?? null
  },

  async attachCheckoutSession(id: string, sessionId: string, url: string | null): Promise<void> {
    const db = await getDb()
    await db
      .update(billingCheckoutAttempt)
      .set({ stripeSessionId: sessionId, url, updatedAt: new Date() })
      .where(eq(billingCheckoutAttempt.id, id))
  },

  async setCheckoutAttemptStatus(
    where: { id: string } | { stripeSessionId: string },
    status: BillingCheckoutAttemptStatus
  ): Promise<BillingCheckoutAttempt | null> {
    const db = await getDb()
    const condition =
      'id' in where
        ? eq(billingCheckoutAttempt.id, where.id)
        : eq(billingCheckoutAttempt.stripeSessionId, where.stripeSessionId)
    const rows = await db
      .update(billingCheckoutAttempt)
      .set({ status, updatedAt: new Date() })
      .where(and(condition, eq(billingCheckoutAttempt.status, 'open')))
      .returning()
    return rows[0] ?? null
  },

  async findCheckoutAttemptBySession(sessionId: string): Promise<BillingCheckoutAttempt | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(billingCheckoutAttempt)
      .where(eq(billingCheckoutAttempt.stripeSessionId, sessionId))
      .limit(1)
    return rows[0] ?? null
  },

  async listExpiredCheckoutAttempts(now: Date): Promise<BillingCheckoutAttempt[]> {
    const db = await getDb()
    return db
      .select()
      .from(billingCheckoutAttempt)
      .where(
        and(eq(billingCheckoutAttempt.status, 'open'), lte(billingCheckoutAttempt.expiresAt, now))
      )
      .limit(100)
  },

  // ---------------------------------------------------------------------------
  // Resource suspension
  // ---------------------------------------------------------------------------

  async listSuspensions(organizationId: string): Promise<BillingResourceSuspension[]> {
    const db = await getDb()
    return db
      .select()
      .from(billingResourceSuspension)
      .where(eq(billingResourceSuspension.organizationId, organizationId))
      .orderBy(asc(billingResourceSuspension.createdAt))
  },

  async isSuspended(kind: BillingResourceKind, resourceId: string): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .select({ id: billingResourceSuspension.id })
      .from(billingResourceSuspension)
      .where(
        and(
          eq(billingResourceSuspension.resourceKind, kind),
          eq(billingResourceSuspension.resourceId, resourceId)
        )
      )
      .limit(1)
    return rows.length > 0
  },

  async suspendedIds(organizationId: string, kind: BillingResourceKind): Promise<Set<string>> {
    const db = await getDb()
    const rows = await db
      .select({ resourceId: billingResourceSuspension.resourceId })
      .from(billingResourceSuspension)
      .where(
        and(
          eq(billingResourceSuspension.organizationId, organizationId),
          eq(billingResourceSuspension.resourceKind, kind)
        )
      )
    return new Set(rows.map((row) => row.resourceId))
  },

  /** Every suspended resource of a kind across organizations (for background workers). */
  async allSuspendedIds(kind: BillingResourceKind): Promise<Set<string>> {
    const db = await getDb()
    const rows = await db
      .select({ resourceId: billingResourceSuspension.resourceId })
      .from(billingResourceSuspension)
      .where(eq(billingResourceSuspension.resourceKind, kind))
    return new Set(rows.map((row) => row.resourceId))
  },

  async suspend(
    organizationId: string,
    items: Array<{ kind: BillingResourceKind; resourceId: string }>,
    reason: string
  ): Promise<void> {
    if (items.length === 0) return
    const db = await getDb()
    await db
      .insert(billingResourceSuspension)
      .values(
        items.map((item) => ({
          organizationId,
          resourceKind: item.kind,
          resourceId: item.resourceId,
          reason,
        }))
      )
      .onConflictDoNothing()
  },

  async unsuspend(
    organizationId: string,
    items?: Array<{ kind: BillingResourceKind; resourceId: string }>
  ): Promise<number> {
    const db = await getDb()
    if (!items) {
      const rows = await db
        .delete(billingResourceSuspension)
        .where(eq(billingResourceSuspension.organizationId, organizationId))
        .returning({ id: billingResourceSuspension.id })
      return rows.length
    }
    let removed = 0
    for (const item of items) {
      const rows = await db
        .delete(billingResourceSuspension)
        .where(
          and(
            eq(billingResourceSuspension.organizationId, organizationId),
            eq(billingResourceSuspension.resourceKind, item.kind),
            eq(billingResourceSuspension.resourceId, item.resourceId)
          )
        )
        .returning({ id: billingResourceSuspension.id })
      removed += rows.length
    }
    return removed
  },

  // ---------------------------------------------------------------------------
  // Overrides (each row is also the audit record)
  // ---------------------------------------------------------------------------

  /** Record a manual billing change or organization deletion for audit. */
  async recordOperatorAction(input: {
    organizationId: string
    action: string
    actor: string
    reason: string
    details?: Record<string, unknown> | null
  }): Promise<void> {
    const db = await getDb()
    await db.insert(billingOperatorAction).values({
      organizationId: input.organizationId,
      action: input.action,
      actor: input.actor,
      reason: input.reason,
      details: input.details ?? null,
    })
  },

  async listOperatorActions(organizationId: string) {
    const db = await getDb()
    return db
      .select()
      .from(billingOperatorAction)
      .where(eq(billingOperatorAction.organizationId, organizationId))
      .orderBy(desc(billingOperatorAction.createdAt))
  },

  async createOverride(input: {
    organizationId: string
    planCode: string
    limits: BillingLimitsJson | null
    reason: string
    createdBy: string
    expiresAt: Date
  }): Promise<BillingEntitlementOverride> {
    const db = await getDb()
    const [row] = await db.insert(billingEntitlementOverride).values(input).returning()
    return row
  },

  async revokeOverride(id: string, revokedBy: string): Promise<BillingEntitlementOverride | null> {
    const db = await getDb()
    const rows = await db
      .update(billingEntitlementOverride)
      .set({ revokedAt: new Date(), revokedBy })
      .where(
        and(eq(billingEntitlementOverride.id, id), isNull(billingEntitlementOverride.revokedAt))
      )
      .returning()
    return rows[0] ?? null
  },

  async findActiveOverride(
    organizationId: string,
    now: Date
  ): Promise<BillingEntitlementOverride | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(billingEntitlementOverride)
      .where(
        and(
          eq(billingEntitlementOverride.organizationId, organizationId),
          isNull(billingEntitlementOverride.revokedAt),
          gt(billingEntitlementOverride.expiresAt, now)
        )
      )
      .orderBy(desc(billingEntitlementOverride.createdAt))
      .limit(1)
    return rows[0] ?? null
  },

  async listOverrides(organizationId: string): Promise<BillingEntitlementOverride[]> {
    const db = await getDb()
    return db
      .select()
      .from(billingEntitlementOverride)
      .where(eq(billingEntitlementOverride.organizationId, organizationId))
      .orderBy(desc(billingEntitlementOverride.createdAt))
  },

  // ---------------------------------------------------------------------------
  // Usage and capacity candidates
  // ---------------------------------------------------------------------------

  /** Usage counted by the same SQL the capacity triggers use. */
  async getUsage(organizationId: string): Promise<Record<CapacityUsageKey, number>> {
    const db = await getDb()
    const result = await db.execute(sql`
      SELECT
        durabull_capacity_usage(${organizationId}, 'connections.enabled') AS "connections",
        durabull_capacity_usage(${organizationId}, 'members.reserved') AS "members",
        durabull_capacity_usage(${organizationId}, 'alerts.enabled') AS "alerts",
        durabull_capacity_usage(${organizationId}, 'alerts.destinations') AS "destinations",
        durabull_capacity_usage(${organizationId}, 'service_accounts.enabled') AS "serviceAccounts"
    `)
    const [row] = rowsFromExecute<Record<string, unknown>>(result)
    return {
      'connections.enabled': Number(row?.connections ?? 0),
      'members.reserved': Number(row?.members ?? 0),
      'alerts.enabled': Number(row?.alerts ?? 0),
      'alerts.destinations': Number(row?.destinations ?? 0),
      'service_accounts.enabled': Number(row?.serviceAccounts ?? 0),
    }
  },

  async listCapacityCandidates(organizationId: string) {
    const db = await getDb()
    const [connections, members, invitations, rules, destinations, serviceAccounts] =
      await Promise.all([
        db
          .select({
            id: redisConnection.id,
            name: redisConnection.name,
            createdAt: redisConnection.createdAt,
          })
          .from(redisConnection)
          .where(
            and(
              eq(redisConnection.organizationId, organizationId),
              eq(redisConnection.enabled, true)
            )
          ),
        db
          .select({
            id: member.id,
            userId: member.userId,
            role: member.role,
            createdAt: member.createdAt,
            name: user.name,
            email: user.email,
          })
          .from(member)
          .innerJoin(user, eq(member.userId, user.id))
          .where(eq(member.organizationId, organizationId)),
        db
          .select({ id: invitation.id, email: invitation.email, createdAt: invitation.createdAt })
          .from(invitation)
          .where(
            and(
              eq(invitation.organizationId, organizationId),
              eq(invitation.status, 'pending'),
              gt(invitation.expiresAt, new Date())
            )
          ),
        db
          .select({
            id: alertRule.id,
            name: alertRule.name,
            connectionId: alertRule.connectionId,
            createdAt: alertRule.createdAt,
          })
          .from(alertRule)
          .where(
            and(
              eq(alertRule.organizationId, organizationId),
              eq(alertRule.enabled, true),
              isNull(alertRule.deletionRequestedAt)
            )
          ),
        db
          .select({
            id: alertDestination.id,
            name: alertDestination.name,
            type: alertDestination.type,
            createdAt: alertDestination.createdAt,
          })
          .from(alertDestination)
          .where(eq(alertDestination.organizationId, organizationId)),
        db
          .select({
            id: mcpServiceAccount.id,
            name: mcpServiceAccount.name,
            createdAt: mcpServiceAccount.createdAt,
          })
          .from(mcpServiceAccount)
          .where(
            and(
              eq(mcpServiceAccount.organizationId, organizationId),
              eq(mcpServiceAccount.disabled, false)
            )
          ),
      ])
    return { connections, members, invitations, rules, destinations, serviceAccounts }
  },

  /** Find the organization's member row for a user (role and suspension checks). */
  async findMembership(
    organizationId: string,
    userId: string
  ): Promise<{ id: string; role: string } | null> {
    const db = await getDb()
    const rows = await db
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
      .limit(1)
    return rows[0] ?? null
  },

  async isMemberSuspended(organizationId: string, userId: string): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .select({ id: billingResourceSuspension.id })
      .from(billingResourceSuspension)
      .innerJoin(
        member,
        and(
          eq(billingResourceSuspension.resourceKind, 'member'),
          eq(billingResourceSuspension.resourceId, member.id)
        )
      )
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
      .limit(1)
    return rows.length > 0
  },
}
