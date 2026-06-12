import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { alertEvent } from '../alert-event/schema'
import { baseColumns } from '../common'
import { organization } from '../organization/schema'

export const alertDeliveryStatuses = ['pending', 'claimed', 'delivered', 'failed'] as const
export type AlertDeliveryStatus = (typeof alertDeliveryStatuses)[number]

export const alertDeliveryChannelTypes = ['email', 'linear', 'webhook'] as const
export type AlertDeliveryChannelType = (typeof alertDeliveryChannelTypes)[number]

export const alertDelivery = pgTable(
  'alert_delivery',
  {
    ...baseColumns,
    alertEventId: uuid('alert_event_id')
      .notNull()
      .references(() => alertEvent.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    channelType: text('channel_type').$type<AlertDeliveryChannelType>().notNull(),
    target: text('target').notNull(),
    status: text('status').$type<AlertDeliveryStatus>().notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    lastError: text('last_error'),
    providerMetadata: jsonb('provider_metadata').$type<Record<string, unknown>>().default({}),
    externalId: text('external_id'),
    externalIdentifier: text('external_identifier'),
    externalUrl: text('external_url'),
  },
  (table) => ({
    eventIdx: index('alert_delivery_event_id_idx').on(table.alertEventId),
    orgStatusRetryIdx: index('alert_delivery_org_status_retry_idx').on(
      table.organizationId,
      table.status,
      table.nextRetryAt
    ),
    pendingCreatedIdx: index('alert_delivery_pending_created_idx')
      .on(table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    failedRetryCreatedIdx: index('alert_delivery_failed_retry_created_idx')
      .on(table.nextRetryAt, table.createdAt)
      .where(sql`${table.status} = 'failed' AND ${table.nextRetryAt} IS NOT NULL`),
    claimedStaleIdx: index('alert_delivery_claimed_stale_idx')
      .on(table.claimedAt)
      .where(sql`${table.status} = 'claimed'`),
    eventChannelTargetIdx: uniqueIndex('alert_delivery_event_channel_target_idx').on(
      table.alertEventId,
      table.channelType,
      table.target
    ),
  })
)
