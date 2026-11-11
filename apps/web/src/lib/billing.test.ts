import type { BillingErrorBody } from '@durabull/api-client/billing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ApiError, BILLING_DENIED_EVENT, isPlanDenial, isSettledError } from '@/lib/api'
import { limitDenial, requestUpgrade } from '@/lib/billing'

describe('client-side plan denials', () => {
  let announced: BillingErrorBody[]
  const listener = (event: Event) => {
    announced.push((event as CustomEvent<BillingErrorBody>).detail)
  }

  beforeEach(() => {
    announced = []
    window.addEventListener(BILLING_DENIED_EVENT, listener)
  })
  afterEach(() => {
    window.removeEventListener(BILLING_DENIED_EVENT, listener)
  })

  it('opens the upgrade prompt for a feature with the plan that includes it', () => {
    requestUpgrade('jobs.bulk_recovery')
    expect(announced).toHaveLength(1)
    expect(announced[0]).toMatchObject({
      code: 'feature_not_entitled',
      feature: 'jobs.bulk_recovery',
      requiredPlan: 'team',
    })
  })

  it('announces a reached limit and returns the error to throw', () => {
    const error = limitDenial('connections.enabled', { used: 1, limit: 1 })
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(409)
    expect(error.message).toBe('Your plan includes 1 connection and all are in use.')
    expect(isPlanDenial(error)).toBe(true)
    expect(isSettledError(error)).toBe(true)
    expect(announced[0]).toMatchObject({
      code: 'plan_limit_reached',
      limit: 'connections.enabled',
      usage: 1,
      allowed: 1,
      requiredPlan: 'team',
    })
  })

  it('names the plan that fits everything a multi-step action would add', () => {
    const error = limitDenial('alerts.enabled', { used: 14, limit: 15 }, 3)
    expect(error.message).toBe(
      'This adds 3 alert rules, but your plan includes 15 alert rules and 14 are in use.'
    )
    expect(announced[0]).toMatchObject({ requiredPlan: 'business' })
  })

  it('does not treat ordinary failures as plan denials', () => {
    const error = new ApiError('Server error', 500, { error: 'Server error' })
    expect(isPlanDenial(error)).toBe(false)
    expect(isSettledError(error)).toBe(false)
    expect(isSettledError(new ApiError('Paused', 403, { code: 'member_suspended' }))).toBe(true)
  })
})
