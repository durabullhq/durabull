import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planStatus } from '@/components/billing/plan-status'
import { PlanStatusBanner } from '@/components/billing/plan-status-banner'
import type { EnabledEntitlement } from '@/hooks/use-entitlement'
import { setTestEntitlement, testEntitlement } from '@/test/entitlement'

const SINCE = '2026-11-01T00:00:00.000Z'

const { activeState } = vi.hoisted(() => ({ activeState: { slug: 'acme' } }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <a href="/billing" onClick={onClick}>
      {children}
    </a>
  ),
}))
vi.mock('@/hooks/use-organization', () => ({
  useActiveOrganization: () => ({ data: { slug: activeState.slug } }),
}))

const SUBSCRIPTION = {
  status: 'active',
  planCode: 'team',
  interval: 'month',
  currentPeriodEnd: '2027-01-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  cancelAt: null,
  trialEnd: null,
  collectionMethod: 'charge_automatically',
} as NonNullable<EnabledEntitlement['subscription']>

function plan(state: Partial<EnabledEntitlement> = {}, canManageBilling = true) {
  setTestEntitlement({ plan: 'team', canManageBilling, state })
  return testEntitlement.current.plan as EnabledEntitlement
}

describe('planStatus', () => {
  it('needs no attention on a healthy plan', () => {
    expect(planStatus(plan({ subscription: SUBSCRIPTION }))).toBeNull()
  })

  it('puts a failed payment ahead of everything else, for the owner', () => {
    const status = planStatus(
      plan({
        source: 'payment_grace',
        graceExpiresAt: '2026-12-01T00:00:00.000Z',
        subscription: { ...SUBSCRIPTION, status: 'past_due' },
        suspended: [{ kind: 'connection', id: 'c1', since: SINCE }],
        capacityAdjustmentExpiresAt: '2026-12-05T00:00:00.000Z',
      })
    )
    expect(status?.title).toBe('Your last payment failed')
    expect(status?.action).toBe('Fix payment')
    expect(status?.body).toContain('Team access continues until')
  })

  it('says paid features are on hold once the grace period is over', () => {
    const status = planStatus(
      plan({ source: 'free', subscription: { ...SUBSCRIPTION, status: 'unpaid' } })
    )
    expect(status?.title).toBe('Paid features are on hold')
    expect(status?.body).toContain('Nothing was deleted')
  })

  it('keeps payment problems away from members who cannot fix them', () => {
    const status = planStatus(
      plan(
        {
          source: 'payment_grace',
          graceExpiresAt: '2026-12-01T00:00:00.000Z',
          subscription: { ...SUBSCRIPTION, status: 'past_due' },
        },
        false
      )
    )
    expect(status).toBeNull()
  })

  it('tells everyone about paused resources, with the owner’s options or who to ask', () => {
    const suspended = [
      { kind: 'connection' as const, id: 'c1', since: SINCE },
      { kind: 'alert_rule' as const, id: 'r1', since: SINCE },
    ]
    const owner = planStatus(plan({ suspended }))
    expect(owner?.title).toBe('2 resources are paused by your plan')
    expect(owner?.body).toContain('choose which ones stay enabled')

    const member = planStatus(plan({ suspended: suspended.slice(0, 1) }, false))
    expect(member?.title).toBe('1 resource is paused by your plan')
    expect(member?.body).toContain('Your organization owner can restore them')
  })

  it('announces a resource paused again after an earlier pause was dismissed', () => {
    const first = planStatus(plan({ suspended: [{ kind: 'connection', id: 'c1', since: SINCE }] }))
    const later = planStatus(
      plan({
        suspended: [{ kind: 'connection', id: 'c1', since: '2026-12-01T00:00:00.000Z' }],
      })
    )
    expect(first?.id).not.toBe(later?.id)
  })

  it('announces a different set of paused resources again', () => {
    const first = planStatus(plan({ suspended: [{ kind: 'connection', id: 'c1', since: SINCE }] }))
    const second = planStatus(plan({ suspended: [{ kind: 'connection', id: 'c2', since: SINCE }] }))
    expect(first?.id).not.toBe(second?.id)
  })

  it('warns before the adjustment window ends', () => {
    const status = planStatus(plan({ capacityAdjustmentExpiresAt: '2026-12-05T00:00:00.000Z' }))
    expect(status?.title).toBe('This organization is above its plan’s limits')
    expect(status?.body).toContain('Everything keeps working until')
  })

  it('reminds the owner that a trial is ending', () => {
    const trialing = {
      notices: ['trial_ending'],
      subscription: { ...SUBSCRIPTION, status: 'trialing', trialEnd: '2026-12-03T00:00:00.000Z' },
    } as Partial<EnabledEntitlement>
    const owner = planStatus(plan(trialing))
    expect(owner?.tone).toBe('info')
    expect(owner?.action).toBe('Add payment method')
    expect(planStatus(plan(trialing, false))).toBeNull()
  })
})

describe('PlanStatusBanner', () => {
  beforeEach(() => {
    window.localStorage.clear()
    activeState.slug = 'acme'
  })

  it('shows nothing on self-hosted deployments', () => {
    render(<PlanStatusBanner orgSlug="acme" />)
    expect(screen.queryByTestId('plan-status-banner')).not.toBeInTheDocument()
  })

  it('waits until the active organization matches the route', () => {
    plan({ suspended: [{ kind: 'connection', id: 'c1', since: SINCE }] })
    activeState.slug = 'globex'
    const { rerender } = render(<PlanStatusBanner orgSlug="acme" />)
    expect(screen.queryByTestId('plan-status-banner')).not.toBeInTheDocument()
    activeState.slug = 'acme'
    rerender(<PlanStatusBanner orgSlug="acme" />)
    expect(screen.getByTestId('plan-status-banner')).toBeInTheDocument()
  })

  it('gives the owner the action and other members a way to see details', () => {
    plan({ suspended: [{ kind: 'connection', id: 'c1', since: SINCE }] })
    const { unmount } = render(<PlanStatusBanner orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'Review' })).toBeInTheDocument()
    unmount()

    plan({ suspended: [{ kind: 'connection', id: 'c1', since: SINCE }] }, false)
    render(<PlanStatusBanner orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'See details' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Review' })).not.toBeInTheDocument()
  })

  it('stays dismissed for the same occurrence and returns for a new one', async () => {
    plan({ suspended: [{ kind: 'connection', id: 'c1', since: SINCE }] })
    const { unmount } = render(<PlanStatusBanner orgSlug="acme" />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('plan-status-banner')).not.toBeInTheDocument()
    unmount()

    const again = render(<PlanStatusBanner orgSlug="acme" />)
    expect(screen.queryByTestId('plan-status-banner')).not.toBeInTheDocument()
    again.unmount()

    plan({ suspended: [{ kind: 'connection', id: 'c2', since: SINCE }] })
    render(<PlanStatusBanner orgSlug="acme" />)
    expect(screen.getByTestId('plan-status-banner')).toBeInTheDocument()
  })

  it('falls back to the beta transition banner when the plan needs nothing else', () => {
    plan({
      transition: {
        deadline: new Date(Date.now() + 20 * 86_400_000).toISOString(),
        noticeSentAt: new Date().toISOString(),
      },
    })
    render(<PlanStatusBanner orgSlug="acme" />)
    expect(screen.queryByTestId('plan-status-banner')).not.toBeInTheDocument()
    expect(screen.getByTestId('transition-banner')).toBeInTheDocument()
  })
})
