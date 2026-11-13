import {
  type BillingInterval,
  comparePlans,
  isPlanCode,
  PLANS,
  type PlanCode,
} from '@durabull/api-client/billing'
import type { EnabledBillingOverview, PortalRequest } from '@/hooks/use-billing'

type Subscription = NonNullable<EnabledBillingOverview['subscription']>

/** Where the organization's subscription stands, in the terms the page explains. */
export type SubscriptionStanding =
  | 'none'
  | 'trialing'
  | 'active'
  /** Cancellation scheduled; the plan runs until the period ends. */
  | 'ending'
  /** A renewal failed; paid access continues during grace. */
  | 'overdue_grace'
  /** A payment is overdue and grace is over (or never applied): paid access is on hold. */
  | 'overdue_lapsed'
  /** The first payment was never completed. */
  | 'incomplete'
  | 'paused'

export interface BillingState {
  /** The subscription that still exists in Stripe; null once canceled or expired. */
  subscription: Subscription | null
  standing: SubscriptionStanding
  /** The plan the subscription is for, which can differ from the plan that applies. */
  subscribedPlan: PlanCode | null
  interval: BillingInterval | null
  /** Card-billed and changeable in the Customer Portal (not an invoiced agreement). */
  selfServe: boolean
}

const ENDED_STATUSES = ['canceled', 'incomplete_expired']

function standingOf(subscription: Subscription, source: string): SubscriptionStanding {
  switch (subscription.status) {
    case 'trialing':
      return subscription.cancelAtPeriodEnd ? 'ending' : 'trialing'
    case 'active':
      return subscription.cancelAtPeriodEnd ? 'ending' : 'active'
    // Overdue only takes paid access away once the organization is actually
    // on Free; a grace period, beta grant or override keeps it meanwhile.
    case 'past_due':
    case 'unpaid':
      return source === 'free' ? 'overdue_lapsed' : 'overdue_grace'
    case 'incomplete':
      return 'incomplete'
    case 'paused':
      return 'paused'
    default:
      return 'active'
  }
}

export function describeBilling(overview: EnabledBillingOverview): BillingState {
  const subscription =
    overview.subscription && !ENDED_STATUSES.includes(overview.subscription.status)
      ? overview.subscription
      : null
  if (!subscription) {
    return {
      subscription: null,
      standing: 'none',
      subscribedPlan: null,
      interval: null,
      selfServe: true,
    }
  }
  const subscribedPlan = isPlanCode(subscription.planCode) ? subscription.planCode : null
  return {
    subscription,
    standing: standingOf(subscription, overview.source),
    subscribedPlan,
    interval:
      subscription.interval === 'year'
        ? 'year'
        : subscription.interval === 'month'
          ? 'month'
          : null,
    selfServe: subscription.collectionMethod !== 'send_invoice' && subscribedPlan !== 'enterprise',
  }
}

/** What a plan column offers the person looking at it. */
export type PlanAction =
  /** The plan and interval the organization is on. */
  | { kind: 'current' }
  /** Start hosted Checkout for a new subscription. */
  | { kind: 'checkout'; label: string }
  /** Change the existing subscription in the Customer Portal. */
  | { kind: 'change'; label: string }
  /** Cancel the subscription at period end (the way down to Free). */
  | { kind: 'cancel'; label: string }
  /** The subscription needs a payment before anything else can change. */
  | { kind: 'fix_payment'; label: string }
  | { kind: 'contact_sales' }
  /** Nothing to click; an optional explanation of why. */
  | { kind: 'none'; note?: string }

/**
 * Where in the Customer Portal a payment problem is fixed. During grace the
 * card is the problem, so the card update opens directly. Once an invoice is
 * unpaid (lapsed or a first payment not completed) or the subscription is
 * paused, the portal home is the right place: it lists the open invoice to
 * pay, and the card can be changed there too. Every "fix payment" button uses
 * this so they all lead to the same place.
 */
export function paymentFixRequest(state: BillingState): PortalRequest {
  return state.standing === 'overdue_grace' ? { intent: 'payment_method' } : { intent: 'manage' }
}

const OWNER_NOTE = 'Ask your organization owner to upgrade.'

/**
 * The single next step a plan column offers, for every subscription state.
 * Existing subscribers never get a second Checkout: changes go through the
 * Customer Portal so Stripe discloses proration.
 */
export function planAction(
  overview: EnabledBillingOverview,
  state: BillingState,
  code: PlanCode,
  interval: BillingInterval
): PlanAction {
  if (code === 'enterprise') return { kind: 'contact_sales' }
  const owner = overview.canManageBilling
  const name = PLANS[code].name

  if (code === 'free') {
    if (!state.subscription) {
      return overview.source === 'free' ? { kind: 'current' } : { kind: 'none' }
    }
    if (state.standing === 'ending') return { kind: 'none' }
    if (!owner || !state.selfServe) return { kind: 'none' }
    if (state.standing === 'incomplete' || state.standing === 'paused') return { kind: 'none' }
    return {
      kind: 'cancel',
      label: state.standing === 'overdue_lapsed' ? 'Cancel subscription' : 'Downgrade to Free',
    }
  }

  if (!state.subscription) {
    if (!owner) return { kind: 'none', note: OWNER_NOTE }
    if (!overview.purchasesEnabled) return { kind: 'none' }
    // During the beta grant or an arranged plan nothing is being "upgraded".
    const choosing = overview.source === 'migration_grant' || overview.source === 'override'
    return { kind: 'checkout', label: choosing ? `Choose ${name}` : `Upgrade to ${name}` }
  }

  const samePlan = state.subscribedPlan === code
  const blocked =
    state.standing === 'overdue_lapsed' ||
    state.standing === 'incomplete' ||
    state.standing === 'paused'
  if (samePlan && (state.interval === interval || state.interval === null)) {
    if (blocked && owner && state.selfServe) {
      return {
        kind: 'fix_payment',
        label: state.standing === 'paused' ? 'Resume subscription' : 'Fix payment',
      }
    }
    return { kind: 'current' }
  }
  if (!owner) return { kind: 'none', note: samePlan ? undefined : OWNER_NOTE }
  if (!state.selfServe) return { kind: 'none' }
  if (blocked) return { kind: 'none' }
  if (samePlan) {
    return {
      kind: 'change',
      label: interval === 'year' ? 'Switch to annual billing' : 'Switch to monthly billing',
    }
  }
  if (!state.subscribedPlan) return { kind: 'change', label: `Switch to ${name}` }
  return {
    kind: 'change',
    label:
      comparePlans(code, state.subscribedPlan) > 0 ? `Upgrade to ${name}` : `Downgrade to ${name}`,
  }
}

/** Whole months that annual billing saves over twelve monthly payments. */
export function annualMonthsFree(code: PlanCode): number {
  const { monthlyPriceUsd, annualPriceUsd } = PLANS[code]
  if (!monthlyPriceUsd || !annualPriceUsd) return 0
  return Math.max(0, Math.round(12 - annualPriceUsd / monthlyPriceUsd))
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function formatBillingDate(value: string | null | undefined): string | null {
  if (!value) return null
  return DATE_FORMAT.format(new Date(value))
}

/** An amount in a currency's minor units (cents) as money. */
export function formatMoney(amountMinor: number, currency: string): string {
  const format = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  })
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2
  return format.format(amountMinor / 10 ** digits)
}
