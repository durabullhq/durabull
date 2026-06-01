import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NavUser } from '@/components/nav-user'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setTheme: vi.fn(),
  signOut: vi.fn(),
  theme: 'dark',
  trackEvent: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@/components/theme-provider', () => ({
  useTheme: () => ({
    theme: mocks.theme,
    setTheme: mocks.setTheme,
  }),
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    signOut: mocks.signOut,
  }),
}))

vi.mock('@durabull/analytics/browser', () => ({
  trackEvent: mocks.trackEvent,
}))

vi.mock('@durabull/analytics/events', () => ({
  AnalyticsEvents: {
    USER_SIGNED_OUT: 'USER_SIGNED_OUT',
    THEME_CHANGED: 'THEME_CHANGED',
  },
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))

describe('NavUser', () => {
  it('navigates settings shortcut to provided consolidated path', () => {
    render(
      <NavUser
        user={{ name: 'Jane Doe', email: 'jane@example.com', avatar: '' }}
        settingsPath="/acme/settings/connections"
      />
    )

    fireEvent.click(screen.getByText('Settings'))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/acme/settings/connections',
    })
  })
})
