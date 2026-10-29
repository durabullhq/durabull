import { describe, expect, it } from 'bun:test'
import { dueTransitionReminder, formatTransitionDeadline } from './transition'

const day = 86_400_000

describe('dueTransitionReminder', () => {
  const noticeSentAt = new Date('2026-10-20T00:00:00Z')

  it('picks the 7-day and 1-day reminders by time left', () => {
    const now = new Date('2026-11-01T00:00:00Z')
    expect(dueTransitionReminder(new Date(now.getTime() + 20 * day), noticeSentAt, now)).toBeNull()
    expect(dueTransitionReminder(new Date(now.getTime() + 6 * day), noticeSentAt, now)).toBe(
      'reminder_7d'
    )
    expect(dueTransitionReminder(new Date(now.getTime() + 12 * 3_600_000), noticeSentAt, now)).toBe(
      'reminder_1d'
    )
    expect(dueTransitionReminder(new Date(now.getTime() - 1), noticeSentAt, now)).toBeNull()
  })

  it('never sends a reminder within two days of the notice', () => {
    const lateNotice = new Date('2030-01-09T00:00:00Z')
    const deadline = new Date('2030-01-14T17:00:00Z')
    expect(dueTransitionReminder(deadline, lateNotice, new Date('2030-01-09T02:00:00Z'))).toBeNull()
    expect(dueTransitionReminder(deadline, lateNotice, new Date('2030-01-11T02:00:00Z'))).toBe(
      'reminder_7d'
    )
  })
})

describe('formatTransitionDeadline', () => {
  it('shows the date and time in UTC regardless of the server time zone', () => {
    expect(formatTransitionDeadline(new Date('2030-01-14T17:00:00Z'))).toBe(
      'Monday, January 14, 2030 at 17:00 UTC'
    )
  })
})
