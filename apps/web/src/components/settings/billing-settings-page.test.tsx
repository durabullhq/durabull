import { PLANS } from '@durabull/api-client/billing'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingSettingsPage } from '@/components/settings/billing-settings-page'
import type { BillingOverview, EnabledBillingOverview } from '@/hooks/use-billing'

const {
  useBillingMock,
  startCheckoutMock,
  openPortalMock,
  confirmMock,
  refreshMock,
  cancelMock,
  invoicesMock,
  routeState,
} = vi.hoisted(() => ({
  cancelMock: vi.fn(),
  refreshMock: vi.fn(),
  useBillingMock: vi.fn(),
  startCheckoutMock: vi.fn(),
  openPortalMock: vi.fn(),
  confirmMock: vi.fn(),
  invoicesMock: vi.fn(),
  routeState: { orgSlug: 'acme', activeSlug: 'acme' },
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ orgSlug: routeState.orgSlug }),
}))

vi.mock('@/hooks/use-organization', () => ({
  useActiveOrganization: () => ({ data: { id: 'org_1', slug: routeState.activeSlug } }),
}))

vi.mock('@/hooks/use-billing', () => ({
  useBilling: useBillingMock,
  useBillingInvoices: invoicesMock,
  useStartCheckout: () => ({ mutate: startCheckoutMock, isPending: false }),
  useOpenBillingPortal: () => ({ mutate: openPortalMock, isPending: false }),
  useConfirmCheckout: () => ({ mutate: confirmMock, mutateAsync: confirmMock, isPending: false }),
  useCancelCheckout: () => ({ mutate: cancelMock, mutateAsync: cancelMock, isPending: false }),
  useRefreshBilling: () => ({ mutate: refreshMock, mutateAsync: refreshMock, isPending: false }),
  useSaveCapacityAllocation: () => ({ mutate: vi.fn(), isPending: false }),
}))

type Subscription = NonNullable<EnabledBillingOverview['subscription']>

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    status: 'active',
    planCode: 'team',
    interval: 'month',
    currentPeriodEnd: '2026-12-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    cancelAt: null,
    trialEnd: null,
    collectionMethod: 'charge_automatically',
    ...overrides,
  }
}

