import { boolean, pgTable, text } from 'drizzle-orm/pg-core'
import { baseColumns } from '../common'
import { organization } from '../organization/schema'

/**
 * Environment values for Redis connections
 */
export const connectionEnvironments = ['development', 'staging', 'production'] as const

export type ConnectionEnvironment = (typeof connectionEnvironments)[number]

/**
 * Redis connection table - stores Redis connection configurations
 * Connections are scoped to an organization
 */
export const redisConnection = pgTable('redis_connection', {
  ...baseColumns,
  name: text('name').notNull(),
  url: text('url').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  environment: text('environment').$type<ConnectionEnvironment>().default('development'),
  prefix: text('prefix').notNull().default('bull'),
  allowSelfSignedCerts: boolean('allow_self_signed_certs').notNull().default(false),
  // Disabled connections stop background polling, alert evaluation and
  // operational access, and do not count toward the plan's connection limit.
  enabled: boolean('enabled').notNull().default(true),
  // Organization that owns this connection
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
})
