import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { timestampColumns } from '../common'
import { organization } from '../organization/schema'

/** Durable cross-replica idempotency record for closing a Linear issue. */
export const linearIssueResolution = pgTable(
  'linear_issue_resolution',
  {
    issueId: text('issue_id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    claimToken: text('claim_token'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // Prepared before the state change; reused after interruption or comment failure.
    commentId: uuid('comment_id'),
    ...timestampColumns,
  },
  (table) => ({
    completedIdx: index('linear_issue_resolution_completed_idx')
      .on(table.completedAt)
      .where(sql`${table.completedAt} IS NOT NULL`),
  })
)
