import type { PLANS } from '@durabull/api-client/billing'
import { describe, expect, it } from 'vitest'
import type { EnabledBillingOverview } from '@/hooks/use-billing'
import { annualMonthsFree, describeBilling, formatMoney, planAction } from './billing-state'

type Subscription = NonNullable<EnabledBillingOverview['subscription']>

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    status: 'active',
    planCode: 'team',
    interval: 'month',
    currentPeriodEnd: '2026-12-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    cancelAt: null,
    trialEnd: null,
    collectionMethod: 'charge_automatically',
    ...overrides,
  }
}

function overview(overrides: Partial<EnabledBillingOverview> = {}): EnabledBillingOverview {
  return {
    planCode: 'free',
    source: 'free',
    subscription: null,
    canManageBilling: true,
    purchasesEnabled: true,
    ...overrides,
  } as EnabledBillingOverview
}

function action(
  input: Partial<EnabledBillingOverview>,
  code: keyof typeof PLANS,
  interval: 'month' | 'year' = 'month'
) {
  const data = overview(input)
  return planAction(data, describeBilling(data), code, interval)
}

describe('describeBilling', () => {
  it('treats ended subscriptions as no subscription', () => {
    for (const status of ['canceled', 'incomplete_expired']) {
      const state = describeBilling(overview({ subscription: subscription({ status }) }))
      expect(state).toMatchObject({ subscription: null, standing: 'none' })
    }
  })

  it('separates grace from a lapsed overdue subscription', () => {
    const pastDue = subscription({ status: 'past_due' })
    expect(
      describeBilling(overview({ source: 'payment_grace' as const, subscription: pastDue }))
        .standing
    ).toBe('overdue_grace')
    expect(describeBilling(overview({ source: 'free', subscription: pastDue })).standing).toBe(
      'overdue_lapsed'
    )
    expect(
      describeBilling(overview({ subscription: subscription({ status: 'unpaid' }) })).standing
    ).toBe('overdue_lapsed')
  })

  it('does not call paid access lapsed while a beta grant or override still gives it', () => {
    for (const source of ['migration_grant', 'override', 'subscription'] as const) {
      expect(
        describeBilling(overview({ source, subscription: subscription({ status: 'past_due' }) }))
          .standing
      ).toBe('overdue_grace')
    }
  })

  it('marks invoiced agreements as not self-serve', () => {
    expect(
      describeBilling(
        overview({ subscription: subscription({ collectionMethod: 'send_invoice' }) })
      ).selfServe
    ).toBe(false)
    expect(
      describeBilling(overview({ subscription: subscription({ planCode: 'enterprise' }) }))
        .selfServe
    ).toBe(false)
  })
})

