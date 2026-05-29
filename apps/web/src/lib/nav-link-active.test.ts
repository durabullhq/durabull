import { describe, expect, it } from 'vitest'
import { isNavLinkActive } from './nav-link-active'

describe('isNavLinkActive', () => {
  it('returns true for exact path matches', () => {
    expect(isNavLinkActive('/acme/settings', '/acme/settings')).toBe(true)
  })

  it('treats nested routes as active for section match mode', () => {
    expect(isNavLinkActive('/acme/settings/connections', '/acme/settings', 'section')).toBe(true)
  })

  it('does not match direct child routes in default mode', () => {
    expect(isNavLinkActive('/acme/settings/connections', '/acme/settings')).toBe(false)
  })

  it('matches deeper descendants in default mode', () => {
    expect(
      isNavLinkActive(
        '/acme/settings/connections/connection_123/insights',
        '/acme/settings/connections',
      ),
    ).toBe(true)
  })
})
