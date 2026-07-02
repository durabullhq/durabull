import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  AlertStatusBadge,
  formatAlertTimeRemaining,
  formatRelativeAlertTime,
  getAlertEventDisplayStatus,
  RuleStateBadge,
} from '@/components/alerts/alert-primitives'

describe('getAlertEventDisplayStatus', () => {
  it('derives acknowledged from firing events with ack provenance', () => {
    expect(
      getAlertEventDisplayStatus({ status: 'firing', acknowledgedAt: '2026-03-24T10:00:00.000Z' })
    ).toBe('acknowledged')
  })

  it('passes through stored statuses otherwise', () => {
    expect(getAlertEventDisplayStatus({ status: 'firing', acknowledgedAt: null })).toBe('firing')
    expect(
      getAlertEventDisplayStatus({ status: 'resolved', acknowledgedAt: '2026-03-24T10:00:00.000Z' })
    ).toBe('resolved')
    expect(getAlertEventDisplayStatus({ status: 'suppressed', acknowledgedAt: null })).toBe(
      'suppressed'
    )
  })
})

describe('AlertStatusBadge', () => {
  it('labels acknowledged firing events with a warning badge', () => {
    render(<AlertStatusBadge status="firing" acknowledged />)

    const badge = screen.getByText('Acknowledged')
    expect(badge.className).toContain('status-warning')
  })

  it('keeps unacknowledged firing events destructive', () => {
    render(<AlertStatusBadge status="firing" />)

    const badge = screen.getByText('firing')
    expect(badge.className).toContain('destructive')
  })

  it('renders suppressed events subdued instead of as warnings', () => {
    render(<AlertStatusBadge status="suppressed" />)

    const badge = screen.getByText('suppressed')
    expect(badge.className).toContain('text-muted-foreground')
    expect(badge.className).not.toContain('status-warning')
  })
})

describe('RuleStateBadge', () => {
  it('renders active rules as enabled', () => {
    render(<RuleStateBadge state="active" />)

    const badge = screen.getByText('Enabled')
    expect(badge.className).toContain('status-success')
  })

  it('renders snoozed rules with the remaining time', () => {
    render(
      <RuleStateBadge state="snoozed" mutedUntil={new Date(Date.now() + 2 * 60 * 60 * 1000)} />
    )

    expect(screen.getByText(/Snoozed · 2h left/)).toBeInTheDocument()
  })

  it('renders disabled rules as muted', () => {
    render(<RuleStateBadge state="disabled" />)

    expect(screen.getByText('Muted')).toBeInTheDocument()
  })
})

describe('relative time helpers', () => {
  it('formats elapsed time compactly', () => {
    expect(formatRelativeAlertTime(new Date(Date.now() - 30_000))).toBe('just now')
    expect(formatRelativeAlertTime(new Date(Date.now() - 5 * 60_000))).toBe('5m ago')
    expect(formatRelativeAlertTime(new Date(Date.now() - 3 * 60 * 60_000))).toBe('3h ago')
    expect(formatRelativeAlertTime(null)).toBe('—')
  })

  it('formats remaining time and hides elapsed deadlines', () => {
    expect(formatAlertTimeRemaining(new Date(Date.now() + 30 * 60_000))).toBe('30m')
    expect(formatAlertTimeRemaining(new Date(Date.now() - 60_000))).toBeNull()
    expect(formatAlertTimeRemaining(null)).toBeNull()
  })
})
