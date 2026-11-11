import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsLayout } from '@/components/settings/settings-layout'

const appModeState = vi.hoisted(() => ({
  isAuthless: false,
  billingEnabled: false,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode
    to: string
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ({
    pathname: '/acme/settings/connections',
  }),
}))

vi.mock('@/hooks/use-app-mode', () => ({
  useAppMode: () => appModeState,
}))

describe('SettingsLayout', () => {
  it('renders all settings nav items when auth is enabled', () => {
    appModeState.isAuthless = false
    render(
      <SettingsLayout orgSlug="acme">
        <div>Content</div>
      </SettingsLayout>
    )

    expect(screen.getByRole('link', { name: /authentication/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /appearance/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /integrations/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /alert destinations/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /alert destinations/i })).toHaveAttribute(
      'href',
      '/acme/settings/destinations'
    )
    expect(screen.getByRole('link', { name: /connections/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /team/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /about/i })).toBeInTheDocument()
  })

  it('groups the sections and marks the current one', () => {
    appModeState.isAuthless = false
    render(
      <SettingsLayout orgSlug="acme">
        <div>Content</div>
      </SettingsLayout>
    )

    expect(screen.getByRole('navigation', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getAllByRole('group')).toHaveLength(4)
    for (const label of ['Workspace', 'Alerting', 'Security', 'Preferences']) {
      expect(screen.getByRole('group', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Connections' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: 'About' })).not.toHaveAttribute('aria-current')
  })

  it('hides everything about people and sign-in on an install without accounts', () => {
    appModeState.isAuthless = true
    render(
      <SettingsLayout orgSlug="acme">
        <div>Content</div>
      </SettingsLayout>
    )

    expect(screen.queryByRole('link', { name: /team/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /service accounts/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /authentication/i })).not.toBeInTheDocument()
    // A group with no visible sections is dropped instead of leaving an empty label.
    expect(screen.queryByRole('group', { name: 'Security' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connections' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Appearance' })).toBeInTheDocument()
  })

  it('shows billing only when Cloud billing is enabled', () => {
    appModeState.isAuthless = false
    appModeState.billingEnabled = false
    const { unmount } = render(
      <SettingsLayout orgSlug="acme">
        <div>Content</div>
      </SettingsLayout>
    )
    expect(screen.queryByRole('link', { name: /billing/i })).not.toBeInTheDocument()
    unmount()

    appModeState.billingEnabled = true
    render(
      <SettingsLayout orgSlug="acme">
        <div>Content</div>
      </SettingsLayout>
    )
    expect(screen.getByRole('link', { name: /billing/i })).toHaveAttribute(
      'href',
      '/acme/settings/billing'
    )
  })
})
