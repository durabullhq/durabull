import {
  bigint,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns } from '../common'
import { redisConnection } from '../redis-connection/schema'

export const redisHealthSample = pgTable(
  'redis_health_sample',
  {
    ...baseColumns,
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => redisConnection.id, { onDelete: 'cascade' }),
    // Samples are normalized to a minute bucket before insert. This both bounds
    // storage and makes concurrent collectors idempotent.
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    memoryCapacitySource: text('memory_capacity_source').notNull().default('unknown'),
    memoryUsagePercent: doublePrecision('memory_usage_percent'),
    usedMemoryBytes: bigint('used_memory_bytes', { mode: 'number' }),
    residentMemoryBytes: bigint('resident_memory_bytes', { mode: 'number' }),
    memoryCapacityBytes: bigint('memory_capacity_bytes', { mode: 'number' }),
    cpuUsagePercent: doublePrecision('cpu_usage_percent'),
    cpuSeconds: doublePrecision('cpu_seconds'),
    memoryFragmentationRatio: doublePrecision('memory_fragmentation_ratio'),
    memoryFragmentationBytes: bigint('memory_fragmentation_bytes', { mode: 'number' }),
    connectedClientsPercent: doublePrecision('connected_clients_percent'),
    connectedClients: integer('connected_clients'),
    maxClients: integer('max_clients'),
    blockedClients: integer('blocked_clients'),
    evictedKeys: bigint('evicted_keys', { mode: 'number' }),
    evictedKeysPerMinute: doublePrecision('evicted_keys_per_minute'),
    rejectedConnections: bigint('rejected_connections', { mode: 'number' }),
    rejectedConnectionsPerMinute: doublePrecision('rejected_connections_per_minute'),
  },
  (table) => ({
    // This unique index also serves connection-scoped time range queries.
    connectionMinuteIdx: uniqueIndex('redis_health_sample_connection_minute_idx').on(
      table.connectionId,
      table.capturedAt
    ),
    capturedAtIdx: index('redis_health_sample_captured_at_idx').on(table.capturedAt),
  })
)
