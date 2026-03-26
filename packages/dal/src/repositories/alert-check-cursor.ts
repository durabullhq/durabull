import { and, eq } from 'drizzle-orm'
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
  }): Promise<AlertCheckCursor> {
    const db = await getDb()
    const now = new Date()

    const [row] = await db
      .insert(alertCheckCursor)
      .values(data)
      .onConflictDoUpdate({
        target: [alertCheckCursor.connectionId, alertCheckCursor.queueName],
        set: {
          lastCheckedAt: data.lastCheckedAt,
          lastFailedCount: data.lastFailedCount,
          lastCompletedCount: data.lastCompletedCount,
          lastMetricsSnapshot: data.lastMetricsSnapshot ?? null,
          updatedAt: now,
        },
      })
      .returning()

    return row
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
