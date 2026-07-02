import { uuidv7 } from '@durabull/utils/uuid'
import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { type AlertEventStatus, alertEvent } from '../db/schemas/alert-event/schema'
import type { AlertEvent, NewAlertEvent } from '../db/schemas/alert-event/types'
import { user } from '../db/schemas/user/schema'

export type AlertEventWithAckUser = AlertEvent & { acknowledgedByName: string | null }

export interface OrganizationOpenAlertSummary {
  connectionId: string
  firing: number
  acknowledged: number
  open: number
}

function toNumber(value: number | string | bigint | null | undefined): number {
  if (value === null || value === undefined) return 0
  return Number(value)
}

function acknowledgedFilter(acknowledged: boolean | undefined) {
  if (acknowledged === undefined) return []
  return [
    acknowledged ? isNotNull(alertEvent.acknowledgedAt) : isNull(alertEvent.acknowledgedAt),
  ]
}

function buildAlertEventConnectionFilter(
  connectionId: string,
  organizationId: string,
  options: {
    status?: AlertEventStatus
    queueName?: string
    jobId?: string
    acknowledged?: boolean
    alertRuleId?: string
  }
) {
  return and(
    eq(alertEvent.connectionId, connectionId),
    eq(alertEvent.organizationId, organizationId),
    ...(options.status ? [eq(alertEvent.status, options.status)] : []),
    ...(options.queueName ? [eq(alertEvent.queueName, options.queueName)] : []),
    ...(options.jobId ? [sql`${alertEvent.context}->>'jobId' = ${options.jobId}`] : []),
    ...(options.alertRuleId ? [eq(alertEvent.alertRuleId, options.alertRuleId)] : []),
    ...acknowledgedFilter(options.acknowledged)
  )
}

