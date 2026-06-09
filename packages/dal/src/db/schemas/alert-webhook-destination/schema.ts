import { index, pgTable, text, uniqueIndex, boolean } from 'drizzle-orm/pg-core'
import { baseColumns } from '../common'
import { organization } from '../organization/schema'

export const alertWebhookDestination = pgTable(
  'alert_webhook_destination',
  {
    ...baseColumns,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    encryptedSigningSecret: text('encrypted_signing_secret'),
    enabled: boolean('enabled').notNull().default(true),
  },
  (table) => ({
    organizationIdx: index('alert_webhook_destination_org_idx').on(table.organizationId),
    organizationNameIdx: uniqueIndex('alert_webhook_destination_org_name_idx').on(
      table.organizationId,
      table.name
    ),
  })
)
