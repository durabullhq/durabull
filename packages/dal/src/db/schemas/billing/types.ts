import type {
  billingCheckoutAttempt,
  billingEntitlementOverride,
  billingOperatorAction,
  billingResourceSuspension,
  billingSubscription,
  billingWebhookEvent,
  organizationBillingAccount,
  organizationEntitlement,
} from './schema'

export type OrganizationBillingAccount = typeof organizationBillingAccount.$inferSelect
export type NewOrganizationBillingAccount = typeof organizationBillingAccount.$inferInsert

export type BillingSubscription = typeof billingSubscription.$inferSelect
export type NewBillingSubscription = typeof billingSubscription.$inferInsert

export type OrganizationEntitlement = typeof organizationEntitlement.$inferSelect
export type NewOrganizationEntitlement = typeof organizationEntitlement.$inferInsert

export type BillingWebhookEvent = typeof billingWebhookEvent.$inferSelect
export type NewBillingWebhookEvent = typeof billingWebhookEvent.$inferInsert

export type BillingCheckoutAttempt = typeof billingCheckoutAttempt.$inferSelect
export type NewBillingCheckoutAttempt = typeof billingCheckoutAttempt.$inferInsert

export type BillingResourceSuspension = typeof billingResourceSuspension.$inferSelect
export type NewBillingResourceSuspension = typeof billingResourceSuspension.$inferInsert

export type BillingEntitlementOverride = typeof billingEntitlementOverride.$inferSelect
export type NewBillingEntitlementOverride = typeof billingEntitlementOverride.$inferInsert

export type BillingOperatorAction = typeof billingOperatorAction.$inferSelect
export type NewBillingOperatorAction = typeof billingOperatorAction.$inferInsert
