import { describe, expect, it } from 'bun:test'
import { PLANS, UNLIMITED_LIMITS } from './catalog'
import {
  type EntitlementInputs,
  OUTAGE_TOLERANCE_MS,
  PAYMENT_GRACE_MS,
  resolveEntitlement,
  type SubscriptionEvidence,
} from './resolve'

const now = new Date('2026-11-01T12:00:00.000Z')
const day = 24 * 60 * 60 * 1000

function inputs(overrides: Partial<EntitlementInputs> = {}): EntitlementInputs {
  return {
    now,
    billingEnabled: true,
    subscription: null,
    lastPaidPlan: null,
    migrationGrantExpiresAt: null,
    override: null,
    contractLimits: null,
    verifiedAt: now,
    ...overrides,
  }
}

function sub(overrides: Partial<SubscriptionEvidence> = {}): SubscriptionEvidence {
  return {
    status: 'active',
    planCode: 'team',
    currentPeriodEnd: new Date(now.getTime() + 20 * day),
    cancelAtPeriodEnd: false,
    trialEnd: null,
    latestInvoicePaid: true,
    pastDueSince: null,
    collectionMethod: 'charge_automatically',
    pauseCollection: false,
    ...overrides,
  }
}

describe('resolveEntitlement', () => {
  it('grants everything locally when Cloud billing is disabled', () => {
    const result = resolveEntitlement(inputs({ billingEnabled: false }))
    expect(result.planCode).toBe('self_hosted')
    expect(result.limits).toEqual(UNLIMITED_LIMITS)
    expect(result.features).toContain('mcp.write')
  })

  it('uses Free without a paid subscription', () => {
    const result = resolveEntitlement(inputs())
    expect(result.planCode).toBe('free')
    expect(result.features).toEqual([])
    expect(result.limits['connections.enabled']).toBe(1)
  })

  it('maps a confirmed paid subscription to its plan', () => {
    const result = resolveEntitlement(inputs({ subscription: sub(), lastPaidPlan: 'team' }))
    expect(result.planCode).toBe('team')
    expect(result.source).toBe('subscription')
    expect(result.limits).toEqual(PLANS.team.limits)
  })

  it('grants Business during an eligible trial through its recorded end', () => {
    const trialEnd = new Date(now.getTime() + 2 * day)
    const result = resolveEntitlement(
      inputs({
        subscription: sub({
          status: 'trialing',
          planCode: 'business',
          trialEnd,
          latestInvoicePaid: null,
        }),
      })
    )
    expect(result.planCode).toBe('business')
    expect(result.source).toBe('trial')
    expect(result.reevaluateAt).toEqual(trialEnd)
    expect(result.notices).toContain('trial_ending')
  })

  it('returns to Free when a trial ends without payment', () => {
    const trialEnd = new Date(now.getTime() - 2 * day)
    const result = resolveEntitlement(
      inputs({
        subscription: sub({ status: 'paused', planCode: 'business', trialEnd }),
      })
    )
    expect(result.planCode).toBe('free')
  })

  it('does not extend an expired trial past the outage tolerance', () => {
    const trialEnd = new Date(now.getTime() - OUTAGE_TOLERANCE_MS - 1000)
    const result = resolveEntitlement(
      inputs({
        subscription: sub({ status: 'trialing', planCode: 'business', trialEnd }),
        verifiedAt: new Date(trialEnd.getTime() - day),
      })
    )
    expect(result.planCode).toBe('free')
  })

  it('gives no paid entitlement for an incomplete first payment', () => {
    const result = resolveEntitlement(
      inputs({ subscription: sub({ status: 'incomplete', latestInvoicePaid: false }) })
    )
    expect(result.planCode).toBe('free')
    expect(result.notices).toContain('payment_pending')
  })

  it('never unlocks an unpaid upgrade', () => {
    const result = resolveEntitlement(
      inputs({
        subscription: sub({ planCode: 'business', latestInvoicePaid: false }),
        lastPaidPlan: 'team',
      })
    )
    expect(result.planCode).toBe('team')
    expect(result.subscribedPlanCode).toBe('business')
    expect(result.source).toBe('pending_upgrade')
  })

  it('keeps the last paid plan for seven days after a failed renewal', () => {
    const pastDueSince = new Date(now.getTime() - 3 * day)
    const result = resolveEntitlement(
      inputs({
        subscription: sub({ status: 'past_due', planCode: 'business', pastDueSince }),
        lastPaidPlan: 'business',
      })
    )
    expect(result.planCode).toBe('business')
    expect(result.source).toBe('payment_grace')
    expect(result.graceExpiresAt).toEqual(new Date(pastDueSince.getTime() + PAYMENT_GRACE_MS))
  })

  it('falls back to Free when grace expires', () => {
    const pastDueSince = new Date(now.getTime() - 8 * day)
    const result = resolveEntitlement(
      inputs({
        subscription: sub({ status: 'past_due', pastDueSince }),
        lastPaidPlan: 'team',
      })
    )
    expect(result.planCode).toBe('free')
    expect(result.notices).toContain('payment_failed')
  })

  it('does not grant grace to an organization that never paid', () => {
    const result = resolveEntitlement(
      inputs({ subscription: sub({ status: 'past_due', pastDueSince: now }), lastPaidPlan: null })
    )
    expect(result.planCode).toBe('free')
  })

  it('keeps a scheduled cancellation paid until the effective end, then Free', () => {
    const active = resolveEntitlement(
      inputs({ subscription: sub({ cancelAtPeriodEnd: true }), lastPaidPlan: 'team' })
    )
    expect(active.planCode).toBe('team')
    expect(active.notices).toContain('cancellation_scheduled')

    const ended = resolveEntitlement(
      inputs({
        subscription: sub({
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date(now.getTime() - 1000),
        }),
        lastPaidPlan: 'team',
        verifiedAt: new Date(now.getTime() - 2 * day),
      })
    )
    expect(ended.planCode).toBe('free')
  })

  it('treats a flexible-billing cancel_at as a scheduled cancellation', () => {
    const cancelAt = new Date(now.getTime() + 5 * day)
    const scheduled = resolveEntitlement(
      inputs({ subscription: sub({ cancelAt }), lastPaidPlan: 'team' })
    )
    expect(scheduled.planCode).toBe('team')
    expect(scheduled.notices).toContain('cancellation_scheduled')
    expect(scheduled.reevaluateAt).toEqual(cancelAt)

    const effective = resolveEntitlement(
      inputs({
        subscription: sub({ cancelAt: new Date(now.getTime() - 1000) }),
        lastPaidPlan: 'team',
      })
    )
    expect(effective.planCode).toBe('free')
  })

  it('preserves a verified plan briefly after a missed renewal, then degrades', () => {
    const recentEnd = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const tolerant = resolveEntitlement(
      inputs({
        subscription: sub({ currentPeriodEnd: recentEnd }),
        lastPaidPlan: 'team',
        verifiedAt: new Date(recentEnd.getTime() - day),
      })
    )
    expect(tolerant.planCode).toBe('team')
    expect(tolerant.degraded).toBe(false)

    const staleEnd = new Date(now.getTime() - OUTAGE_TOLERANCE_MS - 1000)
    const degraded = resolveEntitlement(
      inputs({
        subscription: sub({ currentPeriodEnd: staleEnd }),
        lastPaidPlan: 'team',
        verifiedAt: new Date(staleEnd.getTime() - day),
      })
    )
    expect(degraded.degraded).toBe(true)
    expect(degraded.source).toBe('degraded')
    expect(degraded.notices).toContain('unverified_state')
  })

  it('makes no new premium grant for an unknown Price', () => {
    const fresh = resolveEntitlement(inputs({ subscription: sub({ planCode: null }) }))
    expect(fresh.planCode).toBe('free')
    expect(fresh.notices).toContain('unknown_price')

    const retained = resolveEntitlement(
      inputs({ subscription: sub({ planCode: null }), lastPaidPlan: 'business' })
    )
    expect(retained.planCode).toBe('business')
    expect(retained.degraded).toBe(true)
  })

  it('honors invoiced Enterprise terms and contract limits', () => {
    const result = resolveEntitlement(
      inputs({
        subscription: sub({
          planCode: 'enterprise',
          collectionMethod: 'send_invoice',
          latestInvoicePaid: false,
        }),
        lastPaidPlan: null,
        contractLimits: { 'connections.enabled': 60 },
      })
    )
    expect(result.planCode).toBe('enterprise')
    expect(result.limits['connections.enabled']).toBe(60)
    expect(result.limits['members.reserved']).toBe(PLANS.enterprise.limits['members.reserved'])
  })

  it('applies an unexpired operator override and ignores an expired one', () => {
    const active = resolveEntitlement(
      inputs({
        override: { planCode: 'business', expiresAt: new Date(now.getTime() + day) },
      })
    )
    expect(active.planCode).toBe('business')
    expect(active.source).toBe('override')

    const expired = resolveEntitlement(
      inputs({ override: { planCode: 'business', expiresAt: new Date(now.getTime() - 1) } })
    )
    expect(expired.planCode).toBe('free')
  })

  it('keeps existing usage unrestricted during the beta migration grant', () => {
    const grantEnd = new Date(now.getTime() + 10 * day)
    const result = resolveEntitlement(inputs({ migrationGrantExpiresAt: grantEnd }))
    expect(result.source).toBe('migration_grant')
    expect(result.limits['connections.enabled']).toBeNull()
    expect(result.reevaluateAt).toEqual(grantEnd)

    const after = resolveEntitlement(
      inputs({ migrationGrantExpiresAt: new Date(now.getTime() - 1) })
    )
    expect(after.planCode).toBe('free')
  })
})
