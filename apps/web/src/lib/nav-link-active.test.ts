import { describe, expect, it } from 'vitest'
import { isNavLinkActive } from './nav-link-active'

const base = '/acme/c/conn_1'

describe('isNavLinkActive', () => {
  it('returns true for exact path matches', () => {
    expect(isNavLinkActive('/acme/settings', '/acme/settings')).toBe(true)
  })

  it('treats nested routes as active', () => {
    expect(isNavLinkActive('/acme/settings/connections', '/acme/settings')).toBe(true)
    expect(isNavLinkActive(`${base}/alerts/rules`, `${base}/alerts`)).toBe(true)
    expect(isNavLinkActive(`${base}/alerts/rules/rule_1`, `${base}/alerts`)).toBe(true)
  })

  it('does not match sibling sections', () => {
    expect(isNavLinkActive(`${base}/alerts`, `${base}/analytics`)).toBe(false)
  })

  describe('with a matchPath override (Queues link)', () => {
    it('matches the exact `to` path', () => {
      expect(isNavLinkActive(base, base, `${base}/queues`)).toBe(true)
    })

    it('matches within the matchPath section', () => {
      expect(isNavLinkActive(`${base}/queues/emails`, base, `${base}/queues`)).toBe(true)
    })

    it('does not match other sections under `to`', () => {
      expect(isNavLinkActive(`${base}/alerts`, base, `${base}/queues`)).toBe(false)
      expect(isNavLinkActive(`${base}/alerts/rules`, base, `${base}/queues`)).toBe(false)
      expect(isNavLinkActive(`${base}/alerts/rules/rule_1`, base, `${base}/queues`)).toBe(false)
    })
  })
})
