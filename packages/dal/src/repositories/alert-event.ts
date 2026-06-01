import { uuidv7 } from '@durabull/utils/uuid'
import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { type AlertEventStatus, alertEvent } from '../db/schemas/alert-event/schema'
import type { AlertEvent, NewAlertEvent } from '../db/schemas/alert-event/types'

function toNumber(value: number | string | bigint | null | undefined): number {
  if (value === null || value === undefined) return 0
  return Number(value)
}

function buildAlertEventConnectionFilter(
  connectionId: string,
  organizationId: string,
  options: {
    status?: AlertEventStatus
    queueName?: string
    jobId?: string
  }
) {
  return and(
    eq(alertEvent.connectionId, connectionId),
    eq(alertEvent.organizationId, organizationId),
    ...(options.status ? [eq(alertEvent.status, options.status)] : []),
    ...(options.queueName ? [eq(alertEvent.queueName, options.queueName)] : []),
    ...(options.jobId ? [sql`${alertEvent.context}->>'jobId' = ${options.jobId}`] : [])
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

  async countByConnection(
    connectionId: string,
    organizationId: string,
    options: {
      status?: AlertEventStatus
      queueName?: string
      jobId?: string
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
    }
  ): Promise<AlertEvent[]> {
    const db = await getDb()
    return db
      .select()
      .from(alertEvent)
      .where(buildAlertEventConnectionFilter(connectionId, organizationId, options))
      .orderBy(desc(alertEvent.firedAt))
      .offset(options.offset)
      .limit(options.limit)
  },

  async findByOrganization(
    organizationId: string,
    options: { offset: number; limit: number; status?: AlertEventStatus }
  ): Promise<AlertEvent[]> {
    const db = await getDb()
    return db
      .select()
      .from(alertEvent)
      .where(
        and(
          eq(alertEvent.organizationId, organizationId),
          ...(options.status ? [eq(alertEvent.status, options.status)] : [])
        )
      )
      .orderBy(desc(alertEvent.firedAt))
      .offset(options.offset)
      .limit(options.limit)
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
