import type { redisHealthSample } from './schema'

export type RedisHealthSample = typeof redisHealthSample.$inferSelect
export type NewRedisHealthSample = typeof redisHealthSample.$inferInsert
