import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { baseColumns, timestampColumns } from '../common'
import { organization } from '../organization/schema'
import { user } from '../user/schema'

/** Limits are stored as JSON keyed by catalog limit key; null means uncapped. */
export type BillingLimitsJson = Record<string, number | null>

/**
 * Binds one organization to exactly one Stripe Customer. The billing email can
 * change and be shared, so it is never used as an identifier.
 */
export const organizationBillingAccount = pgTable(
  'organization_billing_account',
  {
    organizationId: text('organization_id')
      .primaryKey()
      .references(() => organization.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id').notNull(),
    livemode: boolean('livemode').notNull().default(false),
    billingContactUserId: text('billing_contact_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    trialConsumedAt: timestamp('trial_consumed_at', { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [uniqueIndex('organization_billing_account_customer_idx').on(table.stripeCustomerId)]
)

/**
 * Local projection of Stripe subscriptions. History rows are kept; at most one
 * row per organization is the current base subscription.
 */
export const billingSubscription = pgTable(
  'billing_subscription',
  {
    ...baseColumns,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    stripeSubscriptionId: text('stripe_subscription_id').notNull(),
    stripeCustomerId: text('stripe_customer_id').notNull(),
    stripePriceId: text('stripe_price_id'),
    stripeSubscriptionItemId: text('stripe_subscription_item_id'),
    planCode: text('plan_code'),
    billingInterval: text('billing_interval'),
    status: text('status').notNull(),
    collectionMethod: text('collection_method').notNull().default('charge_automatically'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    cancelAt: timestamp('cancel_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    trialStart: timestamp('trial_start', { withTimezone: true }),
    trialEnd: timestamp('trial_end', { withTimezone: true }),
    pauseCollection: boolean('pause_collection').notNull().default(false),
    latestInvoiceId: text('latest_invoice_id'),
    latestInvoiceStatus: text('latest_invoice_status'),
    latestInvoicePaid: boolean('latest_invoice_paid'),
    /** Period end covered by the most recent paid invoice: the payment evidence. */
    paidThrough: timestamp('paid_through', { withTimezone: true }),
    /** Plan of the most recent paid invoice, used for grace and unpaid upgrades. */
    lastPaidPlanCode: text('last_paid_plan_code'),
    pastDueSince: timestamp('past_due_since', { withTimezone: true }),
    isCurrent: boolean('is_current').notNull().default(false),
    stripeCreatedAt: timestamp('stripe_created_at', { withTimezone: true }),
    lastReconciledAt: timestamp('last_reconciled_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('billing_subscription_stripe_id_idx').on(table.stripeSubscriptionId),
    uniqueIndex('billing_subscription_current_idx')
      .on(table.organizationId)
      .where(sql`${table.isCurrent}`),
    index('billing_subscription_org_idx').on(table.organizationId),
  ]
)

/**
 * Materialized effective entitlement. It is the authority for database-level
 * capacity enforcement and the cached snapshot for request-time checks.
 */
export const organizationEntitlement = pgTable('organization_entitlement', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  planCode: text('plan_code').notNull(),
  subscribedPlanCode: text('subscribed_plan_code'),
  source: text('source').notNull(),
  catalogVersion: text('catalog_version').notNull(),
  revision: integer('revision').notNull().default(1),
  features: jsonb('features').$type<string[]>().notNull().default([]),
  limits: jsonb('limits').$type<BillingLimitsJson>().notNull().default({}),
  /** When false the row is informational (shadow mode) and capacity triggers ignore it. */
  enforced: boolean('enforced').notNull().default(false),
  degraded: boolean('degraded').notNull().default(false),
  notices: jsonb('notices').$type<string[]>().notNull().default([]),
  lastPaidPlanCode: text('last_paid_plan_code'),
  graceExpiresAt: timestamp('grace_expires_at', { withTimezone: true }),
  migrationGrantExpiresAt: timestamp('migration_grant_expires_at', { withTimezone: true }),
  capacityAdjustmentExpiresAt: timestamp('capacity_adjustment_expires_at', { withTimezone: true }),
  lastCapacityAdjustmentEndedAt: timestamp('last_capacity_adjustment_ended_at', {
    withTimezone: true,
  }),
  historyRetentionFloorDays: integer('history_retention_floor_days'),
  historyRetentionFloorExpiresAt: timestamp('history_retention_floor_expires_at', {
    withTimezone: true,
  }),
  contractLimits: jsonb('contract_limits').$type<BillingLimitsJson>(),
  reevaluateAt: timestamp('reevaluate_at', { withTimezone: true }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  ...timestampColumns,
})

export const billingWebhookEventStatuses = [
  'pending',
  'processing',
  'processed',
  'failed',
  'dead',
] as const
export type BillingWebhookEventStatus = (typeof billingWebhookEventStatuses)[number]

/** Durable inbox for Stripe events. Duplicate deliveries collapse on the event id. */
export const billingWebhookEvent = pgTable(
  'billing_webhook_event',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    livemode: boolean('livemode').notNull().default(false),
    stripeObjectId: text('stripe_object_id'),
    stripeCustomerId: text('stripe_customer_id'),
    organizationId: text('organization_id'),
    status: text('status').$type<BillingWebhookEventStatus>().notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    lastError: text('last_error'),
    stripeCreatedAt: timestamp('stripe_created_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    index('billing_webhook_event_due_idx').on(table.status, table.nextAttemptAt),
    index('billing_webhook_event_customer_idx').on(table.stripeCustomerId),
  ]
)

export const billingCheckoutAttemptStatuses = ['open', 'completed', 'expired', 'failed'] as const
export type BillingCheckoutAttemptStatus = (typeof billingCheckoutAttemptStatuses)[number]

/** One open purchase attempt per organization prevents duplicate subscriptions. */
export const billingCheckoutAttempt = pgTable(
  'billing_checkout_attempt',
  {
    ...baseColumns,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    planCode: text('plan_code').notNull(),
    billingInterval: text('billing_interval').notNull(),
    stripePriceId: text('stripe_price_id').notNull(),
    trial: boolean('trial').notNull().default(false),
    stripeSessionId: text('stripe_session_id'),
    url: text('url'),
    status: text('status').$type<BillingCheckoutAttemptStatus>().notNull().default('open'),
    idempotencyKey: text('idempotency_key').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('billing_checkout_attempt_open_idx')
      .on(table.organizationId)
      .where(sql`${table.status} = 'open'`),
    uniqueIndex('billing_checkout_attempt_session_idx').on(table.stripeSessionId),
  ]
)

export const billingResourceKinds = [
  'connection',
  'member',
  'invitation',
  'alert_rule',
  'alert_destination',
  'service_account',
] as const
export type BillingResourceKind = (typeof billingResourceKinds)[number]

/**
 * Reversible suspension of resources above a plan's limits. Suspension never
 * deletes the resource or its configuration.
 */
export const billingResourceSuspension = pgTable(
  'billing_resource_suspension',
  {
    ...baseColumns,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    resourceKind: text('resource_kind').$type<BillingResourceKind>().notNull(),
    resourceId: text('resource_id').notNull(),
    reason: text('reason').notNull(),
  },
  (table) => [
    uniqueIndex('billing_resource_suspension_resource_idx').on(
      table.resourceKind,
      table.resourceId
    ),
    index('billing_resource_suspension_org_idx').on(table.organizationId),
  ]
)

/**
 * Manual entitlement overrides. Every row needs an owner, reason and expiry;
 * revocation keeps the row as the audit record.
 */
export const billingEntitlementOverride = pgTable(
  'billing_entitlement_override',
  {
    ...baseColumns,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    planCode: text('plan_code').notNull(),
    limits: jsonb('limits').$type<BillingLimitsJson>(),
    reason: text('reason').notNull(),
    createdBy: text('created_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: text('revoked_by'),
  },
  (table) => [index('billing_entitlement_override_org_idx').on(table.organizationId)]
)

/**
 * Audit trail for manual billing changes (operator overrides, contract limits,
 * beta grants) and for organization deletion. Rows outlive the organization so
 * later refunds or disputes can still be matched to it.
 */
export const billingOperatorAction = pgTable(
  'billing_operator_action',
  {
    ...baseColumns,
    organizationId: text('organization_id').notNull(),
    action: text('action').notNull(),
    actor: text('actor').notNull(),
    reason: text('reason').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>(),
  },
  (table) => [index('billing_operator_action_org_idx').on(table.organizationId)]
)

export const billingNoticeKinds = ['transition_notice', 'reminder_7d', 'reminder_1d'] as const
export type BillingNoticeKind = (typeof billingNoticeKinds)[number]

export const billingNoticeStatuses = ['sending', 'sent', 'failed'] as const
export type BillingNoticeStatus = (typeof billingNoticeStatuses)[number]

/**
 * One row per billing notice email per organization owner. The unique key
 * makes sending idempotent: a notice is claimed before it is sent, and only a
 * failed (or long-stuck) claim can be retried.
 */
export const billingNoticeDelivery = pgTable(
  'billing_notice_delivery',
  {
    ...baseColumns,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<BillingNoticeKind>().notNull(),
    userId: text('user_id').notNull(),
    email: text('email').notNull(),
    status: text('status').$type<BillingNoticeStatus>().notNull(),
    attempts: integer('attempts').notNull().default(1),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('billing_notice_delivery_unique_idx').on(
      table.organizationId,
      table.kind,
      table.userId
    ),
  ]
)
