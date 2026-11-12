import type { slackOauthState } from './schema'

export type SlackOauthState = typeof slackOauthState.$inferSelect
export type NewSlackOauthState = typeof slackOauthState.$inferInsert
