import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { alertRule } from '../alert-rule/schema'
import { baseColumns } from '../common'
import { organization } from '../organization/schema'
import { redisConnection } from '../redis-connection/schema'

export const alertEventStatuses = ['firing', 'resolved', 'suppressed'] as const
export type AlertEventStatus = (typeof alertEventStatuses)[number]

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
    firedAt: timestamp('fired_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    notificationSentAt: timestamp('notification_sent_at', { withTimezone: true }),
  },
  (table) => ({
    ruleStatusIdx: index('alert_event_rule_id_status_idx').on(table.alertRuleId, table.status),
    orgFiredAtIdx: index('alert_event_org_id_fired_at_idx').on(table.organizationId, table.firedAt),
    connQueueStatusIdx: index('alert_event_conn_queue_status_idx').on(
      table.connectionId,
      table.queueName,
      table.status
    ),
  })
)
