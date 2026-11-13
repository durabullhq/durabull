import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SlackIntegrationCard } from '@/components/settings/slack-integration-card'

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  refetch: vi.fn(),
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
  useSlackIntegration: () => ({
    data: mocks.overview(),
    isLoading: false,
    isError: mocks.overview() === undefined,
    error: new Error('Network down'),
    isFetching: false,
    refetch: mocks.refetch,
  }),
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

vi.mock('@/hooks/use-organization', () => ({
  useActiveOrganization: () => ({ data: { id: 'org-1', slug: 'acme' } }),
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

  describe('continuing an install from the direct install URL', () => {
    const withInstallRequest = () =>
      window.history.replaceState(null, '', '/acme/settings/integrations?slack=install')

    it('starts OAuth once for an admin and clears the request from the URL', async () => {
      withInstallRequest()
      mocks.overview.mockReturnValue({
        organizationId: 'org-1',
        configured: true,
        entitled: true,
        canManage: true,
        installation: null,
      })
      mocks.connect.mockResolvedValue({ authorizationUrl: 'https://slack.com/oauth/v2/authorize' })
      const { rerender } = render(<SlackIntegrationCard orgSlug="acme" />)
      rerender(<SlackIntegrationCard orgSlug="acme" />)

      await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith({ returnTo: 'integrations' }))
      expect(mocks.connect).toHaveBeenCalledTimes(1)
      expect(window.location.search).toBe('')
    })

    it('asks members of several organizations to confirm instead of starting OAuth', async () => {
      window.history.replaceState(null, '', '/acme/settings/integrations?slack=install-confirm')
      mocks.overview.mockReturnValue({
        organizationId: 'org-1',
        configured: true,
        entitled: true,
        canManage: true,
        installation: null,
      })
      render(<SlackIntegrationCard orgSlug="acme" />)

      await waitFor(() => expect(window.location.search).toBe(''))
      expect(mocks.connect).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: /Add to Slack/ })).toBeInTheDocument()
    })

    it('never starts OAuth from an overview without a confirmed organization', async () => {
      withInstallRequest()
      // An older API omits organizationId, so nothing ties this overview to acme.
      mocks.overview.mockReturnValue({
        configured: true,
        entitled: true,
        canManage: true,
        installation: null,
      })
      render(<SlackIntegrationCard orgSlug="acme" />)

      await waitFor(() => expect(window.location.search).toBe(''))
      expect(mocks.connect).not.toHaveBeenCalled()
    })

    it('ignores an overview answered for another organization', async () => {
      withInstallRequest()
      mocks.overview.mockReturnValue({
        organizationId: 'org-2',
        configured: true,
        entitled: true,
        canManage: true,
        installation: null,
      })
      render(<SlackIntegrationCard orgSlug="acme" />)

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(mocks.connect).not.toHaveBeenCalled()
      expect(window.location.search).toBe('?slack=install')
    })

    it('waits until the active organization is the one in the URL', async () => {
      withInstallRequest()
      mocks.overview.mockReturnValue({
        organizationId: 'org-1',
        configured: true,
        entitled: true,
        canManage: true,
        installation: null,
      })
      // The session's active organization is still acme; the URL is another org.
      render(<SlackIntegrationCard orgSlug="globex" />)

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(mocks.connect).not.toHaveBeenCalled()
      expect(window.location.search).toBe('?slack=install')
    })

    it('does not start OAuth for members who cannot manage Slack', async () => {
      withInstallRequest()
      mocks.overview.mockReturnValue({
        organizationId: 'org-1',
        configured: true,
        entitled: true,
        canManage: false,
        installation: null,
      })
      render(<SlackIntegrationCard orgSlug="acme" />)

      await waitFor(() => expect(window.location.search).toBe(''))
      expect(mocks.connect).not.toHaveBeenCalled()
    })

    it('does not reinstall a workspace that is already connected', async () => {
      withInstallRequest()
      mocks.overview.mockReturnValue({
        organizationId: 'org-1',
        configured: true,
        entitled: true,
        canManage: true,
        installation: connectedInstallation,
      })
      render(<SlackIntegrationCard orgSlug="acme" />)

      await waitFor(() => expect(window.location.search).toBe(''))
      expect(mocks.connect).not.toHaveBeenCalled()
    })
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

  it('shows members who are not owners or admins what to ask for instead of controls', () => {
    mocks.overview.mockReturnValue({
      configured: true,
      entitled: true,
      canManage: false,
      installation: null,
    })
    const { unmount } = render(<SlackIntegrationCard orgSlug="acme" />)
    expect(screen.queryByRole('button', { name: /Add to Slack/ })).not.toBeInTheDocument()
    expect(
      screen.getByText('Ask an organization owner or admin to connect Slack.')
    ).toBeInTheDocument()
    unmount()

    mocks.overview.mockReturnValue({
      configured: true,
      entitled: true,
      canManage: false,
      installation: connectedInstallation,
    })
    render(<SlackIntegrationCard orgSlug="acme" />)
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Allow actions from Slack/)).toBeDisabled()
    expect(screen.getByLabelText(/Preview Durabull links/)).toBeDisabled()
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

  it('shows a retry instead of a permanent skeleton when the Slack status fails to load', async () => {
    mocks.overview.mockReturnValue(undefined)
    render(<SlackIntegrationCard orgSlug="acme" />)
    expect(screen.getByText('Network down')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.refetch).toHaveBeenCalled()
  })
})
