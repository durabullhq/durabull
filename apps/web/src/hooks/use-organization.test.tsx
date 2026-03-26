import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOrganizations } from '@/hooks/use-organization'

const { modeState, authState, organizationListMock, sessionGetMock, handleResMock } = vi.hoisted(
  () => ({
    modeState: {
      isAuthless: false,
      isLoading: false,
    },
    authState: {
      isAuthenticated: false,
      session: null,
    },
    organizationListMock: vi.fn(),
    sessionGetMock: vi.fn(),
    handleResMock: vi.fn(),
  })
)

vi.mock('@/hooks/use-app-mode', () => ({
  useAppMode: () => modeState,
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authState,
}))

vi.mock('@durabull/auth/client', () => ({
  organization: {
    list: organizationListMock,
    getFullOrganization: vi.fn(),
    setActive: vi.fn(),
    create: vi.fn(),
    listUserInvitations: vi.fn(),
    acceptInvitation: vi.fn(),
    rejectInvitation: vi.fn(),
    checkSlug: vi.fn(),
    inviteMember: vi.fn(),
    listInvitations: vi.fn(),
    cancelInvitation: vi.fn(),
    removeMember: vi.fn(),
    updateMemberRole: vi.fn(),
  },
}))

vi.mock('@/lib/api', () => ({
  api: {
    session: {
      $get: sessionGetMock,
    },
  },
  handleRes: handleResMock,
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useOrganizations', () => {
  beforeEach(() => {
    modeState.isAuthless = false
    modeState.isLoading = false
    authState.isAuthenticated = false
    authState.session = null
    organizationListMock.mockReset()
    sessionGetMock.mockReset()
    handleResMock.mockReset()
  })

  it('waits for app mode before fetching organizations', async () => {
    modeState.isLoading = true
    authState.isAuthenticated = true

    const { result } = renderHook(() => useOrganizations(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))

    expect(organizationListMock).not.toHaveBeenCalled()
    expect(sessionGetMock).not.toHaveBeenCalled()
  })

  it('uses the session organization in authless mode', async () => {
    modeState.isAuthless = true
    authState.isAuthenticated = true

    const authlessOrganization = {
      id: 'authless-org',
      name: 'Local Organization',
      slug: 'local',
    }

    sessionGetMock.mockResolvedValue({ ok: true })
    handleResMock.mockResolvedValue({
      organization: authlessOrganization,
    })

    const { result } = renderHook(() => useOrganizations(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.data).toEqual([authlessOrganization]))

    expect(sessionGetMock).toHaveBeenCalledTimes(1)
    expect(organizationListMock).not.toHaveBeenCalled()
  })
})
