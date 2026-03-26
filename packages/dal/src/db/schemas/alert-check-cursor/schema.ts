import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { baseColumns } from '../common'
import { redisConnection } from '../redis-connection/schema'

export const alertCheckCursor = pgTable(
  'alert_check_cursor',
  {
    ...baseColumns,
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => redisConnection.id, { onDelete: 'cascade' }),
    queueName: text('queue_name').notNull(),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).notNull(),
    lastFailedCount: integer('last_failed_count').notNull().default(0),
    lastCompletedCount: integer('last_completed_count').notNull().default(0),
    lastMetricsSnapshot: jsonb('last_metrics_snapshot'),
  },
  (table) => ({
    uniqueConnectionQueue: uniqueIndex('alert_check_cursor_connection_queue_idx').on(
      table.connectionId,
      table.queueName
    ),
  })
)
