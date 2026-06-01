import { and, asc, eq, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  type AlertDeliveryChannelType,
  type AlertDeliveryStatus,
  alertDelivery,
} from '../db/schemas/alert-delivery/schema'
import type { AlertDelivery } from '../db/schemas/alert-delivery/types'

const STALE_CLAIM_MS = 10 * 60 * 1000

function toNumber(value: number | string | bigint | null | undefined): number {
  if (value === null || value === undefined) return 0
  return Number(value)
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

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'string') return new Date(value)
  return null
}

function normalizeAlertDeliveryRow(row: AlertDelivery): AlertDelivery {
  return {
    ...row,
    createdAt: toDate(row.createdAt) ?? row.createdAt,
    updatedAt: toDate(row.updatedAt) ?? row.updatedAt,
    nextRetryAt: toDate(row.nextRetryAt) ?? row.nextRetryAt,
    claimedAt: toDate(row.claimedAt) ?? row.claimedAt,
  }
}

export interface AlertDeliveryInput {
  alertEventId: string
  organizationId: string
  channelType: AlertDeliveryChannelType
  target: string
  providerMetadata?: Record<string, unknown>
}

export const alertDeliveryRepository = {
  async enqueueMany(inputs: AlertDeliveryInput[]): Promise<AlertDelivery[]> {
    if (inputs.length === 0) return []
    const db = await getDb()

    return db
      .insert(alertDelivery)
      .values(
        inputs.map((input) => ({
          alertEventId: input.alertEventId,
          organizationId: input.organizationId,
          channelType: input.channelType,
          target: input.target,
          providerMetadata: input.providerMetadata ?? {},
        }))
      )
      .onConflictDoNothing()
      .returning()
  },

  async listByEvent(alertEventId: string): Promise<AlertDelivery[]> {
    const db = await getDb()
    return db
      .select()
      .from(alertDelivery)
      .where(eq(alertDelivery.alertEventId, alertEventId))
      .orderBy(asc(alertDelivery.createdAt))
  },

  async claimDueForEvent(alertEventId: string, limit = 20): Promise<AlertDelivery[]> {
    const db = await getDb()
    const now = new Date()
    const staleClaimCutoff = new Date(now.getTime() - STALE_CLAIM_MS)

    const result = await db.execute(sql`
      UPDATE ${alertDelivery} AS delivery
      SET
        status = 'claimed',
        claimed_at = ${now},
        updated_at = ${now}
      WHERE delivery.id IN (
        SELECT candidate.id
        FROM ${alertDelivery} AS candidate
        WHERE candidate.alert_event_id = ${alertEventId}
          AND (
            candidate.status = 'pending'
            OR (
              candidate.status = 'failed'
              AND candidate.next_retry_at IS NOT NULL
            )
            OR (
              candidate.status = 'claimed'
              AND candidate.claimed_at <= ${staleClaimCutoff}
            )
          )
          AND (
            candidate.next_retry_at IS NULL
            OR candidate.next_retry_at <= ${now}
          )
        ORDER BY candidate.created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        delivery.id,
        delivery.created_at AS "createdAt",
        delivery.updated_at AS "updatedAt",
        delivery.alert_event_id AS "alertEventId",
        delivery.organization_id AS "organizationId",
        delivery.channel_type AS "channelType",
        delivery.target,
        delivery.status,
        delivery.attempt_count AS "attemptCount",
        delivery.next_retry_at AS "nextRetryAt",
        delivery.claimed_at AS "claimedAt",
        delivery.last_error AS "lastError",
        delivery.provider_metadata AS "providerMetadata",
        delivery.external_id AS "externalId",
        delivery.external_identifier AS "externalIdentifier",
        delivery.external_url AS "externalUrl"
    `)

    return rowsFromExecute<AlertDelivery>(result).map(normalizeAlertDeliveryRow)
  },

  async claimById(deliveryId: string, alertEventId: string): Promise<AlertDelivery[]> {
    const db = await getDb()
    const now = new Date()
    const staleClaimCutoff = new Date(now.getTime() - STALE_CLAIM_MS)

    const result = await db.execute(sql`
      UPDATE ${alertDelivery} AS delivery
      SET
        status = 'claimed',
        claimed_at = ${now},
        updated_at = ${now}
      WHERE delivery.id IN (
        SELECT candidate.id
        FROM ${alertDelivery} AS candidate
        WHERE candidate.id = ${deliveryId}
          AND candidate.alert_event_id = ${alertEventId}
          AND (
            candidate.status = 'pending'
            OR (
              candidate.status = 'failed'
              AND candidate.next_retry_at IS NOT NULL
            )
            OR (
              candidate.status = 'claimed'
              AND candidate.claimed_at <= ${staleClaimCutoff}
            )
          )
          AND (
            candidate.next_retry_at IS NULL
            OR candidate.next_retry_at <= ${now}
          )
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        delivery.id,
        delivery.created_at AS "createdAt",
        delivery.updated_at AS "updatedAt",
        delivery.alert_event_id AS "alertEventId",
        delivery.organization_id AS "organizationId",
        delivery.channel_type AS "channelType",
        delivery.target,
        delivery.status,
        delivery.attempt_count AS "attemptCount",
        delivery.next_retry_at AS "nextRetryAt",
        delivery.claimed_at AS "claimedAt",
        delivery.last_error AS "lastError",
        delivery.provider_metadata AS "providerMetadata",
        delivery.external_id AS "externalId",
        delivery.external_identifier AS "externalIdentifier",
        delivery.external_url AS "externalUrl"
    `)

    return rowsFromExecute<AlertDelivery>(result).map(normalizeAlertDeliveryRow)
  },

  /**
   * Resets a failed or stuck delivery so the next processing pass will pick it
   * up again. Scoped to its event for authorization and refuses to re-send an
   * already delivered row (which would create a duplicate downstream issue).
   */
  async resetForRetry(deliveryId: string, alertEventId: string): Promise<AlertDelivery | null> {
    const db = await getDb()
    const now = new Date()
    const rows = await db
      .update(alertDelivery)
      .set({
        status: 'pending',
        claimedAt: null,
        nextRetryAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(alertDelivery.id, deliveryId),
          eq(alertDelivery.alertEventId, alertEventId),
          sql`${alertDelivery.status} IN ('failed', 'claimed')`
        )
      )
      .returning()

    return rows[0] ? normalizeAlertDeliveryRow(rows[0]) : null
  },

  async markDelivered(
    id: string,
    metadata: {
      externalId?: string | null
      externalIdentifier?: string | null
      externalUrl?: string | null
      providerMetadata?: Record<string, unknown>
    } = {},
    expectedClaimedAt: Date
  ): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .update(alertDelivery)
      .set({
        status: 'delivered',
        claimedAt: null,
        nextRetryAt: null,
        lastError: null,
        externalId: metadata.externalId ?? null,
        externalIdentifier: metadata.externalIdentifier ?? null,
        externalUrl: metadata.externalUrl ?? null,
        providerMetadata: metadata.providerMetadata ?? {},
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(alertDelivery.id, id),
          eq(alertDelivery.status, 'claimed'),
          eq(alertDelivery.claimedAt, expectedClaimedAt)
        )
      )
      .returning({ id: alertDelivery.id })

    return rows.length > 0
  },

  async markFailed(
    id: string,
    options: {
      error: string
      retryable: boolean
      nextRetryAt?: Date | null
      expectedClaimedAt: Date
    }
  ): Promise<boolean> {
    const db = await getDb()
    const now = new Date()
    const rows = await db
      .update(alertDelivery)
      .set({
        status: 'failed',
        attemptCount: sql`${alertDelivery.attemptCount} + 1`,
        claimedAt: null,
        nextRetryAt: options.retryable ? (options.nextRetryAt ?? now) : null,
        lastError: options.error.slice(0, 1000),
        updatedAt: now,
      })
      .where(
        and(
          eq(alertDelivery.id, id),
          eq(alertDelivery.status, 'claimed'),
          eq(alertDelivery.claimedAt, options.expectedClaimedAt)
        )
      )
      .returning({ id: alertDelivery.id })

    return rows.length > 0
  },

  async countByStatuses(alertEventId: string): Promise<Record<AlertDeliveryStatus, number>> {
    const db = await getDb()
    const rows = await db
      .select({
        status: alertDelivery.status,
        count: sql<number>`count(*)`,
      })
      .from(alertDelivery)
      .where(eq(alertDelivery.alertEventId, alertEventId))
      .groupBy(alertDelivery.status)

    return {
      pending: 0,
      claimed: 0,
      delivered: 0,
      failed: 0,
      ...Object.fromEntries(rows.map((row) => [row.status, toNumber(row.count)])),
    }
  },
}
