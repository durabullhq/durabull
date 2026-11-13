import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { alertDelivery } from '../alert-delivery/schema'
import { alertEvent } from '../alert-event/schema'
import { baseColumns } from '../common'
import { organization } from '../organization/schema'

/** What a Slack alert message currently shows. */
export const slackAlertMessageStates = ['firing', 'acknowledged', 'resolved'] as const
export type SlackAlertMessageState = (typeof slackAlertMessageStates)[number]

/**
 * A Slack message posted for one alert delivery. The message is re-rendered
 * whenever its incident's state no longer matches `renderedState`, so
 * acknowledging or resolving anywhere (web, Slack, MCP, auto-resolve) converges
 * on Slack without every call site knowing about Slack.
 */
export const slackAlertMessage = pgTable(
  'slack_alert_message',
  {
    ...baseColumns,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    alertEventId: uuid('alert_event_id')
      .notNull()
      .references(() => alertEvent.id, { onDelete: 'cascade' }),
    alertDeliveryId: uuid('alert_delivery_id')
      .notNull()
      .references(() => alertDelivery.id, { onDelete: 'cascade' }),
    destinationId: uuid('destination_id'),
    slackTeamId: text('slack_team_id').notNull(),
    channelId: text('channel_id').notNull(),
    messageTs: text('message_ts').notNull(),
    permalink: text('permalink'),
    renderedState: text('rendered_state').$type<SlackAlertMessageState>().notNull(),
    /** Acknowledging user rendered on the message, so a re-ack by someone else re-renders. */
    renderedAcknowledgedBy: text('rendered_acknowledged_by'),
    syncAttempts: integer('sync_attempts').notNull().default(0),
    nextSyncAt: timestamp('next_sync_at', { withTimezone: true }),
    /** Identifies the worker holding the current lease; completion writes must match it. */
    syncLeaseToken: text('sync_lease_token'),
    /** Re-render even though the incident state is unchanged (snooze, settings change). */
    refreshRequestedAt: timestamp('refresh_requested_at', { withTimezone: true }),
    lastSyncError: text('last_sync_error'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  },
  (table) => ({
    deliveryIdx: uniqueIndex('slack_alert_message_delivery_idx').on(table.alertDeliveryId),
    eventIdx: index('slack_alert_message_event_idx').on(table.alertEventId),
    channelTsIdx: index('slack_alert_message_channel_ts_idx').on(table.channelId, table.messageTs),
  })
)
