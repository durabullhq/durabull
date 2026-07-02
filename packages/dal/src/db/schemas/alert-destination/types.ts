import type { alertDestination } from './schema'

export type AlertDestination = typeof alertDestination.$inferSelect
export type NewAlertDestination = typeof alertDestination.$inferInsert

/** @deprecated Use AlertDestination — webhook destinations are now typed alert destinations. */
export type AlertWebhookDestination = AlertDestination
/** @deprecated Use NewAlertDestination. */
export type NewAlertWebhookDestination = NewAlertDestination
