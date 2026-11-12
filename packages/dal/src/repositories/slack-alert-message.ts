import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { alertEvent } from '../db/schemas/alert-event/schema'
import { slackAlertMessage } from '../db/schemas/slack-alert-message/schema'
import type {
  SlackAlertMessage,
  SlackAlertMessageState,
} from '../db/schemas/slack-alert-message/types'

/** Lease taken on a message while it is being re-rendered in Slack. */
const SYNC_LEASE_MS = 2 * 60_000

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
   * Leases messages whose incident state no longer matches what Slack shows.
   * Pass `alertEventIds` to sync specific incidents right after they change.
   */
  async claimOutOfSync(
    options: { limit?: number; alertEventIds?: string[]; maxAttempts?: number } = {}
  ): Promise<SlackAlertMessage[]> {
    const db = await getDb()
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + SYNC_LEASE_MS)
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
      SET next_sync_at = ${leaseUntil}, updated_at = ${now}
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
          )
          AND (message.next_sync_at IS NULL OR message.next_sync_at <= ${now})
          AND message.sync_attempts < ${maxAttempts}
          ${eventFilter}
        ORDER BY message.updated_at
        LIMIT ${limit}
        FOR UPDATE OF message SKIP LOCKED
      )
      RETURNING target.id
    `)
    const ids = rowsFromExecute<{ id: string }>(result).map((row) => row.id)
    if (ids.length === 0) return []
    return db.select().from(slackAlertMessage).where(inArray(slackAlertMessage.id, ids))
  },

  async markSynced(
    id: string,
    rendered: { state: SlackAlertMessageState; acknowledgedBy: string | null }
  ): Promise<void> {
    const db = await getDb()
    const now = new Date()
    await db
      .update(slackAlertMessage)
      .set({
        renderedState: rendered.state,
        renderedAcknowledgedBy: rendered.acknowledgedBy,
        syncAttempts: 0,
        nextSyncAt: null,
        lastSyncError: null,
        lastSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(slackAlertMessage.id, id))
  },

  async markSyncFailed(
    id: string,
    failure: { error: string; nextSyncAt: Date | null }
  ): Promise<void> {
    const db = await getDb()
    await db
      .update(slackAlertMessage)
      .set({
        syncAttempts: sql`${slackAlertMessage.syncAttempts} + 1`,
        lastSyncError: failure.error.slice(0, 1000),
        // A null retry time with attempts exhausted parks the row; the claim
        // query skips it once sync_attempts reaches the limit.
        nextSyncAt: failure.nextSyncAt,
        updatedAt: new Date(),
      })
      .where(eq(slackAlertMessage.id, id))
  },

  /** Stops syncing messages that can never be updated (channel deleted, app removed). */
  async abandon(id: string, error: string): Promise<void> {
    const db = await getDb()
    await db
      .update(slackAlertMessage)
      .set({
        syncAttempts: 1_000_000,
        lastSyncError: error.slice(0, 1000),
        nextSyncAt: null,
        updatedAt: new Date(),
      })
      .where(eq(slackAlertMessage.id, id))
  },
}
