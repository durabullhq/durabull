import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { alertDelivery } from '../db/schemas/alert-delivery/schema'
import { alertEvent } from '../db/schemas/alert-event/schema'
import type { AlertEvent } from '../db/schemas/alert-event/types'
import {
  type AlertRuleType,
  alertRule,
  type QueueFilterMode,
} from '../db/schemas/alert-rule/schema'
import type { AlertRule } from '../db/schemas/alert-rule/types'

function matchesAlertRuleRevision(current: AlertRule, expected: AlertRule): boolean {
  return (
    current.updatedAt.getTime() === expected.updatedAt.getTime() &&
    current.deletionRequestedAt?.getTime() === expected.deletionRequestedAt?.getTime() &&
    current.deletionRetryAt?.getTime() === expected.deletionRetryAt?.getTime() &&
    current.enabled === expected.enabled &&
    current.mutedUntil?.getTime() === expected.mutedUntil?.getTime() &&
    current.type === expected.type &&
    current.queueName === expected.queueName &&
    current.queueFilterMode === expected.queueFilterMode &&
    current.cooldownMinutes === expected.cooldownMinutes &&
    JSON.stringify(current.config) === JSON.stringify(expected.config) &&
    JSON.stringify(current.filterQueueNames) === JSON.stringify(expected.filterQueueNames) &&
    JSON.stringify(current.notificationChannels) === JSON.stringify(expected.notificationChannels)
  )
}

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
      .where(
        and(
          eq(alertRule.id, id),
          eq(alertRule.organizationId, organizationId),
          isNull(alertRule.deletionRequestedAt)
        )
      )
      .limit(1)

    return result[0] ?? null
  },

  async findByConnection(connectionId: string, organizationId: string): Promise<AlertRule[]> {
    const db = await getDb()
    return db
      .select()
      .from(alertRule)
      .where(
        and(
          eq(alertRule.connectionId, connectionId),
          eq(alertRule.organizationId, organizationId),
          isNull(alertRule.deletionRequestedAt)
        )
      )
      .orderBy(asc(alertRule.createdAt))
  },

  async findAllEnabled(): Promise<AlertRule[]> {
    const db = await getDb()
    return db
      .select()
      .from(alertRule)
      .where(and(eq(alertRule.enabled, true), isNull(alertRule.deletionRequestedAt)))
      .orderBy(asc(alertRule.id))
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
          isNull(alertRule.deletionRequestedAt),
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
        | 'deletionRequestedAt'
        | 'deletionRetryAt'
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

  async updateIfCurrent(
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
        | 'deletionRequestedAt'
        | 'deletionRetryAt'
      >
    >,
    expectedRule: AlertRule,
    options: { resolveActive: boolean }
  ): Promise<{
    rule: AlertRule | null
    resolvedEvents: AlertEvent[]
    conflict: boolean
  }> {
    const db = await getDb()
    return db.transaction(async (tx) => {
      const [currentRule] = await tx
        .select()
        .from(alertRule)
        .where(and(eq(alertRule.id, id), eq(alertRule.organizationId, organizationId)))
        .for('update')
        .limit(1)
      if (!currentRule) return { rule: null, resolvedEvents: [], conflict: false }
      if (!matchesAlertRuleRevision(currentRule, expectedRule)) {
        return { rule: null, resolvedEvents: [], conflict: true }
      }

      const now = new Date()
      const [rule] = await tx
        .update(alertRule)
        .set({ ...data, updatedAt: now })
        .where(and(eq(alertRule.id, id), eq(alertRule.organizationId, organizationId)))
        .returning()

      const resolvedEvents = options.resolveActive
        ? await tx
            .update(alertEvent)
            .set({
              status: 'resolved',
              resolvedAt: now,
              updatedAt: now,
              linearResolutionSyncPending: true,
              linearResolutionSyncClaimToken: null,
              linearResolutionSyncClaimedAt: null,
              linearResolutionReason: 'rule_changed',
              linearResolutionRetryAt: now,
              linearResolutionAttempts: 0,
              linearResolutionFailedAt: null,
              linearResolutionLastError: null,
              context: sql`jsonb_set(
                coalesce(${alertEvent.context}, '{}'::jsonb),
                '{ruleRevisionInvalidated}',
                'true'::jsonb,
                true
              )`,
            })
            .where(and(eq(alertEvent.alertRuleId, id), eq(alertEvent.status, 'firing')))
            .returning()
        : []

      return { rule: rule ?? null, resolvedEvents, conflict: false }
    })
  },

  async delete(id: string, organizationId: string): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .delete(alertRule)
      .where(and(eq(alertRule.id, id), eq(alertRule.organizationId, organizationId)))
      .returning({ id: alertRule.id })

    return rows.length > 0
  },

  async findDeletionRequested(limit = 25): Promise<AlertRule[]> {
    const db = await getDb()
    return db
      .select()
      .from(alertRule)
      .where(sql`${alertRule.deletionRequestedAt} IS NOT NULL`)
      .orderBy(asc(alertRule.deletionRequestedAt))
      .limit(Math.max(1, Math.min(limit, 100)))
  },

  async claimDeletionRequested(
    limit: number,
    claimToken: string,
    leaseMinutes = 15
  ): Promise<AlertRule[]> {
    const db = await getDb()
    const now = new Date()
    const staleClaimBefore = new Date(now.getTime() - leaseMinutes * 60_000)
    return db.transaction(async (tx) => {
      const candidates = await tx
        .select({ id: alertRule.id })
        .from(alertRule)
        .where(
          sql`${alertRule.deletionRequestedAt} IS NOT NULL
            AND (${alertRule.deletionRetryAt} IS NULL OR ${alertRule.deletionRetryAt} <= ${now})
            AND (
              ${alertRule.deletionClaimToken} IS NULL
              OR ${alertRule.deletionClaimedAt} IS NULL
              OR ${alertRule.deletionClaimedAt} < ${staleClaimBefore}
            )`
        )
        .orderBy(asc(alertRule.deletionRetryAt), asc(alertRule.deletionRequestedAt))
        .limit(Math.max(1, Math.min(limit, 100)))
        .for('update', { skipLocked: true })
      if (candidates.length === 0) return []

      return tx
        .update(alertRule)
        .set({ deletionClaimToken: claimToken, deletionClaimedAt: now, updatedAt: now })
        .where(
          inArray(
            alertRule.id,
            candidates.map((candidate) => candidate.id)
          )
        )
        .returning()
    })
  },

  async releaseDeletionClaim(id: string, claimToken: string, retryAt: Date): Promise<void> {
    const db = await getDb()
    await db
      .update(alertRule)
      .set({
        deletionClaimToken: null,
        deletionClaimedAt: null,
        deletionRetryAt: retryAt,
        updatedAt: new Date(),
      })
      .where(and(eq(alertRule.id, id), eq(alertRule.deletionClaimToken, claimToken)))
  },

  async deleteIfDeletionRequested(id: string, claimToken: string): Promise<boolean> {
    const db = await getDb()
    const deleted = await db
      .delete(alertRule)
      .where(
        and(
          eq(alertRule.id, id),
          eq(alertRule.enabled, false),
          eq(alertRule.deletionClaimToken, claimToken),
          sql`${alertRule.deletionRequestedAt} IS NOT NULL`,
          sql`NOT EXISTS (
            SELECT 1 FROM ${alertEvent}
            WHERE ${alertEvent.alertRuleId} = ${alertRule.id}
              AND (
                ${alertEvent.status} = 'firing'
                OR ${alertEvent.linearResolutionSyncPending} = true
                OR ${alertEvent.context}->>'migrationLinearSyncPending' = 'true'
                OR ${alertEvent.context}->>'linearResolutionSyncPending' = 'true'
                OR EXISTS (
                  SELECT 1 FROM ${alertDelivery}
                  WHERE ${alertDelivery.alertEventId} = ${alertEvent.id}
                    AND ${alertDelivery.status} = 'claimed'
                )
              )
          )`
        )
      )
      .returning({ id: alertRule.id })
    return deleted.length > 0
  },

  async countByConnection(connectionId: string, organizationId: string): Promise<number> {
    const db = await getDb()
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(alertRule)
      .where(
        and(
          eq(alertRule.connectionId, connectionId),
          eq(alertRule.organizationId, organizationId),
          isNull(alertRule.deletionRequestedAt)
        )
      )

    return Number(row?.count ?? 0)
  },
}
