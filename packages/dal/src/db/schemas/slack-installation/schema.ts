import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { baseColumns } from '../common'
import { organization } from '../organization/schema'
import { user } from '../user/schema'

export const slackInstallationStatuses = ['active', 'revoked'] as const
export type SlackInstallationStatus = (typeof slackInstallationStatuses)[number]

/**
 * One Slack workspace installation per Durabull organization. A workspace may
 * be connected to several organizations; each keeps its own bot token row.
 */
export const slackInstallation = pgTable(
  'slack_installation',
  {
    ...baseColumns,
    organizationId: text('organization_id')
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: 'cascade' }),
    slackTeamId: text('slack_team_id').notNull(),
    slackTeamName: text('slack_team_name').notNull(),
    /** Workspace URL from auth.test, e.g. https://acme.slack.com/ */
    slackTeamUrl: text('slack_team_url'),
    slackEnterpriseId: text('slack_enterprise_id'),
    slackAppId: text('slack_app_id'),
    botUserId: text('bot_user_id').notNull(),
    encryptedBotToken: text('encrypted_bot_token').notNull(),
    /** Present only when the Slack app has token rotation enabled. */
    encryptedRefreshToken: text('encrypted_refresh_token'),
    botTokenExpiresAt: timestamp('bot_token_expires_at', { withTimezone: true }),
    scopes: text('scopes').notNull(),
    installedByUserId: text('installed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    installedBySlackUserId: text('installed_by_slack_user_id'),
    status: text('status').$type<SlackInstallationStatus>().notNull().default('active'),
    statusReason: text('status_reason'),
    /** Workspace members may acknowledge, resolve, snooze and retry from Slack. */
    actionsEnabled: boolean('actions_enabled').notNull().default(true),
    /** Durabull links pasted in Slack are previewed for members of this organization. */
    unfurlsEnabled: boolean('unfurls_enabled').notNull().default(true),
    lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
    /** When the current tokens were installed (each OAuth reconnect resets it). */
    installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
    /** Held while one API process redeems the (single-use) refresh token. */
    tokenRefreshLockUntil: timestamp('token_refresh_lock_until', { withTimezone: true }),
  },
  (table) => ({
    teamIdx: index('slack_installation_team_idx').on(table.slackTeamId),
  })
)
