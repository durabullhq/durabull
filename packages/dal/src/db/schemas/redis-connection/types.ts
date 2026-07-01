import type { redisConnection } from './schema'

/**
 * Redis connection type - represents a stored connection
 */
export type RedisConnection = typeof redisConnection.$inferSelect

/**
 * New Redis connection type - for creating connections
 */
export type NewRedisConnection = typeof redisConnection.$inferInsert

// Re-export types from schema for backwards compatibility
export type { ConnectionEnvironment, ConnectionMode } from './schema'
