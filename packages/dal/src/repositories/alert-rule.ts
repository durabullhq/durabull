import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  alertRule,
  type AlertRuleType,
  type QueueFilterMode,
} from '../db/schemas/alert-rule/schema'
import type { AlertRule } from '../db/schemas/alert-rule/types'

export const alertRuleRepository = {
  async create(data: {
    organizationId: string
    connectionId: string
    queueName?: string | null
    name: string
    type: AlertRuleType
    config: unknown
    enabled?: boolean
    notificationChannels?: unknown
    cooldownMinutes?: number
    queueFilterMode?: QueueFilterMode | null
    filterQueueNames?: string[]
  }): Promise<AlertRule> {
    const db = await getDb()

    const [result] = await db.insert(alertRule).values(data).returning()

    return result
  },

  async findById(id: string, organizationId: string): Promise<AlertRule | null> {
    const db = await getDb()
    const result = await db
      .select()
      .from(alertRule)
      .where(and(eq(alertRule.id, id), eq(alertRule.organizationId, organizationId)))
      .limit(1)

    return result[0] ?? null
  },

  async findByConnection(connectionId: string, organizationId: string): Promise<AlertRule[]> {
    const db = await getDb()
    return db
      .select()
      .from(alertRule)
      .where(
        and(eq(alertRule.connectionId, connectionId), eq(alertRule.organizationId, organizationId))
      )
      .orderBy(asc(alertRule.createdAt))
  },

  async findAllEnabled(): Promise<AlertRule[]> {
    const db = await getDb()
    return db.select().from(alertRule).where(eq(alertRule.enabled, true)).orderBy(asc(alertRule.id))
  },

  /**
   * Enabled rules that are not currently snoozed. A rule with a future
   * mutedUntil is skipped entirely by the monitor; auto-unmute is implicit
   * once the timestamp passes.
   */
  async findAllActive(): Promise<AlertRule[]> {
    const db = await getDb()
    return db
      .select()
      .from(alertRule)
      .where(
        and(
          eq(alertRule.enabled, true),
          or(isNull(alertRule.mutedUntil), lte(alertRule.mutedUntil, new Date()))
        )
      )
      .orderBy(asc(alertRule.id))
  },

  async setMutedUntil(
    id: string,
    organizationId: string,
    mutedUntil: Date | null
  ): Promise<AlertRule | null> {
    const db = await getDb()
    const [result] = await db
      .update(alertRule)
      .set({ mutedUntil, updatedAt: new Date() })
      .where(and(eq(alertRule.id, id), eq(alertRule.organizationId, organizationId)))
      .returning()

    return result ?? null
  },

  async update(
    id: string,
    organizationId: string,
    data: Partial<
      Pick<
        AlertRule,
        | 'name'
        | 'type'
        | 'config'
        | 'enabled'
        | 'notificationChannels'
        | 'cooldownMinutes'
        | 'queueName'
        | 'queueFilterMode'
        | 'filterQueueNames'
      >
    >
  ): Promise<AlertRule | null> {
    const db = await getDb()

    const [result] = await db
      .update(alertRule)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(alertRule.id, id), eq(alertRule.organizationId, organizationId)))
      .returning()

    return result ?? null
  },

  async delete(id: string, organizationId: string): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .delete(alertRule)
      .where(and(eq(alertRule.id, id), eq(alertRule.organizationId, organizationId)))
      .returning({ id: alertRule.id })

    return rows.length > 0
  },

  async countByConnection(connectionId: string, organizationId: string): Promise<number> {
    const db = await getDb()
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(alertRule)
      .where(
        and(eq(alertRule.connectionId, connectionId), eq(alertRule.organizationId, organizationId))
      )

    return Number(row?.count ?? 0)
  },
}
