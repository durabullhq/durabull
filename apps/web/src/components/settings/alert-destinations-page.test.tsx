import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertDestinationsPage } from '@/components/settings/alert-destinations-page'
import type { AlertDestinationRecord } from '@/hooks/use-alerts'

const {
  toastSuccessMock,
  toastErrorMock,
  useAlertDestinationsMock,
  createMutateAsyncMock,
  updateMutateAsyncMock,
  deleteMutateAsyncMock,
  testMutateAsyncMock,
  refetchMock,
  slackOverviewMock,
  connectSlackMock,
} = vi.hoisted(() => ({
  slackOverviewMock: vi.fn(),
  connectSlackMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  useAlertDestinationsMock: vi.fn(),
  createMutateAsyncMock: vi.fn(),
  updateMutateAsyncMock: vi.fn(),
  deleteMutateAsyncMock: vi.fn(),
  testMutateAsyncMock: vi.fn(),
  refetchMock: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock('@/hooks/use-alerts', () => ({
  useAlertDestinations: useAlertDestinationsMock,
  useCreateAlertDestination: () => ({ mutateAsync: createMutateAsyncMock, isPending: false }),
  useUpdateAlertDestination: () => ({ mutateAsync: updateMutateAsyncMock, isPending: false }),
  useDeleteAlertDestination: () => ({ mutateAsync: deleteMutateAsyncMock, isPending: false }),
  useTestAlertDestination: () => ({ mutateAsync: testMutateAsyncMock, isPending: false }),
  useLinearIntegration: () => ({
    data: { integration: { validationStatus: 'valid' } },
  }),
  useLinearMetadata: () => ({ data: undefined, isLoading: false }),
}))

vi.mock('@/hooks/use-slack', () => ({
  useSlackIntegration: () => ({ data: slackOverviewMock(), isLoading: false }),
  useConnectSlack: () => ({ mutateAsync: connectSlackMock, isPending: false }),
  useSlackChannels: () => ({
    data: {
      channels: [
        { id: 'C0ALERTS', name: 'alerts', isPrivate: false, isMember: false },
        { id: 'G0SECRET', name: 'secret', isPrivate: true, isMember: false },
      ],
      truncated: false,
    },
    isLoading: false,
    isError: false,
    refresh: vi.fn(),
  }),
  useSlackUserGroups: () => ({
    data: { userGroups: [{ id: 'S0ONCALL', handle: 'oncall', name: 'On-call' }] },
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-organization', () => ({
  useActiveOrganization: () => ({ data: { id: 'org-1', slug: 'acme' } }),
}))

vi.mock('@/hooks/use-billing', () => ({
  useBilling: () => ({ data: { enabled: true, canManageBilling: true } }),
  reportUpgradePromptShown: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a href={to.replace('$orgSlug', params?.orgSlug ?? '')} {...props}>
      {children}
    </a>
  ),
}))

function buildDestination(overrides: Partial<AlertDestinationRecord> = {}): AlertDestinationRecord {
  return {
    id: 'dest-1',
    organizationId: 'org-1',
    name: 'On-call pipeline',
    type: 'webhook',
    url: 'https://example.com/hook',
    config: {},
    enabled: true,
    secretConfigured: true,
    secretLast4: '4242',
    inUseByRuleCount: 0,
    ...overrides,
  }
}

describe('AlertDestinationsPage', () => {
  beforeEach(() => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    createMutateAsyncMock.mockReset().mockResolvedValue({ destination: buildDestination() })
    updateMutateAsyncMock.mockReset().mockResolvedValue({ destination: buildDestination() })
    deleteMutateAsyncMock.mockReset().mockResolvedValue({ ok: true })
    testMutateAsyncMock
      .mockReset()
      .mockResolvedValue({ success: true, httpStatus: 200, durationMs: 87 })
    refetchMock.mockReset()
    connectSlackMock.mockReset().mockResolvedValue({ authorizationUrl: 'https://slack.com/oauth' })
    slackOverviewMock.mockReturnValue({
      configured: true,
      entitled: true,
      installation: { status: 'active' },
    })

    useAlertDestinationsMock.mockReturnValue({
      data: { destinations: [buildDestination()] },
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    })
  })

  it('lists destinations with type, target, secret hint, and usage', () => {
    useAlertDestinationsMock.mockReturnValue({
      data: {
        destinations: [
          buildDestination({ inUseByRuleCount: 3 }),
          buildDestination({
            id: 'dest-2',
            name: 'Ops inbox',
            type: 'email',
            url: null,
            config: { target: 'ops@example.com' },
            secretConfigured: false,
            secretLast4: undefined,
          }),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    })

    render(<AlertDestinationsPage />)

    expect(screen.getByText('On-call pipeline')).toBeInTheDocument()
    expect(screen.getByText(/https:\/\/example\.com\/hook/)).toBeInTheDocument()
    expect(screen.getByText(/secret …4242/)).toBeInTheDocument()
    expect(screen.getByText('In use by 3 rules')).toBeInTheDocument()
    expect(screen.getByText('Ops inbox')).toBeInTheDocument()
    expect(screen.getByText('ops@example.com')).toBeInTheDocument()
  })

  it('creates a webhook destination through the type-choice dialog', async () => {
    const user = userEvent.setup()

    render(<AlertDestinationsPage />)

    await user.click(screen.getByRole('button', { name: /Add destination/ }))
    await user.click(await screen.findByTestId('destination-type-webhook'))

    await user.type(screen.getByLabelText('Name'), 'New hook')
    await user.type(screen.getByLabelText('URL'), 'https://example.com/new')
    await user.type(screen.getByLabelText('Signing secret'), 'super-secret-value-123')
    await user.click(screen.getByRole('button', { name: 'Create destination' }))

    await waitFor(() =>
      expect(createMutateAsyncMock).toHaveBeenCalledWith({
        type: 'webhook',
        name: 'New hook',
        url: 'https://example.com/new',
        signingSecret: 'super-secret-value-123',
      })
    )
    expect(toastSuccessMock).toHaveBeenCalledWith('Destination created', {
      description: 'New hook',
    })
  })

  it('creates an email destination with a config target', async () => {
    const user = userEvent.setup()

    render(<AlertDestinationsPage />)

    await user.click(screen.getByRole('button', { name: /Add destination/ }))
    await user.click(await screen.findByTestId('destination-type-email'))

    await user.type(screen.getByLabelText('Name'), 'Ops inbox')
    await user.type(screen.getByLabelText('Recipient email'), 'oncall@example.com')
    await user.click(screen.getByRole('button', { name: 'Create destination' }))

    await waitFor(() =>
      expect(createMutateAsyncMock).toHaveBeenCalledWith({
        type: 'email',
        name: 'Ops inbox',
        config: { target: 'oncall@example.com' },
      })
    )
  })

  it('edits a destination and saves the patch payload', async () => {
    const user = userEvent.setup()

    render(<AlertDestinationsPage />)

    await user.click(screen.getByRole('button', { name: 'Edit' }))

    const nameInput = await screen.findByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Renamed hook')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(updateMutateAsyncMock).toHaveBeenCalledWith({
        destinationId: 'dest-1',
        input: {
          name: 'Renamed hook',
          enabled: true,
          url: 'https://example.com/hook',
        },
      })
    )
  })

  it('tests a webhook destination and reports http status and duration', async () => {
    const user = userEvent.setup()

    render(<AlertDestinationsPage />)

    await user.click(screen.getByRole('button', { name: 'Test' }))

    await waitFor(() => expect(testMutateAsyncMock).toHaveBeenCalledWith('dest-1'))
    expect(toastSuccessMock).toHaveBeenCalledWith('Test delivered to On-call pipeline', {
      description: 'HTTP 200 in 87ms',
    })
  })

  it('deletes an unused destination after confirmation', async () => {
    const user = userEvent.setup()

    render(<AlertDestinationsPage />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // The row button and the dialog confirm share the label; the portal-mounted
    // dialog confirm is appended last in the DOM.
    const deleteButtons = await screen.findAllByRole('button', { name: 'Delete' })
    await user.click(deleteButtons[deleteButtons.length - 1])

    await waitFor(() => expect(deleteMutateAsyncMock).toHaveBeenCalledWith('dest-1'))
    expect(toastSuccessMock).toHaveBeenCalledWith('Destination deleted', {
      description: 'On-call pipeline was removed.',
    })
  })

  it('disables delete for in-use destinations', () => {
    useAlertDestinationsMock.mockReturnValue({
      data: { destinations: [buildDestination({ inUseByRuleCount: 2 })] },
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    })

    render(<AlertDestinationsPage />)

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('shows the empty state and the error state with retry', async () => {
    const user = userEvent.setup()
    useAlertDestinationsMock.mockReturnValue({
      data: { destinations: [] },
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    })

    const { unmount } = render(<AlertDestinationsPage />)
    expect(screen.getByText('No destinations yet')).toBeInTheDocument()
    unmount()

    useAlertDestinationsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchMock,
    })

    render(<AlertDestinationsPage />)
    expect(screen.getByText('Failed to load alert destinations.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetchMock).toHaveBeenCalled()
  })

  it('creates a Slack destination with a channel, mentions and user groups', async () => {
    const user = userEvent.setup()
    render(<AlertDestinationsPage />)

    await user.click(screen.getByRole('button', { name: 'Add destination' }))
    await user.click(await screen.findByTestId('destination-type-slack'))
    const create = screen.getByRole('button', { name: 'Create destination' })
    expect(create).toBeDisabled()

    const channel = screen.getByLabelText('Channel')
    expect(screen.getByRole('option', { name: /secret \(invite @Durabull first\)/ })).toBeDisabled()
    await user.selectOptions(channel, 'C0ALERTS')
    await user.selectOptions(screen.getByLabelText('Notify'), 'here')
    await user.selectOptions(screen.getByLabelText('Mention user groups'), 'S0ONCALL')
    await user.click(create)

    await waitFor(() =>
      expect(createMutateAsyncMock).toHaveBeenCalledWith({
        type: 'slack',
        name: 'Slack #alerts',
        config: {
          channelId: 'C0ALERTS',
          channelName: 'alerts',
          mention: 'here',
          userGroupIds: ['S0ONCALL'],
          threadUpdates: true,
        },
      })
    )
  })

  it('offers to connect Slack from the type picker when it is not connected', async () => {
    slackOverviewMock.mockReturnValue({ configured: true, entitled: true, installation: null })
    const user = userEvent.setup()
    render(<AlertDestinationsPage />)

    await user.click(screen.getByRole('button', { name: 'Add destination' }))
    const slackOption = await screen.findByTestId('destination-type-slack')
    expect(slackOption).toHaveTextContent('Connect your Slack workspace')
    await user.click(screen.getByRole('button', { name: /Add to Slack/ }))
    expect(connectSlackMock).toHaveBeenCalledWith({ returnTo: 'destinations' })
  })

  it('nudges Free organizations toward the Team plan instead of offering Slack', async () => {
    slackOverviewMock.mockReturnValue({ configured: true, entitled: false, installation: null })
    const user = userEvent.setup()
    render(<AlertDestinationsPage />)

    await user.click(screen.getByRole('button', { name: 'Add destination' }))
    const slackOption = await screen.findByTestId('destination-type-slack')
    expect(slackOption).toHaveTextContent('Team plan')
    expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute(
      'href',
      '/acme/settings/billing'
    )
  })

  it('summarises Slack destinations by channel and mentions', () => {
    useAlertDestinationsMock.mockReturnValue({
      data: {
        destinations: [
          buildDestination({
            id: 'slack-1',
            name: 'Ops channel',
            type: 'slack',
            url: null,
            secretConfigured: false,
            config: {
              channelId: 'C0ALERTS',
              channelName: 'alerts',
              mention: 'here',
              userGroupIds: ['S1'],
            },
          }),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    })
    render(<AlertDestinationsPage />)
    expect(screen.getByText('#alerts · @here · 1 group')).toBeInTheDocument()
  })
})
