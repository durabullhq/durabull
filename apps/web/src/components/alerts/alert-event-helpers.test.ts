import { describe, expect, it } from 'vitest'
import { formatActorSuffix } from '@/components/alerts/alert-event-helpers'

describe('formatActorSuffix', () => {
  it('credits whoever acknowledged the incident', () => {
    expect(formatActorSuffix('Sam Operator')).toBe(' by Sam Operator')
  })

  it('credits real users whose name happens to match the local account', () => {
    // The API drops the name in installs without accounts; the UI must not
    // second-guess names it does send.
    expect(formatActorSuffix('Local user')).toBe(' by Local user')
    expect(formatActorSuffix('Authless User')).toBe(' by Authless User')
  })

  it('says nothing when no name is known', () => {
    expect(formatActorSuffix(null)).toBe('')
    expect(formatActorSuffix(undefined)).toBe('')
    expect(formatActorSuffix('   ')).toBe('')
  })
})
