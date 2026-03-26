import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionAlertsWorkspace } from '@/components/alerts/connection-alerts-workspace'

const {
  navigateMock,
  toastSuccessMock,
  useAlertSummaryMock,
  useConnectionAlertRulesMock,
  useConnectionAlertEventsMock,
  useUpdateAlertRuleMock,
  useDeleteAlertRuleMock,
  useResolveAlertEventMock,
  updateRuleMutateAsyncMock,
  deleteRuleMutateAsyncMock,
  resolveEventMutateAsyncMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  useAlertSummaryMock: vi.fn(),
  useConnectionAlertRulesMock: vi.fn(),
  useConnectionAlertEventsMock: vi.fn(),
  useUpdateAlertRuleMock: vi.fn(),
  useDeleteAlertRuleMock: vi.fn(),
  useResolveAlertEventMock: vi.fn(),
  updateRuleMutateAsyncMock: vi.fn(),
  deleteRuleMutateAsyncMock: vi.fn(),
  resolveEventMutateAsyncMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    href = '#',
    ...props
  }: {
    children?: ReactNode
    href?: string
  } & Record<string, unknown>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => navigateMock,
}))

vi.mock('framer-motion', () => ({
  motion: {
    section: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
      <section {...props}>{children}</section>
    ),
  },
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
  useAlertSummary: useAlertSummaryMock,
  useConnectionAlertRules: useConnectionAlertRulesMock,
  useConnectionAlertEvents: useConnectionAlertEventsMock,
  useUpdateAlertRule: useUpdateAlertRuleMock,
  useDeleteAlertRule: useDeleteAlertRuleMock,
  useResolveAlertEvent: useResolveAlertEventMock,
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

const baseEventsQuery = {
  isLoading: false,
  data: {
    events: [
      {
        id: 'event-1',
        alertRuleId: 'rule-1',
        organizationId: 'org-1',
        connectionId: 'conn-1',
        queueName: 'email-send',
        type: 'failure_threshold' as const,
        status: 'firing' as const,
        summary: '12 jobs failed',
        context: {},
        firedAt: '2026-03-24T10:00:00.000Z',
        resolvedAt: null,
        notificationSentAt: null,
      },
    ],
  },
}

describe('ConnectionAlertsWorkspace', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    toastSuccessMock.mockReset()
    updateRuleMutateAsyncMock.mockReset().mockResolvedValue(undefined)
    deleteRuleMutateAsyncMock.mockReset().mockResolvedValue(undefined)
    resolveEventMutateAsyncMock.mockReset().mockResolvedValue(undefined)

    useAlertSummaryMock.mockReturnValue({
      data: {
        connections: [{ connectionId: 'conn-1', count: 2 }],
      },
    })
    useConnectionAlertRulesMock.mockReturnValue(baseRulesQuery)
    useConnectionAlertEventsMock.mockImplementation(() => baseEventsQuery)
    useUpdateAlertRuleMock.mockReturnValue({
      mutateAsync: updateRuleMutateAsyncMock,
    })
    useDeleteAlertRuleMock.mockReturnValue({
      mutateAsync: deleteRuleMutateAsyncMock,
    })
    useResolveAlertEventMock.mockReturnValue({
      mutateAsync: resolveEventMutateAsyncMock,
    })

    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    )
  })

  it('toggles and deletes rules from the rules tab', async () => {
    const user = userEvent.setup()

    render(
      <ConnectionAlertsWorkspace
        orgSlug="acme"
        connectionId="conn-1"
        tab="rules"
        onTabChange={vi.fn()}
      />
    )

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

  it('switches tabs, refilters history, and resolves incidents', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()

    const { rerender } = render(
      <ConnectionAlertsWorkspace
        orgSlug="acme"
        connectionId="conn-1"
        tab="history"
        onTabChange={onTabChange}
      />
    )

    expect(useConnectionAlertEventsMock).toHaveBeenCalledWith('conn-1', {
      status: undefined,
      limit: 100,
    })

    await user.selectOptions(screen.getByRole('combobox'), 'resolved')

    await waitFor(() =>
      expect(useConnectionAlertEventsMock).toHaveBeenLastCalledWith('conn-1', {
        status: 'resolved',
        limit: 100,
      })
    )

    await user.click(screen.getByRole('button', { name: /resolve/i }))

    await waitFor(() =>
      expect(resolveEventMutateAsyncMock).toHaveBeenCalledWith({
        connectionId: 'conn-1',
        eventId: 'event-1',
      })
    )

    expect(toastSuccessMock).toHaveBeenCalledWith('Incident resolved', {
      description: 'The alert event was marked resolved for this connection.',
    })

    rerender(
      <ConnectionAlertsWorkspace
        orgSlug="acme"
        connectionId="conn-1"
        tab="rules"
        onTabChange={onTabChange}
      />
    )

    await user.click(screen.getByText('Incident History'))

    expect(onTabChange).toHaveBeenCalledWith('history')
  })
})
