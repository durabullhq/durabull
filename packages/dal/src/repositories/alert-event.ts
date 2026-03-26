import { uuidv7 } from '@durabull/utils/uuid'
import { and, desc, eq, lt, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { alertEvent, type AlertEventStatus } from '../db/schemas/alert-event/schema'
import type { AlertEvent, NewAlertEvent } from '../db/schemas/alert-event/types'

function toNumber(value: number | string | bigint | null | undefined): number {
  if (value === null || value === undefined) return 0
  return Number(value)
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

  async findByConnection(
    connectionId: string,
    organizationId: string,
    options: { offset: number; limit: number; status?: AlertEventStatus }
  ): Promise<AlertEvent[]> {
    const db = await getDb()
    return db
      .select()
      .from(alertEvent)
      .where(
        and(
          eq(alertEvent.connectionId, connectionId),
          eq(alertEvent.organizationId, organizationId),
          ...(options.status ? [eq(alertEvent.status, options.status)] : [])
        )
      )
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
