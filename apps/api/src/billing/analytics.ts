import {
  captureMcpAnalyticsServerEvent,
  resolveIdentifiedDistinctIds,
  tryGetServerAnalyticsOptions,
} from '@durabull/analytics/server'

export type BillingAnalyticsEvent =
  | 'checkout_started'
  | 'checkout_completed'
  | 'trial_started'
  | 'trial_ended'
  | 'subscription_activated'
  | 'plan_changed'
  | 'payment_failed'
  | 'subscription_canceled'
  | 'feature_denied'
  | 'upgrade_prompt_shown'

/**
 * Record a coarse billing event against the organization's hashed analytics
 * group. Only plan and feature identifiers are sent: never job data, Redis
 * credentials, queue names or billing personal data. Paid conversion and MRR
 * are reconciled from Stripe, not from these events.
 */
export function recordBillingEvent(
  event: BillingAnalyticsEvent,
  organizationId: string,
  properties: Record<string, string | number | boolean | null> = {}
): void {
  const options = tryGetServerAnalyticsOptions()
  if (!options?.enabled) return
  const identified = resolveIdentifiedDistinctIds({ organizationId })
  if (!identified.distinctId) return
  void captureMcpAnalyticsServerEvent({
    event,
    properties,
    includeAnonymous: false,
    identifiedDistinctId: identified.distinctId,
    organizationId,
  }).catch((error) => {
    console.warn('[billing] Failed to record analytics event:', String(error))
  })
}
