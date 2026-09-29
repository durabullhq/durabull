import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { alertCheckCursor } from '../db/schemas/alert-check-cursor/schema'
import type { AlertCheckCursor } from '../db/schemas/alert-check-cursor/types'

export const alertCheckCursorRepository = {
  async upsert(data: {
    connectionId: string
    queueName: string
    lastCheckedAt: Date
    lastFailedCount: number
    lastCompletedCount: number
    lastMetricsSnapshot?: unknown
    observationToken?: string
  }): Promise<AlertCheckCursor> {
    const db = await getDb()
    const now = new Date()
    const observationToken = data.observationToken ?? randomUUID()

    const [updated] = await db
      .insert(alertCheckCursor)
      .values({
        connectionId: data.connectionId,
        queueName: data.queueName,
        lastCheckedAt: data.lastCheckedAt,
        lastObservationToken: observationToken,
        lastFailedCount: data.lastFailedCount,
        lastCompletedCount: data.lastCompletedCount,
        lastMetricsSnapshot: data.lastMetricsSnapshot,
      })
      .onConflictDoUpdate({
        target: [alertCheckCursor.connectionId, alertCheckCursor.queueName],
        set: {
          lastCheckedAt: data.lastCheckedAt,
          lastObservationToken: observationToken,
          lastFailedCount: data.lastFailedCount,
          lastCompletedCount: data.lastCompletedCount,
          lastMetricsSnapshot: data.lastMetricsSnapshot ?? null,
          updatedAt: now,
        },
        setWhere: sql`${alertCheckCursor.lastCheckedAt} < ${data.lastCheckedAt}
          OR (
            ${alertCheckCursor.lastCheckedAt} = ${data.lastCheckedAt}
            AND ${alertCheckCursor.lastObservationToken} <= ${observationToken}
          )`,
      })
      .returning()

    if (updated) return updated

    const current = await this.findByConnectionQueue(data.connectionId, data.queueName)
    if (!current) throw new Error('Alert check cursor conflict could not be resolved.')
    return current
  },

  async findByConnectionQueue(
    connectionId: string,
    queueName: string
  ): Promise<AlertCheckCursor | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(alertCheckCursor)
      .where(
        and(
          eq(alertCheckCursor.connectionId, connectionId),
          eq(alertCheckCursor.queueName, queueName)
        )
      )
      .limit(1)

    return rows[0] ?? null
  },

  async findByConnection(connectionId: string): Promise<AlertCheckCursor[]> {
    const db = await getDb()
    return db.select().from(alertCheckCursor).where(eq(alertCheckCursor.connectionId, connectionId))
  },

  async deleteByConnection(connectionId: string): Promise<number> {
    const db = await getDb()
    const rows = await db
      .delete(alertCheckCursor)
      .where(eq(alertCheckCursor.connectionId, connectionId))
      .returning({ id: alertCheckCursor.id })

    return rows.length
  },
}
