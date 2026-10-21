import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UpgradePromptHost } from '@/components/billing/upgrade-prompt-host'
import { BILLING_DENIED_EVENT } from '@/lib/api'

const { billingState, reportMock } = vi.hoisted(() => ({
  billingState: { canManageBilling: true },
  reportMock: vi.fn(),
}))

vi.mock('@/hooks/use-billing', () => ({
  useBilling: () => ({ data: { enabled: true, canManageBilling: billingState.canManageBilling } }),
  reportUpgradePromptShown: reportMock,
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
})
