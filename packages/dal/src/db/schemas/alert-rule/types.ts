import type { alertRule } from './schema'

export type AlertRule = typeof alertRule.$inferSelect
export type NewAlertRule = typeof alertRule.$inferInsert
export type { AlertRuleType, QueueFilterMode } from './schema'
