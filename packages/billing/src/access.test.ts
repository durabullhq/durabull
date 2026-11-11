import { describe, expect, it } from 'bun:test'
import {
  createEntitlementAccess,
  type EntitlementSnapshot,
  UNRESTRICTED_ENTITLEMENT,
} from './access'
import { PLANS } from './catalog'

function snapshot(overrides: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot {
  return {
    billingEnabled: true,
    enforced: true,
    planCode: 'free',
    features: PLANS.free.features,
    limits: PLANS.free.limits,
    usage: {},
    ...overrides,
  }
}

describe('createEntitlementAccess', () => {
  it('allows everything without Cloud billing', () => {
    const access = createEntitlementAccess(UNRESTRICTED_ENTITLEMENT)
    expect(access.restricted).toBe(false)
    expect(access.can('mcp.write')).toBe(true)
    expect(access.canAdd('connections.enabled', 500)).toBe(true)
    expect(access.capacity('members.reserved')).toMatchObject({ limit: null, atLimit: false })
  })

  it('does not restrict an organization that is only observed', () => {
    const access = createEntitlementAccess(
      snapshot({ enforced: false, usage: { 'connections.enabled': 4 } })
    )
    expect(access.can('alerts.webhook')).toBe(true)
    expect(access.canAdd('connections.enabled')).toBe(true)
    expect(access.limit('history.redis_health_days')).toBeNull()
  })

  it('names the plan a missing feature needs', () => {
    const access = createEntitlementAccess(snapshot())
    expect(access.can('jobs.bulk_recovery')).toBe(false)
    expect(access.feature('jobs.bulk_recovery')).toEqual({ allowed: false, requiredPlan: 'team' })
    const team = createEntitlementAccess(
      snapshot({ planCode: 'team', features: PLANS.team.features, limits: PLANS.team.limits })
    )
    expect(team.feature('jobs.bulk_recovery')).toEqual({ allowed: true, requiredPlan: null })
  })

  it('reports remaining capacity and the plan with room for one more', () => {
    const access = createEntitlementAccess(snapshot({ usage: { 'alerts.enabled': 2 } }))
    expect(access.capacity('alerts.enabled')).toEqual({
      limit: 3,
      used: 2,
      remaining: 1,
      atLimit: false,
      overLimit: false,
      requiredPlan: null,
    })
    expect(access.canAdd('alerts.enabled')).toBe(true)
    expect(access.canAdd('alerts.enabled', 2)).toBe(false)
  })

  it('marks a limit that is reached or exceeded', () => {
    const access = createEntitlementAccess(
      snapshot({ usage: { 'connections.enabled': 1, 'members.reserved': 12 } })
    )
    expect(access.capacity('connections.enabled')).toMatchObject({
      atLimit: true,
      overLimit: false,
      remaining: 0,
      requiredPlan: 'team',
    })
    expect(access.capacity('members.reserved')).toMatchObject({
      atLimit: true,
      overLimit: true,
      remaining: 0,
      requiredPlan: 'business',
    })
    // Free includes no service accounts at all.
    expect(access.capacity('service_accounts.enabled')).toMatchObject({
      limit: 0,
      atLimit: true,
      requiredPlan: 'team',
    })
  })
})
