import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConnectionUnavailable } from '@/components/connection-unavailable'
import { setTestEntitlement } from '@/test/entitlement'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

const PROPS = { orgSlug: 'acme', connectionId: 'c1', connectionName: 'Production' }

describe('ConnectionUnavailable', () => {
  it('explains a paused connection and sends the owner to restore it', () => {
    setTestEntitlement({ plan: 'free' })
    render(<ConnectionUnavailable {...PROPS} reason="paused" showRulesLink />)
    expect(screen.getByText('Production is paused by your plan')).toBeInTheDocument()
    expect(screen.getByText(/Nothing in your Redis was changed/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Restore or upgrade' })).toHaveAttribute(
      'href',
      '/$orgSlug/settings/billing'
    )
    expect(screen.getByRole('link', { name: 'Its alert rules' })).toBeInTheDocument()
  })

  it('tells other members who can restore it', () => {
    setTestEntitlement({ plan: 'free', canManageBilling: false })
    render(<ConnectionUnavailable {...PROPS} reason="paused" showRulesLink={false} />)
    expect(
      screen.getByText(/Ask your organization owner to restore it or upgrade/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Restore or upgrade' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Its alert rules' })).not.toBeInTheDocument()
  })

  it('sends a disabled connection to its settings, not to billing', () => {
    setTestEntitlement({ plan: 'team' })
    render(<ConnectionUnavailable {...PROPS} reason="disabled" showRulesLink />)
    expect(screen.getByText('Production is disabled')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connection settings' })).toHaveAttribute(
      'href',
      '/$orgSlug/settings/connections'
    )
    expect(screen.queryByRole('link', { name: 'Restore or upgrade' })).not.toBeInTheDocument()
  })
})
