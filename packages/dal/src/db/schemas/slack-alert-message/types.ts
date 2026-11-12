import type { slackAlertMessage } from './schema'

export type SlackAlertMessage = typeof slackAlertMessage.$inferSelect
export type NewSlackAlertMessage = typeof slackAlertMessage.$inferInsert
export type { SlackAlertMessageState } from './schema'
