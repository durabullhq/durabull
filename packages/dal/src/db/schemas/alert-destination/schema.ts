import { boolean, index, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { baseColumns } from '../common'
import { organization } from '../organization/schema'

export const alertDestinationTypes = ['webhook', 'email', 'linear'] as const
export type AlertDestinationType = (typeof alertDestinationTypes)[number]

export interface AlertEmailDestinationConfig {
  target: string
}

export interface AlertLinearDestinationConfig {
  teamId?: string
  projectId?: string
  labelIds?: string[]
  assigneeId?: string
  stateId?: string
  priority?: number
}

export type AlertDestinationConfig =
  | AlertEmailDestinationConfig
  | AlertLinearDestinationConfig
  | Record<string, never>

export const alertDestination = pgTable(
  'alert_destination',
  {
    ...baseColumns,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').$type<AlertDestinationType>().notNull().default('webhook'),
    // Webhook destinations only; email/linear destinations keep their settings in config.
    url: text('url'),
    encryptedSigningSecret: text('encrypted_signing_secret'),
    config: jsonb('config').$type<AlertDestinationConfig>().notNull().default({}),
    enabled: boolean('enabled').notNull().default(true),
  },
  (table) => ({
    organizationIdx: index('alert_destination_org_idx').on(table.organizationId),
    organizationNameIdx: uniqueIndex('alert_destination_org_name_idx').on(
      table.organizationId,
      table.name
    ),
  })
)

/** @deprecated Use alertDestination — webhook destinations are now typed alert destinations. */
export const alertWebhookDestination = alertDestination
