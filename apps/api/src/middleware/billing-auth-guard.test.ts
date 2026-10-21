import { describe, expect, it } from 'bun:test'
import { isDeniedWhileSuspended } from './billing-auth-guard'

describe('suspended member guard for Better Auth organization endpoints', () => {
  it('denies every action that changes the organization, using Better Auth route names', () => {
    for (const action of [
      'invite-member',
      'cancel-invitation',
      'remove-member',
      'update-member-role',
      'update',
      'delete',
      'create-role',
      'update-role',
      'delete-role',
      'create-team',
      'update-team',
      'remove-team',
      'add-team-member',
      'remove-team-member',
    ]) {
      expect(isDeniedWhileSuspended('POST', action)).toBe(true)
    }
  })

  it('denies actions Better Auth adds later unless they are explicitly allowed', () => {
    expect(isDeniedWhileSuspended('POST', 'some-future-action')).toBe(true)
  })

  it('still lets a suspended member read, leave, switch, or join other organizations', () => {
    expect(isDeniedWhileSuspended('GET', 'list-members')).toBe(false)
    expect(isDeniedWhileSuspended('POST', 'get-full-organization')).toBe(false)
    for (const action of [
      'leave',
      'set-active',
      'accept-invitation',
      'reject-invitation',
      'create',
      'check-slug',
    ]) {
      expect(isDeniedWhileSuspended('POST', action)).toBe(false)
    }
  })
})
