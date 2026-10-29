import { describe, expect, it } from 'bun:test'
import {
  CAPACITY_ADJUSTMENT_WINDOW_MS,
  clampHistoryRange,
  effectiveRetentionDays,
  evaluateCapacityTransition,
  selectResourcesWithinLimit,
} from './capacity'
import {
  isBillingErrorBody,
  PLANS,
  requiredPlanForFeature,
  requiredPlanForLimit,
  smallestPlanForUsage,
} from './index'

const now = new Date('2026-11-01T00:00:00.000Z')
const day = 24 * 60 * 60 * 1000

describe('evaluateCapacityTransition', () => {
  const base = {
    now,
    nextLimits: PLANS.free.limits,
    activeWindowExpiresAt: null,
    lastWindowEndedAt: null,
    skipWindow: false,
  }

  it('does nothing when usage fits', () => {
    const result = evaluateCapacityTransition({ ...base, usage: { 'connections.enabled': 1 } })
    expect(result).toEqual({
      overLimit: [],
      windowExpiresAt: null,
      suspendNow: false,
      suspendImmediately: [],
    })
  })

  it('opens one seven-day window for existing excess', () => {
    const result = evaluateCapacityTransition({ ...base, usage: { 'connections.enabled': 4 } })
    expect(result.suspendNow).toBe(false)
    expect(result.windowExpiresAt?.getTime()).toBe(now.getTime() + CAPACITY_ADJUSTMENT_WINDOW_MS)
    expect(result.overLimit).toEqual([{ limit: 'connections.enabled', usage: 4, allowed: 1 }])
  })

  it('never extends an in-progress window', () => {
    const activeWindowExpiresAt = new Date(now.getTime() + day)
    const result = evaluateCapacityTransition({
      ...base,
      usage: { 'connections.enabled': 4 },
      activeWindowExpiresAt,
    })
    expect(result.windowExpiresAt).toEqual(activeWindowExpiresAt)
  })

  it('suspends when the window has expired', () => {
    const result = evaluateCapacityTransition({
      ...base,
      usage: { 'connections.enabled': 4 },
      activeWindowExpiresAt: new Date(now.getTime() - 1),
    })
    expect(result.suspendNow).toBe(true)
  })

  it('refuses a fresh window shortly after the previous one (repeated cycles)', () => {
    const result = evaluateCapacityTransition({
      ...base,
      usage: { 'members.reserved': 3 },
      lastWindowEndedAt: new Date(now.getTime() - 5 * day),
    })
    expect(result.suspendNow).toBe(true)
  })

  it('suspends immediately after payment grace', () => {
    const result = evaluateCapacityTransition({
      ...base,
      usage: { 'alerts.enabled': 9 },
      skipWindow: true,
    })
    expect(result.suspendNow).toBe(true)
  })

  it('windows only connections and memberships; other excess is suspended at once', () => {
    const result = evaluateCapacityTransition({
      ...base,
      usage: { 'connections.enabled': 3, 'service_accounts.enabled': 2 },
    })
    expect(result.suspendNow).toBe(false)
    expect(result.windowExpiresAt).not.toBeNull()
    expect(result.suspendImmediately).toEqual(['service_accounts.enabled'])

    const onlyRules = evaluateCapacityTransition({ ...base, usage: { 'alerts.enabled': 9 } })
    expect(onlyRules.windowExpiresAt).toBeNull()
    expect(onlyRules.suspendImmediately).toEqual(['alerts.enabled'])
  })
})

describe('selectResourcesWithinLimit', () => {
  const candidates = [
    { id: 'c', createdAt: new Date(3) },
    { id: 'a', createdAt: new Date(1) },
    { id: 'owner', createdAt: new Date(9), pinned: true },
    { id: 'b', createdAt: new Date(1) },
  ]

  it('keeps pinned resources then the oldest, with stable tie breaks', () => {
    expect(selectResourcesWithinLimit(candidates, 2)).toEqual({
      keep: ['owner', 'a'],
      suspend: ['b', 'c'],
    })
  })

  it('honors the owner preference before age', () => {
    const preferred = candidates.map((c) => (c.id === 'c' ? { ...c, preferred: true } : c))
    expect(selectResourcesWithinLimit(preferred, 2).keep).toEqual(['owner', 'c'])
  })

  it('never suspends pinned resources even at a zero limit', () => {
    expect(selectResourcesWithinLimit(candidates, 0).keep).toEqual(['owner'])
  })
})

describe('history windows', () => {
  it('clamps a longer requested range to the visible window', () => {
    const result = clampHistoryRange({ from: new Date(now.getTime() - 30 * day), to: now }, 14, now)
    expect(result.clamped).toBe(true)
    expect(result.from.getTime()).toBe(now.getTime() - 14 * day)
  })

  it('retains pre-downgrade history during the recovery period only', () => {
    const during = effectiveRetentionDays({
      now,
      visibleDays: 1,
      floorDays: 30,
      floorExpiresAt: new Date(now.getTime() + day),
      deploymentMaxDays: 30,
    })
    expect(during).toBe(30)
    const after = effectiveRetentionDays({
      now,
      visibleDays: 1,
      floorDays: 30,
      floorExpiresAt: new Date(now.getTime() - 1),
      deploymentMaxDays: 30,
    })
    expect(after).toBe(1)
  })
})

describe('catalog helpers', () => {
  it('maps capabilities and capacity to the lowest qualifying plan', () => {
    expect(requiredPlanForFeature('alerts.linear')).toBe('team')
    expect(requiredPlanForLimit('connections.enabled', 6)).toBe('business')
    expect(requiredPlanForLimit('connections.enabled', 16)).toBe('enterprise')
    expect(smallestPlanForUsage({ 'connections.enabled': 2, 'members.reserved': 12 })).toBe(
      'business'
    )
  })

  it('recognizes structured billing errors', () => {
    expect(
      isBillingErrorBody({
        code: 'plan_limit_reached',
        limit: 'connections.enabled',
        usage: 5,
        allowed: 5,
        requiredPlan: 'business',
      })
    ).toBe(true)
    expect(isBillingErrorBody({ code: 'nope' })).toBe(false)
  })

  it('publishes the approved list prices', () => {
    expect([PLANS.team.monthlyPriceUsd, PLANS.team.annualPriceUsd]).toEqual([9, 90])
    expect([PLANS.business.monthlyPriceUsd, PLANS.business.annualPriceUsd]).toEqual([29, 290])
  })
})
