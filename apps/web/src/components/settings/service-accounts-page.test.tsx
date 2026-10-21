import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceAccountsPage } from '@/components/settings/service-accounts-page'

const { useBillingMock, useServiceAccountsMock } = vi.hoisted(() => ({
  useBillingMock: vi.fn(),
  useServiceAccountsMock: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/billing">{children}</a>,
}))
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/use-organization', () => ({
  useOrganizationMembers: () => ({ data: [{ userId: 'u1', role: 'owner' }] }),
  useActiveOrganization: () => ({ data: { id: 'org1', slug: 'acme' } }),
}))
vi.mock('@/hooks/use-billing', () => ({ useBilling: useBillingMock }))
vi.mock('@/hooks/use-service-accounts', () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })
  return {
    useServiceAccounts: useServiceAccountsMock,
    useCreateServiceAccount: mutation,
    useDeleteServiceAccount: mutation,
    useRotateServiceAccountToken: mutation,
    useSetServiceAccountDisabled: mutation,
  }
})

const account = {
  id: 'sa1',
  name: 'ci-bot',
  description: null,
  disabled: false,
  suspended: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  scopes: ['mcp:discover', 'mcp:jobs:read'],
  tokenLastFour: 'abcd',
  tokenExpiresAt: '2027-01-01T00:00:00.000Z',
}

describe('ServiceAccountsPage', () => {
  beforeEach(() => {
    useServiceAccountsMock.mockReturnValue({
      data: { serviceAccounts: [account] },
      isLoading: false,
    })
  })

  it('shows accounts as usable when the plan includes service accounts', () => {
    useBillingMock.mockReturnValue({
      data: { enabled: true, enforced: true, features: ['automation.service_accounts'] },
    })
    render(<ServiceAccountsPage />)
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New service account/ })).toBeInTheDocument()
    expect(screen.queryByTestId('service-accounts-plan-locked')).not.toBeInTheDocument()
  })

  it('marks accounts locked and hides creation when the plan does not include them', () => {
    useBillingMock.mockReturnValue({ data: { enabled: true, enforced: true, features: [] } })
    render(<ServiceAccountsPage />)
    expect(screen.getByTestId('service-accounts-plan-locked')).toBeInTheDocument()
    expect(screen.getByText('Locked by plan')).toBeInTheDocument()
    expect(screen.queryByText('Enabled')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New service account/ })).not.toBeInTheDocument()
  })

  it('has no plan lock on self-hosted deployments', () => {
    useBillingMock.mockReturnValue({ data: { enabled: false } })
    render(<ServiceAccountsPage />)
    expect(screen.queryByTestId('service-accounts-plan-locked')).not.toBeInTheDocument()
  })
})
