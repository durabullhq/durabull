import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { alertRule } from '../alert-rule/schema'
import { baseColumns } from '../common'
import { organization } from '../organization/schema'
import { redisConnection } from '../redis-connection/schema'
import { user } from '../user/schema'

export const alertEventStatuses = ['firing', 'resolved', 'suppressed'] as const
export type AlertEventStatus = (typeof alertEventStatuses)[number]
export const alertResolutionReasons = [
  'manual',
  'auto_job_completed',
  'auto_condition_cleared',
  'rule_changed',
  'legacy',
] as const
export type AlertResolutionReason = (typeof alertResolutionReasons)[number]

export const alertEvent = pgTable(
  'alert_event',
  {
    ...baseColumns,
    alertRuleId: uuid('alert_rule_id')
      .notNull()
      .references(() => alertRule.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => redisConnection.id, { onDelete: 'cascade' }),
    queueName: text('queue_name').notNull(),
    type: text('type').notNull(),
    status: text('status').$type<AlertEventStatus>().notNull().default('firing'),
    summary: text('summary').notNull(),
    context: jsonb('context'),
    dedupeKey: text('dedupe_key'),
    firedAt: timestamp('fired_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    // Acknowledgement is orthogonal to status: an acknowledged event stays
    // firing (and still auto-resolves); ack provenance survives resolution.
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: text('acknowledged_by').references(() => user.id, { onDelete: 'set null' }),
    notificationSentAt: timestamp('notification_sent_at', { withTimezone: true }),
    linearResolutionSyncPending: boolean('linear_resolution_sync_pending').notNull().default(false),
    linearResolutionSyncClaimToken: text('linear_resolution_sync_claim_token'),
    linearResolutionSyncClaimedAt: timestamp('linear_resolution_sync_claimed_at', {
      withTimezone: true,
    }),
    linearResolutionReason: text('linear_resolution_reason').$type<AlertResolutionReason>(),
    linearResolutionRetryAt: timestamp('linear_resolution_retry_at', { withTimezone: true }),
    linearResolutionAttempts: integer('linear_resolution_attempts').notNull().default(0),
    linearResolutionFailedAt: timestamp('linear_resolution_failed_at', { withTimezone: true }),
    linearResolutionLastError: text('linear_resolution_last_error'),
  },
  (table) => ({
    ruleStatusIdx: index('alert_event_rule_id_status_idx').on(table.alertRuleId, table.status),
    cleanupFiredAtIdx: index('alert_event_cleanup_fired_at_idx').on(table.firedAt),
    orgFiredAtIdx: index('alert_event_org_id_fired_at_idx').on(table.organizationId, table.firedAt),
    connQueueStatusIdx: index('alert_event_conn_queue_status_idx').on(
      table.connectionId,
      table.queueName,
      table.status
    ),
    ruleDedupeIdx: uniqueIndex('alert_event_rule_dedupe_key_idx').on(
      table.alertRuleId,
      table.dedupeKey
    ),
    activeRuleScopeIdx: uniqueIndex('alert_event_active_rule_scope_idx')
      .on(table.alertRuleId, table.queueName)
      .where(
        sql`${table.status} = 'firing' AND ${table.type} IN ('failure_threshold', 'failure_rate', 'queue_stalled', 'redis_health')`
      ),
    linearResolutionPendingIdx: index('alert_event_linear_resolution_pending_idx')
      .on(table.linearResolutionRetryAt, table.updatedAt)
      .where(sql`${table.status} = 'resolved' AND ${table.linearResolutionSyncPending} = true`),
  })
)
