import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { baseColumns } from '../common'
import { organization } from '../organization/schema'
import { redisConnection } from '../redis-connection/schema'

export const alertRuleTypes = [
  'failure_threshold',
  'failure_rate',
  'queue_stalled',
  'job_failed',
  'redis_health',
] as const
export type AlertRuleType = (typeof alertRuleTypes)[number]

export const queueFilterModes = ['include', 'exclude'] as const
export type QueueFilterMode = (typeof queueFilterModes)[number]

export const alertRule = pgTable(
  'alert_rule',
  {
    ...baseColumns,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => redisConnection.id, { onDelete: 'cascade' }),
    queueName: text('queue_name'),
    name: text('name').notNull(),
    type: text('type').$type<AlertRuleType>().notNull(),
    config: jsonb('config').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    notificationChannels: jsonb('notification_channels').notNull().default([]),
    cooldownMinutes: integer('cooldown_minutes').notNull().default(30),
    // Temporary snooze: the monitor skips this rule until the timestamp passes.
    // Distinct from enabled=false, which is a permanent off switch.
    mutedUntil: timestamp('muted_until', { withTimezone: true }),
    // Deletion is finalized asynchronously after durable external-resolution
    // work has drained, so cascading deletes never discard Linear issue links.
    deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
    deletionRetryAt: timestamp('deletion_retry_at', { withTimezone: true }),
    deletionClaimToken: text('deletion_claim_token'),
    deletionClaimedAt: timestamp('deletion_claimed_at', { withTimezone: true }),
    queueFilterMode: text('queue_filter_mode').$type<QueueFilterMode>(),
    filterQueueNames: jsonb('filter_queue_names').$type<string[]>().default([]),
  },
  (table) => ({
    deletionRequestedIdx: index('alert_rule_deletion_requested_idx')
      .on(table.deletionRetryAt, table.deletionRequestedAt)
      .where(sql`${table.deletionRequestedAt} IS NOT NULL`),
  })
)
