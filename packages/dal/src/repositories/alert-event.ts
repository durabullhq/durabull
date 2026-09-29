import { randomUUID } from 'node:crypto'
import { uuidv7 } from '@durabull/utils/uuid'
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { alertCheckCursor } from '../db/schemas/alert-check-cursor/schema'
import {
  type AlertEventStatus,
  type AlertResolutionReason,
  alertEvent,
} from '../db/schemas/alert-event/schema'
import type { AlertEvent, NewAlertEvent } from '../db/schemas/alert-event/types'
import { alertRule } from '../db/schemas/alert-rule/schema'
import type { AlertRule } from '../db/schemas/alert-rule/types'
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
  return [acknowledged ? isNotNull(alertEvent.acknowledgedAt) : isNull(alertEvent.acknowledgedAt)]
}

const LINEAR_RESOLUTION_SYNC_LEASE_MINUTES = 15

function legacyLinearResolutionSyncPending() {
  return sql`coalesce((
    ${alertEvent.context}->>'migrationLinearSyncPending' = 'true'
    OR ${alertEvent.context}->>'linearResolutionSyncPending' = 'true'
  ), false)`
}

async function promoteLegacyLinearResolutionSyncPending(
  limit: number,
  alertRuleId?: string
): Promise<void> {
  const db = await getDb()
  await db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: alertEvent.id })
      .from(alertEvent)
      .where(
        and(
          eq(alertEvent.status, 'resolved'),
          eq(alertEvent.linearResolutionSyncPending, false),
          legacyLinearResolutionSyncPending(),
          ...(alertRuleId ? [eq(alertEvent.alertRuleId, alertRuleId)] : [])
        )
      )
      .orderBy(asc(alertEvent.updatedAt))
      .limit(Math.max(1, Math.min(limit, 5_000)))
      .for('update', { skipLocked: true })

    if (candidates.length === 0) return
    await tx
      .update(alertEvent)
      .set({
        linearResolutionSyncPending: true,
        linearResolutionReason: 'rule_changed',
        linearResolutionRetryAt: new Date(),
        linearResolutionAttempts: 0,
      })
      .where(
        inArray(
          alertEvent.id,
          candidates.map((candidate) => candidate.id)
        )
      )
  })
}

type AlertRuleEvaluationState = Pick<
  AlertRule,
  | 'id'
  | 'updatedAt'
  | 'deletionRequestedAt'
  | 'enabled'
  | 'mutedUntil'
  | 'type'
  | 'config'
  | 'queueName'
  | 'queueFilterMode'
  | 'filterQueueNames'
  | 'notificationChannels'
  | 'cooldownMinutes'
>

