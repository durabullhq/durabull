import type { alertEvent } from './schema'

export type AlertEvent = typeof alertEvent.$inferSelect
export type NewAlertEvent = typeof alertEvent.$inferInsert
export type { AlertEventStatus } from './schema'
