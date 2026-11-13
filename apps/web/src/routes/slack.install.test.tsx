import { render, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  organizations: { data: [] as Array<{ id: string; slug: string }>, isFetching: false },
  refetch: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({ options }),
  useNavigate: () => mocks.navigate,
}))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}))
vi.mock('@/hooks/use-app-mode', () => ({ useAppMode: () => ({ isAuthless: false }) }))
vi.mock('@/hooks/use-organization', () => ({
  useOrganizations: () => ({
    data: mocks.organizations.data,
    isLoading: false,
    isError: false,
    isFetching: mocks.organizations.isFetching,
    refetch: mocks.refetch,
  }),
  useActiveOrganization: () => ({ data: null, isLoading: false }),
}))

const { Route } = await import('./slack.install')
const SlackInstall = (Route as unknown as { options: { component: ComponentType } }).options
  .component

describe('/slack/install', () => {
  beforeEach(() => {
    mocks.navigate.mockReset()
    mocks.refetch.mockReset()
    mocks.organizations = { data: [], isFetching: false }
  })

  it('continues the install when a just-joined organization appears on recheck', async () => {
    const { rerender } = render(<SlackInstall />)
    // An empty list is looked up again instead of sending the member to setup.
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).not.toHaveBeenCalled()

    mocks.organizations = { data: [{ id: 'org-1', slug: 'acme' }], isFetching: false }
    rerender(<SlackInstall />)

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        href: '/acme/settings/integrations?slack=install',
        replace: true,
      })
    )
  })

  it('sends members with no organization to setup after the recheck, keeping the redirect', async () => {
    const { rerender } = render(<SlackInstall />)
    expect(mocks.refetch).toHaveBeenCalledTimes(1)

    mocks.organizations = { data: [], isFetching: true }
    rerender(<SlackInstall />)
    expect(mocks.navigate).not.toHaveBeenCalled()

    mocks.organizations = { data: [], isFetching: false }
    rerender(<SlackInstall />)
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/setup-organization',
        search: { redirect: '/slack/install' },
        replace: true,
      })
    )
  })
})
