import type { slackInstallation } from './schema'

export type SlackInstallation = typeof slackInstallation.$inferSelect
export type NewSlackInstallation = typeof slackInstallation.$inferInsert
export type { SlackInstallationStatus } from './schema'
