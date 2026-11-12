import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SlackIntegrationCard } from '@/components/settings/slack-integration-card'

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  billing: vi.fn(),
  reportUpgrade: vi.fn(),
  connect: vi.fn(),
  update: vi.fn(),
  disconnect: vi.fn(),
  test: vi.fn(),
  createDestination: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: mocks.toastSuccess, error: mocks.toastError }),
}))

vi.mock('@/hooks/use-slack', () => ({
  useSlackIntegration: () => ({ data: mocks.overview(), isLoading: false }),
  useConnectSlack: () => ({ mutateAsync: mocks.connect, isPending: false }),
  useUpdateSlackSettings: () => ({ mutateAsync: mocks.update, isPending: false }),
  useDisconnectSlack: () => ({ mutateAsync: mocks.disconnect, isPending: false }),
  useTestSlack: () => ({ mutateAsync: mocks.test, isPending: false }),
  useSlackManifest: (enabled: boolean) => ({
    data: enabled ? { manifest: { display_information: { name: 'Durabull' } } } : undefined,
    isLoading: false,
  }),
  useSlackChannels: () => ({
    data: { channels: [{ id: 'C0ALERTS', name: 'alerts', isPrivate: false, isMember: true }] },
    isLoading: false,
    isError: false,
    refresh: vi.fn(),
  }),
  useSlackUserGroups: () => ({ data: { userGroups: [] }, isLoading: false }),
}))

vi.mock('@/hooks/use-alerts', () => ({
  useCreateAlertDestination: () => ({ mutateAsync: mocks.createDestination, isPending: false }),
}))

vi.mock('@/hooks/use-billing', () => ({
  useBilling: () => ({ data: mocks.billing() }),
  reportUpgradePromptShown: mocks.reportUpgrade,
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

const connectedInstallation = {
  id: 'inst-1',
  status: 'active',
  statusReason: null,
  slackTeamId: 'T0ACME',
  slackTeamName: 'Acme',
  slackTeamUrl: 'https://acme.slack.com/',
  botUserId: 'UBOT',
  scopes: 'chat:write',
  missingScopes: [],
  actionsEnabled: true,
  unfurlsEnabled: true,
  slackDestinationCount: 0,
  lastValidatedAt: null,
  createdAt: null,
}

describe('SlackIntegrationCard', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.billing.mockReturnValue({ enabled: true, canManageBilling: true })
    mocks.createDestination.mockResolvedValue({ destination: { id: 'dest-1' } })
  })

  it('shows Free organizations what Slack includes and links owners to the upgrade', () => {
    mocks.overview.mockReturnValue({ configured: true, entitled: false, installation: null })
    render(<SlackIntegrationCard orgSlug="acme" />)

    expect(screen.getByTestId('slack-upgrade-card')).toHaveTextContent('Team plan')
    expect(screen.getByText('Respond without switching apps')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Upgrade to Team/ })).toHaveAttribute(
      'href',
      '/acme/settings/billing'
    )
    expect(mocks.reportUpgrade).toHaveBeenCalledWith({ feature: 'integrations.slack' })
  })

  it('tells members who cannot buy to ask an owner', () => {
    mocks.overview.mockReturnValue({ configured: true, entitled: false, installation: null })
    mocks.billing.mockReturnValue({ enabled: true, canManageBilling: false })
    render(<SlackIntegrationCard orgSlug="acme" />)

    expect(screen.queryByRole('link', { name: /Upgrade/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Ask an organization owner to upgrade to Team/)).toBeInTheDocument()
  })

  it('walks self-hosters through creating the Slack app', async () => {
    mocks.overview.mockReturnValue({ configured: false, entitled: true, installation: null })
    const user = userEvent.setup()
    render(<SlackIntegrationCard orgSlug="acme" />)

    expect(screen.getByTestId('slack-not-configured-card')).toHaveTextContent(
      'SLACK_SIGNING_SECRET'
    )
    await user.click(screen.getByRole('button', { name: 'Show app manifest' }))
    expect(screen.getByText(/"display_information"/)).toBeInTheDocument()
  })

  it('starts the OAuth install', async () => {
    mocks.overview.mockReturnValue({ configured: true, entitled: true, installation: null })
    mocks.connect.mockResolvedValue({ authorizationUrl: 'https://slack.com/oauth/v2/authorize' })
    const user = userEvent.setup()
    render(<SlackIntegrationCard orgSlug="acme" />)

    await user.click(screen.getByRole('button', { name: /Add to Slack/ }))
    expect(mocks.connect).toHaveBeenCalledWith({ returnTo: 'integrations' })
  })

  it('creates the first Slack destination from the setup checklist', async () => {
    mocks.overview.mockReturnValue({
      configured: true,
      entitled: true,
      installation: connectedInstallation,
    })
    const user = userEvent.setup()
    render(<SlackIntegrationCard orgSlug="acme" />)

    expect(screen.getByText('Connected to Acme')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Channel'), 'C0ALERTS')
    await user.click(screen.getByRole('button', { name: 'Create Slack destination' }))
    await waitFor(() =>
      expect(mocks.createDestination).toHaveBeenCalledWith({
        type: 'slack',
        name: 'Slack #alerts',
        config: {
          channelId: 'C0ALERTS',
          channelName: 'alerts',
          mention: 'none',
          threadUpdates: true,
        },
      })
    )
  })

  it('updates Slack action and unfurl settings', async () => {
    mocks.overview.mockReturnValue({
      configured: true,
      entitled: true,
      installation: { ...connectedInstallation, slackDestinationCount: 2 },
    })
    const user = userEvent.setup()
    render(<SlackIntegrationCard orgSlug="acme" />)

    expect(screen.getByText('2 Slack destinations ready')).toBeInTheDocument()
    await user.click(screen.getByLabelText(/Allow actions from Slack/))
    expect(mocks.update).toHaveBeenCalledWith({ actionsEnabled: false })
    await user.click(screen.getByLabelText(/Preview Durabull links/))
    expect(mocks.update).toHaveBeenCalledWith({ unfurlsEnabled: false })
  })

  it('asks for a reconnect when Slack revoked the token or new scopes are needed', () => {
    mocks.overview.mockReturnValue({
      configured: true,
      entitled: true,
      installation: {
        ...connectedInstallation,
        status: 'revoked',
        statusReason: 'app_uninstalled',
      },
    })
    const { unmount } = render(<SlackIntegrationCard orgSlug="acme" />)
    expect(screen.getByText('Reconnect needed')).toBeInTheDocument()
    expect(screen.getByText(/app_uninstalled/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reconnect/ })).toBeInTheDocument()
    unmount()

    mocks.overview.mockReturnValue({
      configured: true,
      entitled: true,
      installation: { ...connectedInstallation, missingScopes: ['links:write'] },
    })
    render(<SlackIntegrationCard orgSlug="acme" />)
    expect(screen.getByText(/needs more Slack permissions \(links:write\)/)).toBeInTheDocument()
  })

  it('removes Slack after confirmation', async () => {
    mocks.overview.mockReturnValue({
      configured: true,
      entitled: true,
      installation: connectedInstallation,
    })
    mocks.disconnect.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<SlackIntegrationCard orgSlug="acme" />)

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    const dialogButtons = await screen.findAllByRole('button', { name: 'Remove' })
    await user.click(dialogButtons[dialogButtons.length - 1] as HTMLElement)
    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalled())
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Slack removed')
  })
})