/** A paying Team organization, as its owner sees it. */
function teamOverview(overrides: Partial<EnabledBillingOverview> = {}): BillingOverview {
  return overview({
    planCode: 'team',
    planName: 'Team',
    subscribedPlanCode: 'team',
    source: 'subscription',
    features: [...PLANS.team.features],
    limits: PLANS.team.limits,
    hasBillingAccount: true,
    trialEligible: false,
    subscription: subscription(),
    ...overrides,
  })
}

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
    confirmMock.mockReset()
    cancelMock.mockReset()
    refreshMock.mockReset()
    invoicesMock.mockReset()
    invoicesMock.mockReturnValue({ data: { invoices: [] }, isLoading: false, error: null })
    routeState.orgSlug = 'acme'
    routeState.activeSlug = 'acme'
    window.history.replaceState(null, '', '/acme/settings/billing')
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
    useBillingMock.mockReturnValue({ data: teamOverview(), isLoading: false })
    render(<BillingSettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade to Business' }))
    // Straight to Stripe's confirmation of this exact change.
    expect(openPortalMock).toHaveBeenCalledWith(
      { intent: 'change_plan', plan: 'business', interval: 'month' },
      expect.any(Object)
    )
    expect(startCheckoutMock).not.toHaveBeenCalled()
  })

  it('lets a monthly subscriber switch the same plan to annual billing', async () => {
    useBillingMock.mockReturnValue({ data: teamOverview(), isLoading: false })
    render(<BillingSettingsPage />)
    expect(screen.queryByRole('button', { name: /Switch to annual/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /annual/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Switch to annual billing' }))
    expect(openPortalMock).toHaveBeenCalledWith(
      { intent: 'change_plan', plan: 'team', interval: 'year' },
      expect.any(Object)
    )
  })

  it('offers a paying owner the way down to Free and back out of a cancellation', async () => {
    useBillingMock.mockReturnValue({ data: teamOverview(), isLoading: false })
    const { unmount } = render(<BillingSettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Downgrade to Free' }))
    expect(openPortalMock).toHaveBeenCalledWith({ intent: 'cancel' }, expect.any(Object))
    unmount()

    useBillingMock.mockReturnValue({
      data: teamOverview({
        notices: ['cancellation_scheduled'],
        subscription: subscription({
          cancelAtPeriodEnd: true,
          cancelAt: '2026-12-01T00:00:00.000Z',
        }),
      }),
      isLoading: false,
    })
    render(<BillingSettingsPage />)
    expect(screen.getByText('Cancellation scheduled')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Downgrade to Free' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep my plan' }))
    expect(openPortalMock).toHaveBeenLastCalledWith({ intent: 'manage' }, expect.any(Object))
  })

  it('explains an overdue subscription that has lapsed to Free and how to fix it', async () => {
    useBillingMock.mockReturnValue({
      data: teamOverview({
        planCode: 'free',
        planName: 'Free',
        source: 'free',
        features: [],
        limits: PLANS.free.limits,
        notices: ['payment_failed'],
        subscription: subscription({ status: 'past_due' }),
      }),
      isLoading: false,
    })
    render(<BillingSettingsPage />)
    // Not "Free plan · renews" with an "Upgrade to Team" that silently opens the portal.
    expect(screen.queryByText(/renews/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upgrade to Team' })).not.toBeInTheDocument()
    expect(screen.getByText(/Team subscription on hold/)).toBeInTheDocument()
    expect(screen.getByText(/unpaid invoice/)).toBeInTheDocument()
    const fixes = screen.getAllByRole('button', { name: 'Fix payment' })
    await userEvent.click(fixes[0] as HTMLElement)
    expect(openPortalMock).toHaveBeenCalledWith({ intent: 'manage' }, expect.any(Object))
  })

  it('lists recent invoices with links to view, pay and download them', () => {
    invoicesMock.mockReturnValue({
      data: {
        invoices: [
          {
            id: 'in_2',
            number: 'DURA-0002',
            status: 'open',
            total: 900,
            amountDue: 900,
            currency: 'usd',
            created: '2026-11-01T00:00:00.000Z',
            hostedInvoiceUrl: 'https://invoice.stripe.test/in_2',
            invoicePdf: 'https://invoice.stripe.test/in_2.pdf',
          },
          {
            id: 'in_1',
            number: 'DURA-0001',
            status: 'paid',
            total: 900,
            amountDue: 0,
            currency: 'usd',
            created: '2026-10-01T00:00:00.000Z',
            hostedInvoiceUrl: 'https://invoice.stripe.test/in_1',
            invoicePdf: null,
          },
        ],
      },
      isLoading: false,
      error: null,
    })
    useBillingMock.mockReturnValue({ data: teamOverview(), isLoading: false })
    render(<BillingSettingsPage />)
    expect(screen.getAllByTestId('invoice-row')).toHaveLength(2)
    expect(screen.getByText('DURA-0002')).toBeInTheDocument()
    expect(screen.getAllByText('$9.00')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Pay now' })).toHaveAttribute(
      'href',
      'https://invoice.stripe.test/in_2'
    )
    expect(screen.getByRole('link', { name: /View/ })).toHaveAttribute(
      'href',
      'https://invoice.stripe.test/in_1'
    )
    expect(screen.getByRole('link', { name: /Download invoice DURA-0002/ })).toHaveAttribute(
      'href',
      'https://invoice.stripe.test/in_2.pdf'
    )
  })

  it('keeps invoices to the owner and to organizations with a billing account', () => {
    useBillingMock.mockReturnValue({
      data: teamOverview({ canManageBilling: false }),
      isLoading: false,
    })
    const { unmount } = render(<BillingSettingsPage />)
    expect(screen.queryByTestId('invoices-card')).not.toBeInTheDocument()
    unmount()
    useBillingMock.mockReturnValue({ data: overview(), isLoading: false })
    render(<BillingSettingsPage />)
    expect(screen.queryByTestId('invoices-card')).not.toBeInTheDocument()
  })

  it('says why nothing can be bought while purchases are paused', () => {
    useBillingMock.mockReturnValue({
      data: overview({ purchasesEnabled: false }),
      isLoading: false,
    })
    render(<BillingSettingsPage />)
    expect(screen.queryByRole('button', { name: 'Upgrade to Team' })).not.toBeInTheDocument()
    expect(screen.getByText(/New purchases are paused/)).toBeInTheDocument()
  })

  it('does not call Free the current plan while the beta grant gives full access', () => {
    useBillingMock.mockReturnValue({
      data: overview({
        source: 'migration_grant',
        migrationGrantExpiresAt: '2026-12-15T00:00:00.000Z',
        proposedPlanCode: 'team',
      }),
      isLoading: false,
    })
    render(<BillingSettingsPage />)
    expect(screen.queryByText('Current')).not.toBeInTheDocument()
    expect(screen.getByText('Durabull Cloud plans are starting')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose Team' })).toBeInTheDocument()
    expect(screen.getByText(/Applies from .* unless a plan is chosen/)).toBeInTheDocument()
  })

  it('waits for the route’s organization before showing or acting on billing', () => {
    routeState.activeSlug = 'other-org'
    window.history.replaceState(null, '', '/acme/settings/billing?portal=returned')
    useBillingMock.mockReturnValue({ data: teamOverview(), isLoading: false })
    render(<BillingSettingsPage />)
    expect(screen.getByTestId('billing-loading')).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('shows when a trial ends instead of a renewal date', () => {
    useBillingMock.mockReturnValue({
      data: overview({
        planCode: 'business',
        planName: 'Business',
        source: 'trial',
        hasBillingAccount: true,
        trialEligible: false,
        subscription: {
          status: 'trialing',
          planCode: 'business',
          interval: 'month',
          currentPeriodEnd: '2026-11-15T00:00:00.000Z',
          cancelAtPeriodEnd: false,
          cancelAt: null,
          trialEnd: '2026-11-15T00:00:00.000Z',
          collectionMethod: 'charge_automatically',
        },
      }),
      isLoading: false,
    })
    render(<BillingSettingsPage />)
    expect(screen.getByText(/Free trial · ends/)).toBeInTheDocument()
    expect(screen.queryByText(/renews/)).not.toBeInTheDocument()
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

  it('closes the attempt when the owner leaves Checkout without paying', () => {
    window.history.replaceState(null, '', '/acme/settings/billing?checkout=canceled')
    cancelMock.mockResolvedValue({ status: 'canceled' })
    useBillingMock.mockReturnValue({
      data: overview({
        pendingCheckout: {
          planCode: 'team',
          interval: 'month',
          trial: false,
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      }),
      isLoading: false,
    })
    render(<BillingSettingsPage />)
    expect(cancelMock).toHaveBeenCalled()
    expect(screen.getByText('Checkout canceled')).toBeInTheDocument()
    expect(screen.queryByText('Confirming your purchase')).not.toBeInTheDocument()
  })

  it('discloses payment grace without a stale confirmation notice', () => {
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
    // An open attempt someone else abandoned is not "your purchase".
    expect(screen.queryByText('Confirming your purchase')).not.toBeInTheDocument()
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
    expect(screen.getByText('Purchase complete')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('says so when a Checkout return cannot be confirmed yet', async () => {
    window.history.replaceState(
      null,
      '',
      '/acme/settings/billing?checkout=success&session_id=cs_test_2'
    )
    confirmMock.mockResolvedValue({ status: 'open' })
    useBillingMock.mockReturnValue({ data: overview(), isLoading: false })
    render(<BillingSettingsPage />)
    await waitFor(() =>
      expect(screen.getByText('We could not confirm the purchase yet')).toBeInTheDocument()
    )
    expect(screen.queryByText('Purchase complete')).not.toBeInTheDocument()
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
