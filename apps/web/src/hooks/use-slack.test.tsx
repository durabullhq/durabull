import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SlackOverviewOrganizationMismatchError, slackKeys, useSlackIntegration } from './use-slack'

const mocks = vi.hoisted(() => ({
  activeOrganization: { id: 'org-a', slug: 'acme' },
  slackGet: vi.fn(),
}))

vi.mock('./use-organization', () => ({
  useActiveOrganization: () => ({ data: mocks.activeOrganization }),
}))

vi.mock('@/lib/api', () => ({
  api: { integrations: { slack: { $get: mocks.slackGet } } },
  handleRes: async (response: { json: () => Promise<unknown> }) => response.json(),
}))

const answerFor = (organizationId: string, teamName?: string) => ({
  json: async () => ({
    organizationId,
    configured: true,
    entitled: true,
    canManage: true,
    installation: teamName
      ? {
          id: `inst-${organizationId}`,
          status: 'active',
          slackTeamId: 'T1',
          slackTeamName: teamName,
        }
      : null,
  }),
})

describe('useSlackIntegration', () => {
  let queryClient: QueryClient
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  beforeEach(() => {
    mocks.slackGet.mockReset()
    mocks.activeOrganization = { id: 'org-a', slug: 'acme' }
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('never caches an overview answered for another organization (A → B → A)', async () => {
    // Organization A: its own overview.
    mocks.slackGet.mockResolvedValueOnce(answerFor('org-a'))
    const { result, rerender } = renderHook(() => useSlackIntegration(), { wrapper })
    await waitFor(() => expect(result.current.data?.organizationId).toBe('org-a'))

    // The session switches to B, but a request still keyed to A comes back for B.
    mocks.slackGet.mockResolvedValueOnce(answerFor('org-b', 'Globex'))
    await queryClient.refetchQueries({ queryKey: slackKeys.overview('org-a') })
    const stateForA = queryClient.getQueryState(slackKeys.overview('org-a'))
    expect(stateForA?.error).toBeInstanceOf(SlackOverviewOrganizationMismatchError)
    expect(queryClient.getQueryData(slackKeys.overview('org-a'))).toMatchObject({
      organizationId: 'org-a',
      installation: null,
    })

    // Organization B loads its own overview under its own key.
    mocks.activeOrganization = { id: 'org-b', slug: 'globex' }
    mocks.slackGet.mockResolvedValueOnce(answerFor('org-b', 'Globex'))
    rerender()
    await waitFor(() => expect(result.current.data?.organizationId).toBe('org-b'))
    expect(result.current.data?.installation?.slackTeamName).toBe('Globex')

    // Back on A, B's workspace never shows up.
    mocks.activeOrganization = { id: 'org-a', slug: 'acme' }
    mocks.slackGet.mockResolvedValueOnce(answerFor('org-a'))
    rerender()
    await waitFor(() => expect(result.current.data?.organizationId).toBe('org-a'))
    expect(result.current.data?.installation).toBeNull()
  })
})
