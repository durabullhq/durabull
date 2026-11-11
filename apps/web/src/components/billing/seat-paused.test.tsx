import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SeatPaused } from '@/components/billing/seat-paused'

vi.mock('@/components/organization-selector', () => ({
  CreateOrganizationDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-organization-dialog" /> : null,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode
    to: string
    params?: { orgSlug?: string }
  }) => <a href={params?.orgSlug ? to.replace('$orgSlug', params.orgSlug) : to}>{children}</a>,
}))

describe('SeatPaused', () => {
  it('links straight to the member’s other organizations', () => {
    render(
      <SeatPaused
        organizationName="Acme"
        otherOrganizations={[{ id: 'o2', name: 'Globex', slug: 'globex' }]}
      />
    )
    expect(screen.getByText('Your seat in Acme is paused')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Globex' })).toHaveAttribute('href', '/globex')
  })

  it('creates an organization in place when there is no other one', async () => {
    render(<SeatPaused organizationName="Acme" otherOrganizations={[]} />)
    expect(screen.queryByTestId('create-organization-dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create your own organization' }))
    expect(screen.getByTestId('create-organization-dialog')).toBeInTheDocument()
  })
})