describe('planAction', () => {
  it('offers Checkout to a Free owner and nothing to buy to other members', () => {
    expect(action({}, 'free')).toEqual({ kind: 'current' })
    expect(action({}, 'team')).toEqual({ kind: 'checkout', label: 'Upgrade to Team' })
    expect(action({ canManageBilling: false }, 'team')).toEqual({
      kind: 'none',
      note: 'Ask your organization owner to upgrade.',
    })
    expect(action({ purchasesEnabled: false }, 'business')).toEqual({ kind: 'none' })
    expect(action({}, 'enterprise')).toEqual({ kind: 'contact_sales' })
  })

  it('changes an existing subscription in the portal, labelled by direction', () => {
    const team = {
      planCode: 'team' as const,
      source: 'subscription' as const,
      subscription: subscription(),
    }
    expect(action(team, 'team')).toEqual({ kind: 'current' })
    expect(action(team, 'team', 'year')).toEqual({
      kind: 'change',
      label: 'Switch to annual billing',
    })
    expect(action(team, 'business')).toEqual({ kind: 'change', label: 'Upgrade to Business' })
    expect(action(team, 'free')).toEqual({ kind: 'cancel', label: 'Downgrade to Free' })
    const business = {
      planCode: 'business' as const,
      source: 'subscription' as const,
      subscription: subscription({ planCode: 'business', interval: 'year' }),
    }
    expect(action(business, 'team', 'year')).toEqual({ kind: 'change', label: 'Downgrade to Team' })
    expect(action(business, 'business', 'month')).toEqual({
      kind: 'change',
      label: 'Switch to monthly billing',
    })
  })

  it('never offers a non-owner a plan change', () => {
    const member = {
      planCode: 'team' as const,
      source: 'subscription' as const,
      canManageBilling: false,
      subscription: subscription(),
    }
    expect(action(member, 'team')).toEqual({ kind: 'current' })
    expect(action(member, 'team', 'year')).toEqual({ kind: 'none', note: undefined })
    expect(action(member, 'business').kind).toBe('none')
    expect(action(member, 'free')).toEqual({ kind: 'none' })
  })

  it('asks for payment before any change while a subscription is on hold', () => {
    const lapsed = { planCode: 'free' as const, subscription: subscription({ status: 'unpaid' }) }
    expect(action(lapsed, 'team')).toEqual({ kind: 'fix_payment', label: 'Fix payment' })
    expect(action(lapsed, 'business')).toEqual({ kind: 'none' })
    expect(action(lapsed, 'free')).toEqual({ kind: 'cancel', label: 'Cancel subscription' })
    const paused = { planCode: 'free' as const, subscription: subscription({ status: 'paused' }) }
    expect(action(paused, 'team')).toEqual({ kind: 'fix_payment', label: 'Resume subscription' })
    expect(action(paused, 'free')).toEqual({ kind: 'none' })
  })

  it('keeps trial and grace subscribers able to change plans', () => {
    const trial = {
      planCode: 'business' as const,
      source: 'trial' as const,
      subscription: subscription({ status: 'trialing', planCode: 'business' }),
    }
    expect(action(trial, 'business')).toEqual({ kind: 'current' })
    expect(action(trial, 'team')).toEqual({ kind: 'change', label: 'Downgrade to Team' })
    const grace = {
      planCode: 'team' as const,
      source: 'payment_grace' as const,
      subscription: subscription({ status: 'past_due' }),
    }
    expect(action(grace, 'business')).toEqual({ kind: 'change', label: 'Upgrade to Business' })
  })

  it('does not offer a second cancellation or self-serve changes to invoiced plans', () => {
    const ending = {
      planCode: 'team' as const,
      source: 'subscription' as const,
      subscription: subscription({ cancelAtPeriodEnd: true }),
    }
    expect(action(ending, 'free')).toEqual({ kind: 'none' })
    const invoiced = {
      planCode: 'enterprise' as const,
      source: 'subscription' as const,
      subscription: subscription({ planCode: 'enterprise', collectionMethod: 'send_invoice' }),
    }
    expect(action(invoiced, 'team')).toEqual({ kind: 'none' })
    expect(action(invoiced, 'free')).toEqual({ kind: 'none' })
  })

  it('lets an organization on the beta grant or an arranged plan choose a plan', () => {
    expect(action({ source: 'migration_grant' }, 'team')).toEqual({
      kind: 'checkout',
      label: 'Choose Team',
    })
    expect(action({ source: 'migration_grant' }, 'free')).toEqual({ kind: 'none' })
    expect(action({ source: 'override', planCode: 'business' }, 'business')).toEqual({
      kind: 'checkout',
      label: 'Choose Business',
    })
  })
})

describe('formatting', () => {
  it('derives the annual saving from the catalog', () => {
    expect(annualMonthsFree('team')).toBe(2)
    expect(annualMonthsFree('free')).toBe(0)
    expect(annualMonthsFree('enterprise')).toBe(0)
  })

  it('formats minor units for the invoice currency', () => {
    expect(formatMoney(900, 'usd')).toContain('9.00')
    expect(formatMoney(900, 'jpy')).toContain('900')
  })
})
