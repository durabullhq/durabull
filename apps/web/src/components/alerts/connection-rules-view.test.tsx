import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionRulesView } from '@/components/alerts/connection-rules-view'

const {
  navigateMock,
  toastSuccessMock,
  useConnectionAlertRulesMock,
  useUpdateAlertRuleMock,
  useDeleteAlertRuleMock,
  updateRuleMutateAsyncMock,
  deleteRuleMutateAsyncMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  useConnectionAlertRulesMock: vi.fn(),
  useUpdateAlertRuleMock: vi.fn(),
  useDeleteAlertRuleMock: vi.fn(),
  updateRuleMutateAsyncMock: vi.fn(),
  deleteRuleMutateAsyncMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    activeProps: _activeProps,
    activeOptions: _activeOptions,
    params: _params,
    to,
    ...props
  }: {
    children?: ReactNode
    to?: string
  } & Record<string, unknown>) => (
    <a href={String(to ?? '#')} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => navigateMock,
}))

vi.mock('@/components/app-top-bar', () => ({
  useAppTopBar: vi.fn(),
}))

vi.mock('@/components/connection-provider', () => ({
  useConnection: () => ({
    currentConnection: {
      id: 'conn-1',
      name: 'Primary Redis',
    },
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
  },
}))

vi.mock('@/hooks/use-alerts', () => ({
  useConnectionAlertRules: useConnectionAlertRulesMock,
  useUpdateAlertRule: useUpdateAlertRuleMock,
  useDeleteAlertRule: useDeleteAlertRuleMock,
}))

const baseRulesQuery = {
  isLoading: false,
  data: {
    rules: [
      {
        id: 'rule-1',
        organizationId: 'org-1',
        connectionId: 'conn-1',
        queueName: null,
        queueFilterMode: 'include',
        filterQueueNames: ['email-send'],
        name: 'Delivery failures',
        type: 'failure_threshold' as const,
        config: { count: 5, windowMinutes: 5 },
        enabled: true,
        notificationChannels: [{ type: 'email' as const, target: 'ops@example.com' }],
        cooldownMinutes: 30,
      },
    ],
  },
}

describe('ConnectionRulesView', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    toastSuccessMock.mockReset()
    updateRuleMutateAsyncMock.mockReset().mockResolvedValue(undefined)
    deleteRuleMutateAsyncMock.mockReset().mockResolvedValue(undefined)

    useConnectionAlertRulesMock.mockReturnValue(baseRulesQuery)
    useUpdateAlertRuleMock.mockReturnValue({
      mutateAsync: updateRuleMutateAsyncMock,
    })
    useDeleteAlertRuleMock.mockReturnValue({
      mutateAsync: deleteRuleMutateAsyncMock,
    })

    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    )
  })

  it('toggles and deletes rules', async () => {
    const user = userEvent.setup()

    render(<ConnectionRulesView orgSlug="acme" connectionId="conn-1" />)

    await user.click(screen.getByRole('button', { name: 'Mute' }))

    await waitFor(() =>
      expect(updateRuleMutateAsyncMock).toHaveBeenCalledWith({
        ruleId: 'rule-1',
        input: { enabled: false },
      })
    )

    expect(toastSuccessMock).toHaveBeenCalledWith('Alert rule muted', {
      description: 'Delivery failures is now muted for Primary Redis.',
    })

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteRuleMutateAsyncMock).toHaveBeenCalledWith('rule-1'))
    expect(toastSuccessMock).toHaveBeenCalledWith('Alert rule deleted', {
      description: 'Delivery failures was removed from this connection.',
    })
  })

  it('opens the rule editor under the rules sub-route on row click', async () => {
    const user = userEvent.setup()

    render(<ConnectionRulesView orgSlug="acme" connectionId="conn-1" />)

    await user.click(screen.getByText('Delivery failures'))

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/$orgSlug/c/$connectionId/alerts/rules/$ruleId',
      params: { orgSlug: 'acme', connectionId: 'conn-1', ruleId: 'rule-1' },
    })
  })

  it('duplicates a rule into the create builder via the from search param', async () => {
    const user = userEvent.setup()

    render(<ConnectionRulesView orgSlug="acme" connectionId="conn-1" />)

    await user.click(screen.getByRole('button', { name: 'Duplicate' }))

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/$orgSlug/c/$connectionId/alerts/new',
      params: { orgSlug: 'acme', connectionId: 'conn-1' },
      search: { from: 'rule-1' },
    })
  })

  it('shows the empty state when no rules exist', () => {
    useConnectionAlertRulesMock.mockReturnValue({
      isLoading: false,
      data: { rules: [] },
    })

    render(<ConnectionRulesView orgSlug="acme" connectionId="conn-1" />)

    expect(screen.getByText('No alert rules yet')).toBeInTheDocument()
  })
})
