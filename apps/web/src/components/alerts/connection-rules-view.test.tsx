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
  useSnoozeAlertRuleMock,
  useUnsnoozeAlertRuleMock,
  updateRuleMutateAsyncMock,
  deleteRuleMutateAsyncMock,
  snoozeRuleMutateAsyncMock,
  unsnoozeRuleMutateAsyncMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  useConnectionAlertRulesMock: vi.fn(),
  useUpdateAlertRuleMock: vi.fn(),
  useDeleteAlertRuleMock: vi.fn(),
  useSnoozeAlertRuleMock: vi.fn(),
  useUnsnoozeAlertRuleMock: vi.fn(),
  updateRuleMutateAsyncMock: vi.fn(),
  deleteRuleMutateAsyncMock: vi.fn(),
  snoozeRuleMutateAsyncMock: vi.fn(),
  unsnoozeRuleMutateAsyncMock: vi.fn(),
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
    error: vi.fn(),
  },
}))

vi.mock('@/hooks/use-alerts', () => ({
  useConnectionAlertRules: useConnectionAlertRulesMock,
  useUpdateAlertRule: useUpdateAlertRuleMock,
  useDeleteAlertRule: useDeleteAlertRuleMock,
  useSnoozeAlertRule: useSnoozeAlertRuleMock,
  useUnsnoozeAlertRule: useUnsnoozeAlertRuleMock,
}))

// SnoozeMenu renders through the Radix dropdown; stub it inline so the menu
// items are directly clickable in jsdom (same approach as nav-user.test.tsx).
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))

function buildRule(overrides: Record<string, unknown> = {}) {
  return {
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
    mutedUntil: null,
    state: 'active' as const,
    ...overrides,
  }
}

const baseRulesQuery = {
  isLoading: false,
  data: {
    rules: [buildRule()],
  },
}

describe('ConnectionRulesView', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    toastSuccessMock.mockReset()
    updateRuleMutateAsyncMock.mockReset().mockResolvedValue(undefined)
    deleteRuleMutateAsyncMock.mockReset().mockResolvedValue(undefined)
    snoozeRuleMutateAsyncMock.mockReset().mockResolvedValue({
      rule: buildRule({ state: 'snoozed', mutedUntil: '2026-07-03T10:00:00.000Z' }),
    })
    unsnoozeRuleMutateAsyncMock.mockReset().mockResolvedValue({ rule: buildRule() })

    useConnectionAlertRulesMock.mockReturnValue(baseRulesQuery)
    useUpdateAlertRuleMock.mockReturnValue({
      mutateAsync: updateRuleMutateAsyncMock,
    })
    useDeleteAlertRuleMock.mockReturnValue({
      mutateAsync: deleteRuleMutateAsyncMock,
    })
    useSnoozeAlertRuleMock.mockReturnValue({
      mutateAsync: snoozeRuleMutateAsyncMock,
      isPending: false,
    })
    useUnsnoozeAlertRuleMock.mockReturnValue({
      mutateAsync: unsnoozeRuleMutateAsyncMock,
      isPending: false,
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

  it('renders the rule state badge for enabled, snoozed, and muted rules', () => {
    useConnectionAlertRulesMock.mockReturnValue({
      isLoading: false,
      data: {
        rules: [
          buildRule(),
          buildRule({
            id: 'rule-2',
            name: 'Snoozed rule',
            state: 'snoozed',
            mutedUntil: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
          }),
          buildRule({ id: 'rule-3', name: 'Muted rule', enabled: false, state: 'disabled' }),
        ],
      },
    })

    render(<ConnectionRulesView orgSlug="acme" connectionId="conn-1" />)

    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getAllByText(/^Snoozed/).length).toBeGreaterThan(0)
    expect(screen.getByText('Muted')).toBeInTheDocument()
  })

  it('snoozes a rule from the row snooze menu', async () => {
    const user = userEvent.setup()

    render(<ConnectionRulesView orgSlug="acme" connectionId="conn-1" />)

    await user.click(screen.getByText('Snooze 1 hour'))

    await waitFor(() =>
      expect(snoozeRuleMutateAsyncMock).toHaveBeenCalledWith({ ruleId: 'rule-1', minutes: 60 })
    )
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining('Rule snoozed until'),
      expect.anything()
    )
  })

  it('offers Unsnooze from the snooze menu when the rule is snoozed', async () => {
    const user = userEvent.setup()
    useConnectionAlertRulesMock.mockReturnValue({
      isLoading: false,
      data: {
        rules: [
          buildRule({
            state: 'snoozed',
            mutedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          }),
        ],
      },
    })

    render(<ConnectionRulesView orgSlug="acme" connectionId="conn-1" />)

    await user.click(screen.getByText('Unsnooze'))

    await waitFor(() => expect(unsnoozeRuleMutateAsyncMock).toHaveBeenCalledWith('rule-1'))
  })

  it('renders destination names from the rules-list sidecar in the routing column', () => {
    useConnectionAlertRulesMock.mockReturnValue({
      isLoading: false,
      data: {
        rules: [
          buildRule({
            notificationChannels: [
              { type: 'email', target: 'ops@example.com' },
              { type: 'destination', destinationId: 'dest-1' },
              { type: 'webhook', destinationId: 'dest-2' },
            ],
          }),
        ],
        destinations: [
          { id: 'dest-1', name: 'On-call pipeline', type: 'webhook', enabled: true },
          { id: 'dest-2', name: 'Legacy hook', type: 'webhook', enabled: true },
        ],
      },
    })

    render(<ConnectionRulesView orgSlug="acme" connectionId="conn-1" />)

    expect(screen.getByText('ops@example.com, On-call pipeline, Legacy hook')).toBeInTheDocument()
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
