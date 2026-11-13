import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UpgradePromptHost } from '@/components/billing/upgrade-prompt-host'
import { BILLING_DENIED_EVENT } from '@/lib/api'

const { billingState, reportMock } = vi.hoisted(() => ({
  billingState: { canManageBilling: true },
  reportMock: vi.fn(),
}))

vi.mock('@/hooks/use-billing', () => ({ reportUpgradePromptShown: reportMock }))
vi.mock('@/hooks/use-entitlement', () => ({
  useEntitlement: () => ({ canManageBilling: billingState.canManageBilling }),
}))

function deny(detail: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(new CustomEvent(BILLING_DENIED_EVENT, { detail }))
  })
}

describe('UpgradePromptHost', () => {
  it('explains a feature denial and links owners to plans in a new tab', () => {
    billingState.canManageBilling = true
    render(<UpgradePromptHost orgSlug="acme" />)
    deny({
      code: 'feature_not_entitled',
      feature: 'alerts.linear',
      requiredPlan: 'team',
      message: 'Linear alerts requires the Team plan or higher.',
      billingUrl: '/settings/billing',
    })
    expect(screen.getByText('Linear alerts needs Team')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'View plans' })
    expect(link).toHaveAttribute('href', '/acme/settings/billing')
    expect(link).toHaveAttribute('target', '_blank')
    expect(reportMock).toHaveBeenCalledWith({ feature: 'alerts.linear', limit: undefined })
  })

  it('asks non-owners to contact the owner at a capacity limit', () => {
    billingState.canManageBilling = false
    render(<UpgradePromptHost orgSlug="acme" />)
    deny({
      code: 'plan_limit_reached',
      limit: 'connections.enabled',
      usage: 5,
      allowed: 5,
      requiredPlan: 'business',
      message: 'Your plan includes 5 connections.',
      billingUrl: '/settings/billing',
    })
    expect(screen.getByText(/Ask your organization owner to upgrade/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View plans' })).not.toBeInTheDocument()
  })

  it('sends owners above the largest self-serve plan to sales instead of the plans page', () => {
    billingState.canManageBilling = true
    render(<UpgradePromptHost orgSlug="acme" />)
    deny({
      code: 'plan_limit_reached',
      limit: 'connections.enabled',
      usage: 15,
      allowed: 15,
      requiredPlan: 'enterprise',
      message: 'Your plan includes 15 connections and all are in use.',
      billingUrl: '/settings/billing',
    })
    expect(screen.getByRole('link', { name: 'Contact us' })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:')
    )
    expect(screen.queryByRole('link', { name: 'View plans' })).not.toBeInTheDocument()
  })

  it('points an unverified billing state at the billing page rather than an upgrade', () => {
    billingState.canManageBilling = true
    render(<UpgradePromptHost orgSlug="acme" />)
    deny({
      code: 'billing_state_unverified',
      message: 'We could not verify this organization’s subscription.',
      billingUrl: '/settings/billing',
    })
    expect(screen.getByText('Billing status is being verified')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Billing' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View plans' })).not.toBeInTheDocument()
  })
})
