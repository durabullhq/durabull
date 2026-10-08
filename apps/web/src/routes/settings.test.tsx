import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connectLinearIntegrationMutateAsync: vi.fn(),
  deleteLinearIntegrationMutateAsync: vi.fn(),
  linearIntegration: null as null | {
    id: string
    connected: boolean
    validationStatus: 'valid' | 'invalid' | 'unknown'
    scopes: string
    linearOrganizationName: string | null
    defaultTeamId: string | null
    defaultProjectId: string | null
    defaultLabelIds: string[]
    defaultAssigneeId: string | null
    defaultStateId: string | null
    defaultPriority: number | null
    lastValidatedAt: string | null
  },
  saveLinearIntegrationMutateAsync: vi.fn(),
  testLinearIntegrationMutateAsync: vi.fn(),
}))

vi.mock('@/hooks/use-alerts', () => ({
  useLinearIntegration: () => ({ data: { integration: mocks.linearIntegration } }),
  useConnectLinearIntegration: () => ({
    mutateAsync: mocks.connectLinearIntegrationMutateAsync,
    isPending: false,
  }),
  useSaveLinearIntegration: () => ({
    mutateAsync: mocks.saveLinearIntegrationMutateAsync,
    isPending: false,
  }),
  useDeleteLinearIntegration: () => ({
    mutateAsync: mocks.deleteLinearIntegrationMutateAsync,
    isPending: false,
  }),
  useTestLinearIntegration: () => ({
    mutateAsync: mocks.testLinearIntegrationMutateAsync,
    isPending: false,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params: _params,
    ...props
  }: {
    children?: React.ReactNode
    to?: string
  } & Record<string, unknown>) => (
    <a href={String(to ?? '#')} {...props}>
      {children}
    </a>
  ),
}))

import { IntegrationsSettingsPanel } from '@/components/settings/integrations-settings-panel'

function integration(scopes: string) {
  return {
    id: 'linear-1',
    connected: true,
    validationStatus: 'valid' as const,
    scopes,
    linearOrganizationName: 'Acme',
    defaultTeamId: 'INTAKE',
    defaultProjectId: null,
    defaultLabelIds: [],
    defaultAssigneeId: null,
    defaultStateId: null,
    defaultPriority: null,
    lastValidatedAt: null,
  }
}

describe('IntegrationsSettingsPanel', () => {
  beforeEach(() => {
    mocks.connectLinearIntegrationMutateAsync.mockReset()
    mocks.connectLinearIntegrationMutateAsync.mockResolvedValue({
      authorizationUrl: 'https://linear.app/oauth/authorize?state=test',
    })
    mocks.deleteLinearIntegrationMutateAsync.mockReset()
    mocks.linearIntegration = null
    mocks.saveLinearIntegrationMutateAsync.mockReset()
    mocks.testLinearIntegrationMutateAsync.mockReset()
  })

  it('shows the Linear connect action before OAuth is configured', async () => {
    mocks.connectLinearIntegrationMutateAsync.mockImplementation(() => new Promise(() => {}))
    render(<IntegrationsSettingsPanel orgSlug="acme" />)

    expect(screen.queryByRole('textbox', { name: /default linear team/i })).not.toBeInTheDocument()

    const connectButton = screen.getByRole('button', { name: /connect linear/i })
    expect(connectButton).toBeEnabled()
    fireEvent.click(connectButton)

    await waitFor(() => expect(mocks.connectLinearIntegrationMutateAsync).toHaveBeenCalledTimes(1))
  })

  it('shows and saves Linear team defaults only after Linear is connected', async () => {
    mocks.linearIntegration = {
      id: 'linear-1',
      connected: true,
      validationStatus: 'valid',
      scopes: 'read issues:create',
      linearOrganizationName: 'Acme',
      defaultTeamId: null,
      defaultProjectId: null,
      defaultLabelIds: [],
      defaultAssigneeId: null,
      defaultStateId: null,
      defaultPriority: null,
      lastValidatedAt: null,
    }
    mocks.saveLinearIntegrationMutateAsync.mockResolvedValue({
      integration: mocks.linearIntegration,
    })

    render(<IntegrationsSettingsPanel orgSlug="acme" />)

    const teamInput = screen.getByRole('textbox', { name: /default linear team/i })
    expect(teamInput).toHaveValue('')
    fireEvent.change(teamInput, { target: { value: 'team-456' } })
    fireEvent.click(screen.getByRole('button', { name: /save defaults/i }))

    await waitFor(() =>
      expect(mocks.saveLinearIntegrationMutateAsync).toHaveBeenCalledWith({
        defaultTeamId: 'team-456',
      })
    )
  })

  it.each([
    'read issues:create',
    'read,issues:create',
    '',
  ])('asks to reconnect an existing integration without issue update permissions (%s)', (scopes) => {
    mocks.linearIntegration = integration(scopes)
    render(<IntegrationsSettingsPanel orgSlug="acme" />)

    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.queryByText('Valid', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The current authorization does not allow issue updates.'
    )
    expect(screen.getByRole('button', { name: 'Reconnect Linear' })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: /default linear team/i })).toHaveValue('INTAKE')
  })

  it.each([
    'read write',
    'read,write',
    'read admin',
  ])('keeps an integration with issue update permissions valid (%s)', (scopes) => {
    mocks.linearIntegration = integration(scopes)
    render(<IntegrationsSettingsPanel orgSlug="acme" />)

    expect(screen.getByText('Valid', { exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reconnect Linear' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /default linear team/i })).toHaveValue('INTAKE')
  })

  it('reconnects through the existing OAuth flow while preserving editable defaults', async () => {
    mocks.linearIntegration = integration('read,issues:create')
    mocks.connectLinearIntegrationMutateAsync.mockImplementation(() => new Promise(() => {}))
    render(<IntegrationsSettingsPanel orgSlug="acme" />)

    const teamInput = screen.getByRole('textbox', { name: /default linear team/i })
    fireEvent.change(teamInput, { target: { value: 'NEWTEAM' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Linear' }))

    await waitFor(() => expect(mocks.connectLinearIntegrationMutateAsync).toHaveBeenCalledTimes(1))
    expect(mocks.deleteLinearIntegrationMutateAsync).not.toHaveBeenCalled()
    expect(teamInput).toHaveValue('NEWTEAM')
    fireEvent.click(screen.getByRole('button', { name: /save defaults/i }))
    await waitFor(() =>
      expect(mocks.saveLinearIntegrationMutateAsync).toHaveBeenCalledWith({
        defaultTeamId: 'NEWTEAM',
      })
    )
  })
})
