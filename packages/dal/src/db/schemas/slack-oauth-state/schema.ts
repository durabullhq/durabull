import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { baseColumns } from '../common'
import { organization } from '../organization/schema'

export const slackOauthState = pgTable(
  'slack_oauth_state',
  {
    ...baseColumns,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    stateHash: text('state_hash').notNull().unique(),
    redirectUri: text('redirect_uri').notNull(),
    /** Settings page to return to after Slack redirects back. */
    returnTo: text('return_to').notNull().default('integrations'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    expiresAtIdx: index('slack_oauth_state_expires_at_idx').on(table.expiresAt),
  })
)
