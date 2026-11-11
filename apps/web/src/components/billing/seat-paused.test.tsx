import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SeatPaused } from '@/components/billing/seat-paused'

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

  it('offers to create an organization when there is no other one', () => {
    render(<SeatPaused organizationName="Acme" otherOrganizations={[]} />)
    expect(screen.getByRole('link', { name: 'Create your own organization' })).toHaveAttribute(
      'href',
      '/setup-organization'
    )
  })
})
