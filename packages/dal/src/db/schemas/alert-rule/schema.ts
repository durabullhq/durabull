import { boolean, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { baseColumns } from '../common'
import { organization } from '../organization/schema'
import { redisConnection } from '../redis-connection/schema'

export const alertRuleTypes = ['failure_threshold', 'failure_rate', 'queue_stalled'] as const
export type AlertRuleType = (typeof alertRuleTypes)[number]

export const queueFilterModes = ['include', 'exclude'] as const
export type QueueFilterMode = (typeof queueFilterModes)[number]

export const alertRule = pgTable('alert_rule', {
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
  queueFilterMode: text('queue_filter_mode').$type<QueueFilterMode>(),
  filterQueueNames: jsonb('filter_queue_names').$type<string[]>().default([]),
})
