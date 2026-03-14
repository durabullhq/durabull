import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NavUser } from '@/components/nav-user'

const { signOutMock, navigateMock, modeState, themeState } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  navigateMock: vi.fn(),
  modeState: { isAuthless: false },
  themeState: {
    theme: 'dark',
    setTheme: vi.fn(),
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    signOut: signOutMock,
  }),
}))

vi.mock('@/hooks/use-app-mode', () => ({
  useAppMode: () => modeState,
}))

vi.mock('@/components/theme-provider', () => ({
  useTheme: () => themeState,
}))

describe('NavUser', () => {
  beforeEach(() => {
    modeState.isAuthless = false
    signOutMock.mockReset()
    navigateMock.mockReset()
    themeState.setTheme.mockReset()
  })

  it('hides sign out and shows local session copy in authless mode', async () => {
    modeState.isAuthless = true
    const user = userEvent.setup()

    render(
      <NavUser
        user={{
          name: 'Authless User',
          email: 'admin@localhost',
          avatar: '',
        }}
      />
    )

    expect(screen.getByText('Local development mode')).toBeInTheDocument()

    await user.click(screen.getByTestId('user-menu'))

    expect(screen.queryByTestId('sign-out')).not.toBeInTheDocument()
    expect(screen.getByText(/sign-out is unavailable in this mode/i)).toBeInTheDocument()
  })

  it('shows sign out in authenticated mode', async () => {
    const user = userEvent.setup()

    render(
      <NavUser
        user={{
          name: 'Test User',
          email: 'test@example.com',
          avatar: '',
        }}
      />
    )

    await user.click(screen.getByTestId('user-menu'))

    expect(screen.getByTestId('sign-out')).toBeInTheDocument()
  })
})