export const alertEventRepository = {
  async create(data: Omit<NewAlertEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<AlertEvent> {
    const db = await getDb()
    const id = uuidv7()

    const [result] = await db
      .insert(alertEvent)
      .values({
        id,
        ...data,
      })
      .returning()

    return result
  },

  async createOrGetByDedupeKey(
    data: Omit<NewAlertEvent, 'id' | 'createdAt' | 'updatedAt'> & { dedupeKey: string }
  ): Promise<{ event: AlertEvent; created: boolean }> {
    const db = await getDb()
    const id = uuidv7()

    const [inserted] = await db
      .insert(alertEvent)
      .values({
        id,
        ...data,
      })
      .onConflictDoNothing({
        target: [alertEvent.alertRuleId, alertEvent.dedupeKey],
      })
      .returning()

    if (inserted) {
      return { event: inserted, created: true }
    }

    const rows = await db
      .select()
      .from(alertEvent)
      .where(
        and(eq(alertEvent.alertRuleId, data.alertRuleId), eq(alertEvent.dedupeKey, data.dedupeKey))
      )
      .limit(1)

    if (!rows[0]) {
      throw new Error('Alert event dedupe conflict could not be resolved.')
    }

    return { event: rows[0], created: false }
  },

  async findById(id: string, organizationId: string): Promise<AlertEvent | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(alertEvent)
      .where(and(eq(alertEvent.id, id), eq(alertEvent.organizationId, organizationId)))
      .limit(1)

    return rows[0] ?? null
  },

  async findActiveFiring(alertRuleId: string, queueName: string): Promise<AlertEvent | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(alertEvent)
      .where(
        and(
          eq(alertEvent.alertRuleId, alertRuleId),
          eq(alertEvent.queueName, queueName),
          eq(alertEvent.status, 'firing')
        )
      )
      .orderBy(desc(alertEvent.firedAt))
      .limit(1)

    return rows[0] ?? null
  },

  async findMostRecentForRule(alertRuleId: string, queueName: string): Promise<AlertEvent | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(alertEvent)
      .where(and(eq(alertEvent.alertRuleId, alertRuleId), eq(alertEvent.queueName, queueName)))
      .orderBy(desc(alertEvent.firedAt))
      .limit(1)

    return rows[0] ?? null
  },

  /**
   * Most recent non-suppressed event for (rule, queue). The cooldown window
   * must anchor to this event — anchoring to suppressed events would extend
   * the window on every suppression and silence the rule permanently.
   */
  async findMostRecentFiredForRule(
    alertRuleId: string,
    queueName: string
  ): Promise<AlertEvent | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(alertEvent)
      .where(
        and(
          eq(alertEvent.alertRuleId, alertRuleId),
          eq(alertEvent.queueName, queueName),
          ne(alertEvent.status, 'suppressed')
        )
      )
      .orderBy(desc(alertEvent.firedAt))
      .limit(1)

    return rows[0] ?? null
  },

  /**
   * Record a cooldown suppression. Coalesces to one suppressed event per
   * cooldown window via dedupeKey ("suppressed:{anchorEventId}"), bumping
   * context.suppressedCount on repeat suppressions within the same window.
   */
  async upsertSuppressed(data: {
    alertRuleId: string
    organizationId: string
    connectionId: string
    queueName: string
    type: string
    summary: string
    context: Record<string, unknown>
    dedupeKey: string
  }): Promise<{ event: AlertEvent; created: boolean }> {
    const db = await getDb()
    const now = new Date()
    const nowIso = now.toISOString()

    const [event] = await db
      .insert(alertEvent)
      .values({
        id: uuidv7(),
        alertRuleId: data.alertRuleId,
        organizationId: data.organizationId,
        connectionId: data.connectionId,
        queueName: data.queueName,
        type: data.type,
        status: 'suppressed',
        summary: data.summary,
        context: { ...data.context, suppressedCount: 1, lastSuppressedAt: nowIso },
        dedupeKey: data.dedupeKey,
        firedAt: now,
      })
      .onConflictDoUpdate({
        target: [alertEvent.alertRuleId, alertEvent.dedupeKey],
        set: {
          summary: data.summary,
          context: sql`jsonb_set(
            jsonb_set(
              coalesce(${alertEvent.context}, '{}'::jsonb),
              '{suppressedCount}',
              to_jsonb(coalesce((${alertEvent.context}->>'suppressedCount')::int, 0) + 1)
            ),
            '{lastSuppressedAt}',
            to_jsonb(${nowIso}::text)
          )`,
          updatedAt: now,
        },
      })
      .returning()

    const suppressedCount =
      event.context && typeof event.context === 'object'
        ? Number((event.context as Record<string, unknown>).suppressedCount ?? 0)
        : 0

    return { event, created: suppressedCount <= 1 }
  },

  async acknowledge(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<AlertEvent | null> {
    const db = await getDb()
    const [row] = await db
      .update(alertEvent)
      .set({
        acknowledgedAt: new Date(),
        acknowledgedBy: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(alertEvent.id, id),
          eq(alertEvent.organizationId, organizationId),
          eq(alertEvent.status, 'firing'),
          isNull(alertEvent.acknowledgedAt)
        )
      )
      .returning()

    return row ?? null
  },

  async unacknowledge(id: string, organizationId: string): Promise<AlertEvent | null> {
    const db = await getDb()
    const [row] = await db
      .update(alertEvent)
      .set({
        acknowledgedAt: null,
        acknowledgedBy: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(alertEvent.id, id),
          eq(alertEvent.organizationId, organizationId),
          eq(alertEvent.status, 'firing'),
          isNotNull(alertEvent.acknowledgedAt)
        )
      )
      .returning()

    return row ?? null
  },

  async countByConnection(
    connectionId: string,
    organizationId: string,
    options: {
      status?: AlertEventStatus
      queueName?: string
      jobId?: string
      acknowledged?: boolean
      alertRuleId?: string
    }
  ): Promise<number> {
    const db = await getDb()
    const [row] = await db
      .select({
        total: sql<number>`count(*)`,
      })
      .from(alertEvent)
      .where(buildAlertEventConnectionFilter(connectionId, organizationId, options))

    return toNumber(row?.total)
  },

  async findByConnection(
    connectionId: string,
    organizationId: string,
    options: {
      offset: number
      limit: number
      status?: AlertEventStatus
      queueName?: string
      jobId?: string
      acknowledged?: boolean
      alertRuleId?: string
    }
  ): Promise<AlertEventWithAckUser[]> {
    const db = await getDb()
    const rows = await db
      .select({ event: alertEvent, acknowledgedByName: user.name })
      .from(alertEvent)
      .leftJoin(user, eq(alertEvent.acknowledgedBy, user.id))
      .where(buildAlertEventConnectionFilter(connectionId, organizationId, options))
      .orderBy(desc(alertEvent.firedAt))
      .offset(options.offset)
      .limit(options.limit)

    return rows.map((row) => ({ ...row.event, acknowledgedByName: row.acknowledgedByName ?? null }))
  },

  async findByOrganization(
    organizationId: string,
    options: {
      offset: number
      limit: number
      status?: AlertEventStatus
      acknowledged?: boolean
    }
  ): Promise<AlertEventWithAckUser[]> {
    const db = await getDb()
    const rows = await db
      .select({ event: alertEvent, acknowledgedByName: user.name })
      .from(alertEvent)
      .leftJoin(user, eq(alertEvent.acknowledgedBy, user.id))
      .where(
        and(
          eq(alertEvent.organizationId, organizationId),
          ...(options.status ? [eq(alertEvent.status, options.status)] : []),
          ...acknowledgedFilter(options.acknowledged)
        )
      )
      .orderBy(desc(alertEvent.firedAt))
      .offset(options.offset)
      .limit(options.limit)

    return rows.map((row) => ({ ...row.event, acknowledgedByName: row.acknowledgedByName ?? null }))
  },

  async findByRule(
    alertRuleId: string,
    options: { offset: number; limit: number }
  ): Promise<AlertEvent[]> {
    const db = await getDb()
    return db
      .select()
      .from(alertEvent)
      .where(eq(alertEvent.alertRuleId, alertRuleId))
      .orderBy(desc(alertEvent.firedAt))
      .offset(options.offset)
      .limit(options.limit)
  },

  async countFiringByOrganization(
    organizationId: string
  ): Promise<{ connectionId: string; count: number }[]> {
    const db = await getDb()
    const rows = await db
      .select({
        connectionId: alertEvent.connectionId,
        count: sql<number>`count(*)`,
      })
      .from(alertEvent)
      .where(and(eq(alertEvent.organizationId, organizationId), eq(alertEvent.status, 'firing')))
      .groupBy(alertEvent.connectionId)

    return rows.map((row) => ({
      connectionId: row.connectionId,
      count: toNumber(row.count),
    }))
  },

  /**
   * Open (firing) events per connection, split by acknowledgement.
   * Acknowledged events are still open — ack is who/when, not a resolution.
   */
  async summarizeOpenByOrganization(
    organizationId: string
  ): Promise<OrganizationOpenAlertSummary[]> {
    const db = await getDb()
    const rows = await db
      .select({
        connectionId: alertEvent.connectionId,
        firing: sql<number>`count(*) filter (where ${alertEvent.acknowledgedAt} is null)`,
        acknowledged: sql<number>`count(*) filter (where ${alertEvent.acknowledgedAt} is not null)`,
      })
      .from(alertEvent)
      .where(and(eq(alertEvent.organizationId, organizationId), eq(alertEvent.status, 'firing')))
      .groupBy(alertEvent.connectionId)

    return rows.map((row) => {
      const firing = toNumber(row.firing)
      const acknowledged = toNumber(row.acknowledged)
      return { connectionId: row.connectionId, firing, acknowledged, open: firing + acknowledged }
    })
  },

  /**
   * Firing events that reference an individual job (context.jobId), across all
   * organizations. Used by the background monitor to auto-resolve alerts whose
   * job has since completed. Ordered oldest-first so long-firing events are
   * checked before fresh ones when the limit truncates the sweep.
   */
  async findFiringJobEvents(options: { limit: number }): Promise<AlertEvent[]> {
    const db = await getDb()
    return db
      .select()
      .from(alertEvent)
      .where(and(eq(alertEvent.status, 'firing'), sql`${alertEvent.context}->>'jobId' IS NOT NULL`))
      .orderBy(alertEvent.firedAt)
      .limit(options.limit)
  },

  async resolve(id: string, organizationId: string): Promise<AlertEvent | null> {
    const db = await getDb()
    const [row] = await db
      .update(alertEvent)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(alertEvent.id, id), eq(alertEvent.organizationId, organizationId)))
      .returning()

    return row ?? null
  },

  /**
   * Resolve many events at once, scoped to an organization (and optionally a
   * connection). Only rows still `firing` are touched, so the returned rows are
   * exactly the events this call transitioned — callers use them to fan out
   * post-resolution side effects (e.g. closing linked Linear issues).
   */
  async resolveMany(
    ids: string[],
    organizationId: string,
    options: { connectionId?: string } = {}
  ): Promise<AlertEvent[]> {
    if (ids.length === 0) return []
    const db = await getDb()
    const now = new Date()

    return db
      .update(alertEvent)
      .set({
        status: 'resolved',
        resolvedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          inArray(alertEvent.id, ids),
          eq(alertEvent.organizationId, organizationId),
          eq(alertEvent.status, 'firing'),
          ...(options.connectionId ? [eq(alertEvent.connectionId, options.connectionId)] : [])
        )
      )
      .returning()
  },

  async markNotificationSent(id: string): Promise<void> {
    const db = await getDb()
    await db
      .update(alertEvent)
      .set({
        notificationSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(alertEvent.id, id))
  },

  async resolveAllForRule(alertRuleId: string): Promise<number> {
    const db = await getDb()
    const now = new Date()
    const result = await db.execute(
      sql`UPDATE ${alertEvent}
          SET status = 'resolved', resolved_at = ${now}, updated_at = ${now}
          WHERE ${alertEvent.alertRuleId} = ${alertRuleId}
            AND ${alertEvent.status} = 'firing'`
    )

    return toNumber((result as { rowCount?: number }).rowCount)
  },

  async deleteOlderThan(days: number): Promise<number> {
    const db = await getDb()
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const result = await db.execute(
      sql`DELETE FROM ${alertEvent} WHERE ${alertEvent.firedAt} < ${cutoff}`
    )

    return toNumber((result as { rowCount?: number }).rowCount)
  },
}