function matchesRuleEvaluationState(
  current: AlertRuleEvaluationState,
  expected: AlertRuleEvaluationState
): boolean {
  return (
    current.updatedAt.getTime() === expected.updatedAt.getTime() &&
    current.deletionRequestedAt?.getTime() === expected.deletionRequestedAt?.getTime() &&
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

  /**
   * Atomically establishes the single firing incident for a rule and scope.
   * The partial unique index is the cross-process arbiter; the read-after-
   * conflict returns the winner to callers running on another API replica.
   */
  async createOrGetActive(
    data: Omit<NewAlertEvent, 'id' | 'createdAt' | 'updatedAt' | 'status'>,
    options: {
      expectedRule?: AlertRuleEvaluationState
      latestEvaluation?: {
        connectionId: string
        queueName: string
        capturedAt: Date
        observationToken: string
      }
    } = {}
  ): Promise<
    | { event: AlertEvent; created: boolean; staleRule: false }
    | { event: null; created: false; staleRule: true }
  > {
    const db = await getDb()

    return db.transaction(async (tx) => {
      if (options.expectedRule) {
        const [currentRule] = await tx
          .select()
          .from(alertRule)
          .where(eq(alertRule.id, data.alertRuleId))
          .for('update')
          .limit(1)

        const now = Date.now()
        if (
          !currentRule ||
          !currentRule.enabled ||
          (currentRule.mutedUntil !== null && currentRule.mutedUntil.getTime() > now) ||
          !matchesRuleEvaluationState(currentRule, options.expectedRule)
        ) {
          return { event: null, created: false, staleRule: true }
        }
      }

      if (options.latestEvaluation) {
        const [cursor] = await tx
          .select({
            lastCheckedAt: alertCheckCursor.lastCheckedAt,
            lastObservationToken: alertCheckCursor.lastObservationToken,
          })
          .from(alertCheckCursor)
          .where(
            and(
              eq(alertCheckCursor.connectionId, options.latestEvaluation.connectionId),
              eq(alertCheckCursor.queueName, options.latestEvaluation.queueName)
            )
          )
          .for('update')
          .limit(1)
        if (
          cursor?.lastCheckedAt.getTime() !== options.latestEvaluation.capturedAt.getTime() ||
          cursor.lastObservationToken !== options.latestEvaluation.observationToken
        ) {
          return { event: null, created: false, staleRule: true }
        }
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const [inserted] = await tx
          .insert(alertEvent)
          .values({
            id: uuidv7(),
            ...data,
            status: 'firing',
          })
          .onConflictDoNothing()
          .returning()

        if (inserted) return { event: inserted, created: true, staleRule: false }

        const [existing] = await tx
          .select()
          .from(alertEvent)
          .where(
            and(
              eq(alertEvent.alertRuleId, data.alertRuleId),
              eq(alertEvent.queueName, data.queueName),
              eq(alertEvent.status, 'firing')
            )
          )
          .orderBy(desc(alertEvent.firedAt))
          .limit(1)
        if (existing) return { event: existing, created: false, staleRule: false }
        // The conflicting incident may have resolved between INSERT and SELECT.
        // Retry once so a fresh incident can be established for this evaluation.
      }

      throw new Error('Active alert event conflict could not be resolved.')
    })
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

  async resolveActiveIfRuleCurrent(
    id: string,
    organizationId: string,
    expectedRule: AlertRuleEvaluationState,
    latestEvaluation?: {
      connectionId: string
      queueName: string
      capturedAt: Date
      observationToken: string
    }
  ): Promise<{ event: AlertEvent | null; staleRule: boolean }> {
    const db = await getDb()
    return db.transaction(async (tx) => {
      const [currentRule] = await tx
        .select()
        .from(alertRule)
        .where(and(eq(alertRule.id, expectedRule.id), eq(alertRule.organizationId, organizationId)))
        .for('update')
        .limit(1)
      if (!currentRule || !matchesRuleEvaluationState(currentRule, expectedRule)) {
        return { event: null, staleRule: true }
      }

      if (latestEvaluation) {
        const [cursor] = await tx
          .select({
            lastCheckedAt: alertCheckCursor.lastCheckedAt,
            lastObservationToken: alertCheckCursor.lastObservationToken,
          })
          .from(alertCheckCursor)
          .where(
            and(
              eq(alertCheckCursor.connectionId, latestEvaluation.connectionId),
              eq(alertCheckCursor.queueName, latestEvaluation.queueName)
            )
          )
          .for('update')
          .limit(1)
        if (
          cursor?.lastCheckedAt.getTime() !== latestEvaluation.capturedAt.getTime() ||
          cursor.lastObservationToken !== latestEvaluation.observationToken
        ) {
          return { event: null, staleRule: true }
        }
      }

      const now = new Date()
      const [event] = await tx
        .update(alertEvent)
        .set({
          status: 'resolved',
          resolvedAt: now,
          updatedAt: now,
          linearResolutionSyncPending: true,
          linearResolutionSyncClaimToken: null,
          linearResolutionSyncClaimedAt: null,
          linearResolutionReason: 'auto_condition_cleared',
          linearResolutionRetryAt: now,
          linearResolutionAttempts: 0,
        })
        .where(
          and(
            eq(alertEvent.id, id),
            eq(alertEvent.organizationId, organizationId),
            eq(alertEvent.alertRuleId, expectedRule.id),
            eq(alertEvent.status, 'firing')
          )
        )
        .returning()
      return { event: event ?? null, staleRule: false }
    })
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
  async upsertSuppressed(
    data: {
      alertRuleId: string
      organizationId: string
      connectionId: string
      queueName: string
      type: string
      summary: string
      context: Record<string, unknown>
      dedupeKey: string
      observationToken?: string
    },
    options: {
      expectedRule?: AlertRuleEvaluationState
      latestEvaluation?: {
        connectionId: string
        queueName: string
        capturedAt: Date
        observationToken: string
      }
    } = {}
  ): Promise<{ event: AlertEvent; created: boolean } | null> {
    const db = await getDb()
    const now = new Date()
    const nowIso = now.toISOString()
    const eventId = uuidv7()
    // Callers outside the polling path still get normal increment semantics;
    // replayed monitor observations pass their durable token explicitly.
    const observationToken = data.observationToken ?? randomUUID()

    return db.transaction(async (tx) => {
      if (options.expectedRule) {
        const [currentRule] = await tx
          .select()
          .from(alertRule)
          .where(
            and(
              eq(alertRule.id, options.expectedRule.id),
              eq(alertRule.organizationId, data.organizationId)
            )
          )
          .for('update')
          .limit(1)
        if (!currentRule || !matchesRuleEvaluationState(currentRule, options.expectedRule)) {
          return null
        }
      }

      if (options.latestEvaluation) {
        const latestEvaluation = options.latestEvaluation
        const [cursor] = await tx
          .select({
            lastCheckedAt: alertCheckCursor.lastCheckedAt,
            lastObservationToken: alertCheckCursor.lastObservationToken,
          })
          .from(alertCheckCursor)
          .where(
            and(
              eq(alertCheckCursor.connectionId, latestEvaluation.connectionId),
              eq(alertCheckCursor.queueName, latestEvaluation.queueName)
            )
          )
          .for('update')
          .limit(1)
        if (
          cursor?.lastCheckedAt.getTime() !== latestEvaluation.capturedAt.getTime() ||
          cursor.lastObservationToken !== latestEvaluation.observationToken
        ) {
          return null
        }
      }

      const [upserted] = await tx
        .insert(alertEvent)
        .values({
          id: eventId,
          alertRuleId: data.alertRuleId,
          organizationId: data.organizationId,
          connectionId: data.connectionId,
          queueName: data.queueName,
          type: data.type,
          status: 'suppressed',
          summary: data.summary,
          context: {
            ...data.context,
            suppressedCount: 1,
            lastSuppressedAt: nowIso,
            lastObservationToken: observationToken,
          },
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
            ) || jsonb_build_object('lastObservationToken', ${observationToken}::text)`,
            updatedAt: now,
          },
          setWhere: sql`coalesce(${alertEvent.context}->>'lastObservationToken', '') <> ${observationToken}`,
        })
        .returning()

      const event =
        upserted ??
        (
          await tx
            .select()
            .from(alertEvent)
            .where(
              and(
                eq(alertEvent.alertRuleId, data.alertRuleId),
                eq(alertEvent.dedupeKey, data.dedupeKey)
              )
            )
            .limit(1)
        )[0]
      if (!event) throw new Error('Suppressed alert upsert did not return an event')

      return { event, created: event.id === eventId }
    })
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
      connectionId?: string
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
          ...(options.connectionId ? [eq(alertEvent.connectionId, options.connectionId)] : []),
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

  async resolve(
    id: string,
    organizationId: string,
    reason: AlertResolutionReason = 'manual'
  ): Promise<AlertEvent | null> {
    const db = await getDb()
    const [row] = await db
      .update(alertEvent)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        updatedAt: new Date(),
        linearResolutionSyncPending: true,
        linearResolutionSyncClaimToken: null,
        linearResolutionSyncClaimedAt: null,
        linearResolutionReason: reason,
        linearResolutionRetryAt: new Date(),
        linearResolutionAttempts: 0,
      })
      .where(
        and(
          eq(alertEvent.id, id),
          eq(alertEvent.organizationId, organizationId),
          eq(alertEvent.status, 'firing')
        )
      )
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
    options: { connectionId?: string; reason?: AlertResolutionReason } = {}
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
        linearResolutionSyncPending: true,
        linearResolutionSyncClaimToken: null,
        linearResolutionSyncClaimedAt: null,
        linearResolutionReason: options.reason ?? 'manual',
        linearResolutionRetryAt: now,
        linearResolutionAttempts: 0,
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

  async resolveAllForRule(
    alertRuleId: string,
    reason: AlertResolutionReason = 'rule_changed'
  ): Promise<AlertEvent[]> {
    const db = await getDb()
    const now = new Date()
    return db
      .update(alertEvent)
      .set({
        status: 'resolved',
        resolvedAt: now,
        updatedAt: now,
        linearResolutionSyncPending: true,
        linearResolutionSyncClaimToken: null,
        linearResolutionSyncClaimedAt: null,
        linearResolutionReason: reason,
        linearResolutionRetryAt: now,
        linearResolutionAttempts: 0,
      })
      .where(and(eq(alertEvent.alertRuleId, alertRuleId), eq(alertEvent.status, 'firing')))
      .returning()
  },

  async clearLinearResolutionSyncPending(ids: string[], claimToken: string): Promise<void> {
    if (ids.length === 0) return
    const db = await getDb()
    await db
      .update(alertEvent)
      .set({
        linearResolutionSyncPending: false,
        linearResolutionSyncClaimToken: null,
        linearResolutionSyncClaimedAt: null,
        // Keep the resolution reason for deliveries that finish after this
        // batch and re-arm external synchronization.
        linearResolutionRetryAt: null,
        linearResolutionAttempts: 0,
        context: sql`${alertEvent.context} - 'migrationLinearSyncPending' - 'linearResolutionSyncPending'`,
        updatedAt: new Date(),
      })
      .where(
        and(inArray(alertEvent.id, ids), eq(alertEvent.linearResolutionSyncClaimToken, claimToken))
      )
  },

  async releaseLinearResolutionSyncClaims(
    ids: string[],
    claimToken: string,
    retryAt: Date
  ): Promise<void> {
    if (ids.length === 0) return
    const db = await getDb()
    await db
      .update(alertEvent)
      .set({
        linearResolutionSyncClaimToken: null,
        linearResolutionSyncClaimedAt: null,
        linearResolutionRetryAt: retryAt,
        linearResolutionAttempts: sql`${alertEvent.linearResolutionAttempts} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(inArray(alertEvent.id, ids), eq(alertEvent.linearResolutionSyncClaimToken, claimToken))
      )
  },

  async claimLinearResolutionSync(
    id: string,
    claimToken: string,
    leaseMinutes = LINEAR_RESOLUTION_SYNC_LEASE_MINUTES
  ): Promise<AlertEvent | null> {
    const db = await getDb()
    const now = new Date()
    const staleClaimBefore = new Date(now.getTime() - leaseMinutes * 60_000)
    return db.transaction(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(alertEvent)
        .where(
          and(
            eq(alertEvent.id, id),
            eq(alertEvent.status, 'resolved'),
            sql`(
              ${alertEvent.linearResolutionSyncPending} = true
              OR ${legacyLinearResolutionSyncPending()}
            )`,
            sql`(
              ${alertEvent.linearResolutionRetryAt} IS NULL
              OR ${alertEvent.linearResolutionRetryAt} <= ${now}
            )`,
            sql`(
              ${alertEvent.linearResolutionSyncClaimToken} IS NULL
              OR ${alertEvent.linearResolutionSyncClaimedAt} < ${staleClaimBefore}
            )`
          )
        )
        .for('update')
        .limit(1)

      if (!candidate) return null
      const [claimed] = await tx
        .update(alertEvent)
        .set({
          linearResolutionSyncClaimToken: claimToken,
          linearResolutionSyncClaimedAt: now,
          linearResolutionSyncPending: true,
          updatedAt: now,
        })
        .where(eq(alertEvent.id, id))
        .returning()
      return claimed ?? null
    })
  },

  async findPendingLinearResolutionSync(limit = 50): Promise<AlertEvent[]> {
    await promoteLegacyLinearResolutionSyncPending(limit)
    const db = await getDb()
    const staleClaimBefore = new Date(Date.now() - LINEAR_RESOLUTION_SYNC_LEASE_MINUTES * 60_000)
    return db
      .select()
      .from(alertEvent)
      .where(
        and(
          eq(alertEvent.status, 'resolved'),
          eq(alertEvent.linearResolutionSyncPending, true),
          sql`(
            ${alertEvent.linearResolutionRetryAt} IS NULL
            OR ${alertEvent.linearResolutionRetryAt} <= ${new Date()}
          )`,
          sql`(
            ${alertEvent.linearResolutionSyncClaimToken} IS NULL
            OR ${alertEvent.linearResolutionSyncClaimedAt} < ${staleClaimBefore}
          )`
        )
      )
      .orderBy(asc(alertEvent.updatedAt))
      .limit(Math.max(1, Math.min(limit, 500)))
  },

  async findPendingLinearResolutionSyncForRule(
    alertRuleId: string,
    limit = 100
  ): Promise<AlertEvent[]> {
    const boundedLimit = Math.max(1, Math.min(limit, 500))
    await promoteLegacyLinearResolutionSyncPending(boundedLimit, alertRuleId)
    const db = await getDb()
    return db
      .select()
      .from(alertEvent)
      .where(
        and(
          eq(alertEvent.alertRuleId, alertRuleId),
          eq(alertEvent.status, 'resolved'),
          eq(alertEvent.linearResolutionSyncPending, true)
        )
      )
      .orderBy(asc(alertEvent.updatedAt))
      .limit(boundedLimit)
  },

  async deleteOlderThan(days: number, pendingSyncMaxDays = 365, limit = 5_000): Promise<number> {
    const db = await getDb()
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const pendingSyncCutoff = new Date(
      Date.now() - Math.max(days, pendingSyncMaxDays) * 24 * 60 * 60 * 1000
    )
    const staleClaimBefore = new Date(Date.now() - LINEAR_RESOLUTION_SYNC_LEASE_MINUTES * 60_000)
    return db.transaction(async (tx) => {
      const expired = await tx
        .select({ id: alertEvent.id })
        .from(alertEvent)
        .where(
          sql`${alertEvent.firedAt} < ${cutoff}
            AND ${alertEvent.status} <> 'firing'
            AND (
              NOT (
                ${alertEvent.linearResolutionSyncPending} = true
                OR ${legacyLinearResolutionSyncPending()}
              )
              OR (
                ${alertEvent.firedAt} < ${pendingSyncCutoff}
                AND (
                  ${alertEvent.linearResolutionSyncClaimToken} IS NULL
                  OR ${alertEvent.linearResolutionSyncClaimedAt} IS NULL
                  OR ${alertEvent.linearResolutionSyncClaimedAt} < ${staleClaimBefore}
                )
              )
            )`
        )
        .orderBy(asc(alertEvent.firedAt))
        .limit(Math.max(1, Math.min(limit, 10_000)))
        .for('update', { skipLocked: true })
      if (expired.length === 0) return 0

      const deleted = await tx
        .delete(alertEvent)
        .where(
          inArray(
            alertEvent.id,
            expired.map((row) => row.id)
          )
        )
        .returning({ id: alertEvent.id })
      return deleted.length
    })
  },
}
