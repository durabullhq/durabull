import { PLANS } from '@durabull/api-client/billing'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingSettingsPage } from '@/components/settings/billing-settings-page'
import type { BillingOverview, EnabledBillingOverview } from '@/hooks/use-billing'

const { useBillingMock, startCheckoutMock, openPortalMock, confirmMock, refreshMock } = vi.hoisted(
  () => ({
    refreshMock: vi.fn(),
    useBillingMock: vi.fn(),
    startCheckoutMock: vi.fn(),
    openPortalMock: vi.fn(),
    confirmMock: vi.fn(),
  })
)

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@/hooks/use-billing', () => ({
  useBilling: useBillingMock,
  useStartCheckout: () => ({ mutate: startCheckoutMock, isPending: false }),
  useOpenBillingPortal: () => ({ mutate: openPortalMock, isPending: false }),
  useConfirmCheckout: () => ({ mutate: confirmMock, mutateAsync: confirmMock, isPending: false }),
  useRefreshBilling: () => ({ mutate: refreshMock, mutateAsync: refreshMock, isPending: false }),
  useSaveCapacityAllocation: () => ({ mutate: vi.fn(), isPending: false }),
}))

function overview(overrides: Partial<EnabledBillingOverview> = {}): BillingOverview {
  return {
    enabled: true,
    enforcement: 'on',
    enforced: true,
    planCode: 'free',
    planName: 'Free',
    subscribedPlanCode: null,
    source: 'free',
    degraded: false,
    notices: [],
    features: [],
    limits: PLANS.free.limits,
    usage: {
      'connections.enabled': 1,
      'members.reserved': 1,
      'alerts.enabled': 2,
      'alerts.destinations': 0,
      'service_accounts.enabled': 0,
    },
    overLimit: [],
    allocation: null,
    subscription: null,
    graceExpiresAt: null,
    capacityAdjustmentExpiresAt: null,
    migrationGrantExpiresAt: null,
    historyRetentionFloorExpiresAt: null,
    proposedPlanCode: 'free',
    freePlanExceeded: [],
    pendingCheckout: null,
    suspended: [],
    hasBillingAccount: false,
    canManageBilling: true,
    purchasesEnabled: true,
    trialEligible: true,
    trialDays: 14,
    catalog: [],
    ...overrides,
  } as BillingOverview
}

describe('BillingSettingsPage', () => {
  beforeEach(() => {
    useBillingMock.mockReset()
    startCheckoutMock.mockReset()
    openPortalMock.mockReset()
  })

  it('explains that self-hosted deployments need no subscription', () => {
    useBillingMock.mockReturnValue({
      data: { enabled: false, planCode: 'self_hosted', catalog: [] },
      isLoading: false,
    })
    render(<BillingSettingsPage />)
    expect(screen.getByText('Self-hosted deployment')).toBeInTheDocument()
  })

  it('lets the owner start hosted Checkout or a Business trial', async () => {
    useBillingMock.mockReturnValue({ data: overview(), isLoading: false })
    render(<BillingSettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade to Team' }))
    expect(startCheckoutMock).toHaveBeenCalledWith(
      { plan: 'team', interval: 'month', trial: false },
      expect.any(Object)
    )
    await userEvent.click(screen.getByRole('button', { name: 'Start 14-day free trial' }))
    expect(startCheckoutMock).toHaveBeenLastCalledWith(
      { plan: 'business', interval: 'month', trial: true },
      expect.any(Object)
    )
  })

  it('shows annual pricing with the billed total', async () => {
    useBillingMock.mockReturnValue({ data: overview(), isLoading: false })
    render(<BillingSettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: /annual/i }))
    expect(screen.getByText('Billed $90 annually')).toBeInTheDocument()
    expect(screen.getByText('Billed $290 annually')).toBeInTheDocument()
  })

  it('sends existing subscribers to the hosted portal instead of a second Checkout', async () => {
    useBillingMock.mockReturnValue({
      data: overview({
        planCode: 'team',
        planName: 'Team',
        source: 'subscription',
        hasBillingAccount: true,
        trialEligible: false,
        subscription: {
          status: 'active',
          planCode: 'team',
          interval: 'month',
          currentPeriodEnd: '2026-12-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
          cancelAt: null,
          trialEnd: null,
          collectionMethod: 'charge_automatically',
        },
      }),
      isLoading: false,
    })
    render(<BillingSettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Switch to Business' }))
    expect(openPortalMock).toHaveBeenCalled()
    expect(startCheckoutMock).not.toHaveBeenCalled()
  })

  it('tells non-owners to ask the owner instead of offering Checkout', () => {
    useBillingMock.mockReturnValue({
      data: overview({ canManageBilling: false }),
      isLoading: false,
    })
    render(<BillingSettingsPage />)
    expect(screen.queryByRole('button', { name: 'Upgrade to Team' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Ask your organization owner to upgrade.').length).toBeGreaterThan(0)
  })

  it('discloses payment grace and the confirmation-in-progress state', () => {
    useBillingMock.mockReturnValue({
      data: overview({
        planCode: 'team',
        planName: 'Team',
        source: 'payment_grace',
        notices: ['payment_failed'],
        graceExpiresAt: '2026-11-08T00:00:00.000Z',
        pendingCheckout: {
          planCode: 'business',
          interval: 'month',
          trial: false,
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      }),
      isLoading: false,
    })
    render(<BillingSettingsPage />)
    expect(screen.getByText('Payment failed')).toBeInTheDocument()
    expect(screen.getByText('Confirming your purchase')).toBeInTheDocument()
  })

  it('confirms a Checkout return on the server and then clears the confirming state', async () => {
    window.history.replaceState(
      null,
      '',
      '/acme/settings/billing?checkout=success&session_id=cs_test_1'
    )
    confirmMock.mockResolvedValue({ status: 'complete' })
    useBillingMock.mockReturnValue({
      data: overview({ planCode: 'team', planName: 'Team', source: 'subscription' }),
      isLoading: false,
    })
    render(<BillingSettingsPage />)
    expect(confirmMock).toHaveBeenCalledWith('cs_test_1')
    await waitFor(() =>
      expect(screen.queryByText('Confirming your purchase')).not.toBeInTheDocument()
    )
    expect(window.location.search).toBe('')
  })

  it('reconciles plan changes when the owner returns from the hosted Portal', () => {
    window.history.replaceState(null, '', '/acme/settings/billing?portal=returned')
    refreshMock.mockResolvedValue({ planCode: 'business' })
    useBillingMock.mockReturnValue({
      data: overview({ hasBillingAccount: true }),
      isLoading: false,
    })
    render(<BillingSettingsPage />)
    expect(refreshMock).toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })
})
