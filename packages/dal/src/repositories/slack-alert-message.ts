import { randomUUID } from 'node:crypto'
import { and, eq, gt, inArray, isNotNull, or, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { alertEvent } from '../db/schemas/alert-event/schema'
import { slackAlertMessage } from '../db/schemas/slack-alert-message/schema'
import type {
  SlackAlertMessage,
  SlackAlertMessageState,
} from '../db/schemas/slack-alert-message/types'

/** Lease taken on a message while it is being re-rendered in Slack. */
const SYNC_LEASE_MS = 2 * 60_000
/** Attempt count that takes a message out of the sync loop until it is revived. */
const PARKED_ATTEMPTS = 1_000_000

export type ClaimedSlackAlertMessage = SlackAlertMessage & {
  leaseToken: string
  /** The refresh request this claim renders; newer requests stay pending. */
  claimedRefreshGeneration: number
}

function leaseHeld(claim: { id: string; leaseToken: string }) {
  return and(
    eq(slackAlertMessage.id, claim.id),
    eq(slackAlertMessage.syncLeaseToken, claim.leaseToken)
  )
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

/** The state a Slack message should show for an incident. */
export function desiredSlackMessageState(event: {
  status: string
  acknowledgedAt: Date | null
}): SlackAlertMessageState {
  if (event.status !== 'firing') return 'resolved'
  return event.acknowledgedAt ? 'acknowledged' : 'firing'
}

const desiredStateSql = sql`CASE
  WHEN event.status <> 'firing' THEN 'resolved'
  WHEN event.acknowledged_at IS NOT NULL THEN 'acknowledged'
  ELSE 'firing'
END`

export interface CreateSlackAlertMessageInput {
  organizationId: string
  alertEventId: string
  alertDeliveryId: string
  destinationId?: string | null
  slackTeamId: string
  channelId: string
  messageTs: string
  permalink?: string | null
  renderedState: SlackAlertMessageState
  renderedAcknowledgedBy?: string | null
}

export const slackAlertMessageRepository = {
  async findByDelivery(alertDeliveryId: string): Promise<SlackAlertMessage | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(slackAlertMessage)
      .where(eq(slackAlertMessage.alertDeliveryId, alertDeliveryId))
      .limit(1)
    return rows[0] ?? null
  },

  async listByEvent(alertEventId: string): Promise<SlackAlertMessage[]> {
    const db = await getDb()
    return db
      .select()
      .from(slackAlertMessage)
      .where(eq(slackAlertMessage.alertEventId, alertEventId))
  },

  async findByChannelMessage(
    channelId: string,
    messageTs: string
  ): Promise<SlackAlertMessage | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(slackAlertMessage)
      .where(
        and(eq(slackAlertMessage.channelId, channelId), eq(slackAlertMessage.messageTs, messageTs))
      )
      .limit(1)
    return rows[0] ?? null
  },

  /** Records a posted message; a second insert for the same delivery returns the first. */
  async createOrGet(input: CreateSlackAlertMessageInput): Promise<SlackAlertMessage> {
    const db = await getDb()
    const [inserted] = await db
      .insert(slackAlertMessage)
      .values({
        organizationId: input.organizationId,
        alertEventId: input.alertEventId,
        alertDeliveryId: input.alertDeliveryId,
        destinationId: input.destinationId ?? null,
        slackTeamId: input.slackTeamId,
        channelId: input.channelId,
        messageTs: input.messageTs,
        permalink: input.permalink ?? null,
        renderedState: input.renderedState,
        renderedAcknowledgedBy: input.renderedAcknowledgedBy ?? null,
        lastSyncedAt: new Date(),
      })
      .onConflictDoNothing({ target: slackAlertMessage.alertDeliveryId })
      .returning()
    if (inserted) return inserted
    const existing = await this.findByDelivery(input.alertDeliveryId)
    if (!existing) throw new Error('Slack alert message could not be recorded.')
    return existing
  },

  /**
   * Leases messages whose incident state no longer matches what Slack shows,
   * or that were asked to re-render. Each claim gets its own lease token, and
   * completion writes only land while that token still holds the row.
   * Pass `alertEventIds` to sync specific incidents right after they change.
   */
  async claimOutOfSync(
    options: { limit?: number; alertEventIds?: string[]; maxAttempts?: number } = {}
  ): Promise<ClaimedSlackAlertMessage[]> {
    const db = await getDb()
    const claimedAt = new Date()
    const leaseUntil = new Date(claimedAt.getTime() + SYNC_LEASE_MS)
    const leaseToken = randomUUID()
    const limit = options.limit ?? 25
    const maxAttempts = options.maxAttempts ?? 50
    if (options.alertEventIds && options.alertEventIds.length === 0) return []
    const eventFilter = options.alertEventIds
      ? sql`AND message.alert_event_id IN (${sql.join(
          options.alertEventIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      : sql``

    const result = await db.execute(sql`
      UPDATE ${slackAlertMessage} AS target
      SET next_sync_at = ${leaseUntil}, sync_lease_token = ${leaseToken}, updated_at = ${claimedAt}
      WHERE target.id IN (
        SELECT message.id
        FROM ${slackAlertMessage} AS message
        INNER JOIN ${alertEvent} AS event ON event.id = message.alert_event_id
        WHERE (
            ${desiredStateSql} <> message.rendered_state
            OR (
              event.status = 'firing'
              AND event.acknowledged_at IS NOT NULL
              AND event.acknowledged_by IS DISTINCT FROM message.rendered_acknowledged_by
            )
            OR message.refresh_requested_at IS NOT NULL
          )
          AND (message.next_sync_at IS NULL OR message.next_sync_at <= ${claimedAt})
          AND message.sync_attempts < ${maxAttempts}
          ${eventFilter}
        ORDER BY message.updated_at
        LIMIT ${limit}
        FOR UPDATE OF message SKIP LOCKED
      )
      RETURNING target.id, target.refresh_generation AS "refreshGeneration"
    `)
    const claimed = new Map(
      rowsFromExecute<{ id: string; refreshGeneration: number }>(result).map((row) => [
        row.id,
        Number(row.refreshGeneration),
      ])
    )
    if (claimed.size === 0) return []
    const rows = await db
      .select()
      .from(slackAlertMessage)
      .where(inArray(slackAlertMessage.id, [...claimed.keys()]))
    // The generation comes from the claim itself, so a refresh requested
    // after it (even by a replica with a different clock) stays pending.
    return rows.map((row) => ({
      ...row,
      leaseToken,
      claimedRefreshGeneration: claimed.get(row.id) ?? row.refreshGeneration,
    }))
  },

  /** Records what Slack now shows; ignored when the lease was lost to another worker. */
  async markSynced(
    claim: Pick<ClaimedSlackAlertMessage, 'id' | 'leaseToken' | 'claimedRefreshGeneration'>,
    rendered: { state: SlackAlertMessageState; acknowledgedBy: string | null }
  ): Promise<boolean> {
    const db = await getDb()
    const now = new Date()
    const rows = await db
      .update(slackAlertMessage)
      .set({
        renderedState: rendered.state,
        renderedAcknowledgedBy: rendered.acknowledgedBy,
        syncAttempts: 0,
        nextSyncAt: null,
        syncLeaseToken: null,
        // A refresh requested while this worker was busy still needs its own pass.
        refreshRequestedAt: sql`CASE WHEN ${slackAlertMessage.refreshGeneration} = ${claim.claimedRefreshGeneration} THEN NULL ELSE ${slackAlertMessage.refreshRequestedAt} END`,
        lastSyncError: null,
        lastSyncedAt: now,
        updatedAt: now,
      })
      .where(leaseHeld(claim))
      .returning({ id: slackAlertMessage.id })
    return rows.length > 0
  },

  async markSyncFailed(
    claim: Pick<ClaimedSlackAlertMessage, 'id' | 'leaseToken'>,
    failure: { error: string; nextSyncAt: Date | null }
  ): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .update(slackAlertMessage)
      .set({
        syncAttempts: sql`${slackAlertMessage.syncAttempts} + 1`,
        lastSyncError: failure.error.slice(0, 1000),
        // A null retry time with attempts exhausted parks the row; the claim
        // query skips it once sync_attempts reaches the limit.
        nextSyncAt: failure.nextSyncAt,
        syncLeaseToken: null,
        updatedAt: new Date(),
      })
      .where(leaseHeld(claim))
      .returning({ id: slackAlertMessage.id })
    return rows.length > 0
  },

  /** Retries later without using up an attempt (Slack is disconnected for now). */
  async defer(
    claim: Pick<ClaimedSlackAlertMessage, 'id' | 'leaseToken'>,
    until: Date,
    reason: string
  ): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .update(slackAlertMessage)
      .set({
        nextSyncAt: until,
        syncLeaseToken: null,
        lastSyncError: reason.slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(leaseHeld(claim))
      .returning({ id: slackAlertMessage.id })
    return rows.length > 0
  },

  /** Stops syncing messages that cannot be updated until Slack access changes. */
  async abandon(
    claim: Pick<ClaimedSlackAlertMessage, 'id' | 'leaseToken'>,
    error: string
  ): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .update(slackAlertMessage)
      .set({
        syncAttempts: PARKED_ATTEMPTS,
        lastSyncError: error.slice(0, 1000),
        nextSyncAt: null,
        syncLeaseToken: null,
        updatedAt: new Date(),
      })
      .where(leaseHeld(claim))
      .returning({ id: slackAlertMessage.id })
    return rows.length > 0
  },

  /** Asks the sync loop to re-render these incidents' messages from their current state. */
  async requestRefresh(alertEventIds: string[]): Promise<number> {
    if (alertEventIds.length === 0) return 0
    const db = await getDb()
    const now = new Date()
    const rows = await db
      .update(slackAlertMessage)
      .set({
        refreshRequestedAt: now,
        refreshGeneration: sql`${slackAlertMessage.refreshGeneration} + 1`,
        updatedAt: now,
      })
      .where(inArray(slackAlertMessage.alertEventId, alertEventIds))
      .returning({ id: slackAlertMessage.id })
    return rows.length
  },

  /** Re-renders every message for the organization's open incidents (e.g. Slack actions toggled). */
  async requestRefreshForOpenIncidents(organizationId: string): Promise<string[]> {
    const db = await getDb()
    const now = new Date()
    const result = await db.execute(sql`
      UPDATE ${slackAlertMessage} AS message
      SET refresh_requested_at = ${now},
        refresh_generation = message.refresh_generation + 1,
        updated_at = ${now}
      FROM ${alertEvent} AS event
      WHERE event.id = message.alert_event_id
        AND message.organization_id = ${organizationId}
        AND event.status = 'firing'
      RETURNING message.alert_event_id AS "alertEventId"
    `)
    return [
      ...new Set(rowsFromExecute<{ alertEventId: string }>(result).map((row) => row.alertEventId)),
    ]
  },

  /**
   * Gives parked messages another chance after Slack access returns (the
   * workspace was reconnected), so incidents in it update again.
   */
  async reviveForWorkspace(organizationId: string, slackTeamId: string): Promise<number> {
    const db = await getDb()
    const rows = await db
      .update(slackAlertMessage)
      .set({ syncAttempts: 0, nextSyncAt: null, syncLeaseToken: null, updatedAt: new Date() })
      .where(
        and(
          eq(slackAlertMessage.organizationId, organizationId),
          eq(slackAlertMessage.slackTeamId, slackTeamId),
          or(gt(slackAlertMessage.syncAttempts, 0), isNotNull(slackAlertMessage.nextSyncAt))
        )
      )
      .returning({ id: slackAlertMessage.id })
    return rows.length
  },
}
