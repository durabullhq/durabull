/**
 * Export all table schemas without relations.
 * This file exists to avoid circular dependencies in the relations definition.
 */

// Auth schema tables
export { authAccount, authSession, authVerification } from './auth/schema'

// Alert schema tables
export { alertCheckCursor } from './alert-check-cursor/schema'
export { alertEvent } from './alert-event/schema'
export { alertRule } from './alert-rule/schema'

// Organization schema tables
export { invitation, member, organization } from './organization/schema'

// Redis Connection schema tables
export { connectionEnvironments, redisConnection } from './redis-connection/schema'
export { redisDiscoveredQueue } from './redis-discovered-queue/schema'

// User schema tables
export { user } from './user/schema'

// User settings schema tables
export { userSettings } from './user-settings/schema'
