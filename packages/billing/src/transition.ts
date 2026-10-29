import type { SubscriptionStatus } from './resolve'

/** Public Durabull Cloud pricing page, linked from the product, emails and docs. */
export const CLOUD_PRICING_URL = 'https://durabull.io/pricing'

/**
 * Statuses of a subscription that still exists in Stripe. While one exists an
 * organization may not start a second Checkout or be deleted.
 */
export const LIVE_SUBSCRIPTION_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
])

/**
 * Statuses meaning the organization has chosen a plan for the beta transition:
 * paying, in a trial, or retrying a renewal. An incomplete first payment or an
 * unpaid subscription has not, so those owners keep getting the notices.
 */
export const PLAN_CHOSEN_SUBSCRIPTION_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'trialing',
  'past_due',
])

const DAY_MS = 24 * 60 * 60 * 1000

/** The beta transition's final week: last reminder window and a banner that cannot be dismissed. */
export const TRANSITION_FINAL_WEEK_MS = 7 * DAY_MS
/** Reminders are not sent this soon after the notice, so owners never get two emails at once. */
export const TRANSITION_REMINDER_MIN_GAP_MS = 2 * DAY_MS

export type TransitionReminder = 'reminder_7d' | 'reminder_1d'

/**
 * The reminder due for a beta grant ending at `deadline`, given when the
 * notice was sent. Null when none is due.
 */
export function dueTransitionReminder(
  deadline: Date,
  noticeSentAt: Date,
  now: Date
): TransitionReminder | null {
  const remaining = deadline.getTime() - now.getTime()
  if (remaining <= 0) return null
  if (now.getTime() - noticeSentAt.getTime() < TRANSITION_REMINDER_MIN_GAP_MS) return null
  if (remaining <= DAY_MS) return 'reminder_1d'
  if (remaining <= TRANSITION_FINAL_WEEK_MS) return 'reminder_7d'
  return null
}

/** The transition deadline as shown to customers: date and time in UTC. */
export function formatTransitionDeadline(deadline: Date): string {
  const date = deadline.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const time = deadline.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  })
  return `${date} at ${time} UTC`
}
