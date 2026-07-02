import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsLayout } from '@/components/settings/settings-layout'

const appModeState = vi.hoisted(() => ({
  isAuthless: false,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode
    to: string
    className?: string
  }) => (
    <a href={to} className={className}>
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

  it('hides team in authless mode', () => {
    appModeState.isAuthless = true
    render(
      <SettingsLayout orgSlug="acme">
        <div>Content</div>
      </SettingsLayout>
    )

    expect(screen.queryByRole('link', { name: /team/i })).not.toBeInTheDocument()
  })
})
