import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrgAlertsFeed } from '@/components/alerts/org-alerts-feed'

const {
  toastSuccessMock,
  useAlertSummaryMock,
  useGlobalAlertEventsMock,
  useResolveGlobalAlertEventMock,
  useAcknowledgeGlobalAlertEventMock,
  resolveEventMutateAsyncMock,
  acknowledgeEventMutateAsyncMock,
} = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  useAlertSummaryMock: vi.fn(),
  useGlobalAlertEventsMock: vi.fn(),
  useResolveGlobalAlertEventMock: vi.fn(),
  useAcknowledgeGlobalAlertEventMock: vi.fn(),
  resolveEventMutateAsyncMock: vi.fn(),
  acknowledgeEventMutateAsyncMock: vi.fn(),
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
}))

vi.mock('@/components/app-top-bar', () => ({
  useAppTopBar: vi.fn(),
}))

vi.mock('@/components/connection-provider', () => ({
  useConnection: () => ({
    connections: [
      { id: 'conn-1', name: 'Primary Redis' },
      { id: 'conn-2', name: 'Analytics Redis' },
    ],
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: vi.fn(),
  },
}))

vi.mock('@/hooks/use-alerts', () => ({
  useAlertSummary: useAlertSummaryMock,
  useGlobalAlertEvents: useGlobalAlertEventsMock,
  useResolveGlobalAlertEvent: useResolveGlobalAlertEventMock,
  useAcknowledgeGlobalAlertEvent: useAcknowledgeGlobalAlertEventMock,
  getOpenAlertCount: (
    connections: Array<{ connectionId: string; open: number }> | undefined,
    connectionId?: string
  ) => {
    const entries = connections ?? []
    if (connectionId) {
      return entries.find((entry) => entry.connectionId === connectionId)?.open ?? 0
    }
    return entries.reduce((sum, entry) => sum + entry.open, 0)
  },
}))

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
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
    acknowledgedAt: null,
    acknowledgedBy: null,
    acknowledgedByName: null,
    deliveries: [],
    ...overrides,
  }
}

const baseEventsQuery = {
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  data: {
    events: [
      buildEvent(),
      buildEvent({ id: 'event-2', connectionId: 'conn-2', queueName: 'reports' }),
    ],
  },
}

describe('OrgAlertsFeed', () => {
  beforeEach(() => {
    toastSuccessMock.mockReset()
    resolveEventMutateAsyncMock.mockReset().mockResolvedValue(undefined)
    acknowledgeEventMutateAsyncMock.mockReset().mockResolvedValue(undefined)

    useAlertSummaryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: {
        connections: [
          { connectionId: 'conn-1', firing: 2, acknowledged: 1, open: 3, count: 3 },
          { connectionId: 'conn-2', firing: 1, acknowledged: 0, open: 1, count: 1 },
        ],
      },
    })
    useGlobalAlertEventsMock.mockImplementation(() => baseEventsQuery)
    useResolveGlobalAlertEventMock.mockReturnValue({
      mutateAsync: resolveEventMutateAsyncMock,
    })
    useAcknowledgeGlobalAlertEventMock.mockReturnValue({
      mutateAsync: acknowledgeEventMutateAsyncMock,
    })
  })

  it('renders the ranked connection strip with links into each connection', () => {
    render(<OrgAlertsFeed orgSlug="acme" status="open" onFiltersChange={vi.fn()} />)

    const strip = screen.getByTestId('org-alerts-connection-strip')
    const links = Array.from(strip.querySelectorAll('a'))
    expect(links).toHaveLength(2)
    // Ranked by open count: conn-1 (3 open) before conn-2 (1 open).
    expect(links[0]).toHaveTextContent('Primary Redis')
    expect(links[0]).toHaveTextContent('2 firing')
    expect(links[0]).toHaveTextContent("1 ack'd")
    expect(links[0]).toHaveAttribute('href', '/$orgSlug/c/$connectionId/alerts')
    expect(links[1]).toHaveTextContent('Analytics Redis')
    expect(screen.getByText('4 open')).toBeInTheDocument()
  })

  it('maps the open status filter onto the global events query', () => {
    render(<OrgAlertsFeed orgSlug="acme" status="open" onFiltersChange={vi.fn()} />)

    expect(useGlobalAlertEventsMock).toHaveBeenCalledWith({
      status: 'firing',
      limit: 100,
    })
  })

  it('maps acknowledged and firing filters onto the global events query', () => {
    const { rerender } = render(
      <OrgAlertsFeed orgSlug="acme" status="acknowledged" onFiltersChange={vi.fn()} />
    )

    expect(useGlobalAlertEventsMock).toHaveBeenCalledWith({
      status: 'firing',
      acknowledged: true,
      limit: 100,
    })

    rerender(<OrgAlertsFeed orgSlug="acme" status="firing" onFiltersChange={vi.fn()} />)

    expect(useGlobalAlertEventsMock).toHaveBeenCalledWith({
      status: 'firing',
      acknowledged: false,
      limit: 100,
    })
  })

  it('filters events client-side when a connection is selected', () => {
    render(
      <OrgAlertsFeed orgSlug="acme" status="open" connection="conn-2" onFiltersChange={vi.fn()} />
    )

    expect(screen.getByText('reports')).toBeInTheDocument()
    expect(screen.queryByText('email-send')).not.toBeInTheDocument()
  })

  it('acknowledges incidents through the org-scoped mutation', async () => {
    const user = userEvent.setup()

    render(<OrgAlertsFeed orgSlug="acme" status="open" onFiltersChange={vi.fn()} />)

    const acknowledgeButtons = screen.getAllByRole('button', { name: /acknowledge/i })
    await user.click(acknowledgeButtons[0]!)

    await waitFor(() =>
      expect(acknowledgeEventMutateAsyncMock).toHaveBeenCalledWith({
        eventId: 'event-1',
        connectionId: 'conn-1',
      })
    )
    expect(toastSuccessMock).toHaveBeenCalledWith('Incident acknowledged', {
      description: 'The alert event is now marked as being handled.',
    })
  })

  it('resolves incidents through the org-scoped mutation', async () => {
    const user = userEvent.setup()

    render(<OrgAlertsFeed orgSlug="acme" status="open" onFiltersChange={vi.fn()} />)

    const resolveButtons = screen.getAllByRole('button', { name: /resolve/i })
    await user.click(resolveButtons[0]!)

    await waitFor(() =>
      expect(resolveEventMutateAsyncMock).toHaveBeenCalledWith({
        eventId: 'event-1',
        connectionId: 'conn-1',
      })
    )
    expect(toastSuccessMock).toHaveBeenCalledWith('Incident resolved', {
      description: 'The alert event was marked resolved.',
    })
  })

  it('propagates connection and status filter changes', async () => {
    const user = userEvent.setup()
    const onFiltersChange = vi.fn()

    render(<OrgAlertsFeed orgSlug="acme" status="open" onFiltersChange={onFiltersChange} />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter incidents by connection' }),
      'conn-1'
    )
    expect(onFiltersChange).toHaveBeenCalledWith({ status: 'open', connection: 'conn-1' })

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter incidents by status' }),
      'resolved'
    )
    expect(onFiltersChange).toHaveBeenCalledWith({ status: 'resolved', connection: undefined })
  })

  it('shows the calm empty state with configure links when nothing is open', () => {
    useAlertSummaryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: { connections: [] },
    })
    useGlobalAlertEventsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: { events: [] },
    })

    render(<OrgAlertsFeed orgSlug="acme" status="open" onFiltersChange={vi.fn()} />)

    expect(screen.getByText('No open incidents')).toBeInTheDocument()
    expect(screen.getByText(/Configure alerts on Primary Redis/)).toBeInTheDocument()
    expect(screen.getByText(/Configure alerts on Analytics Redis/)).toBeInTheDocument()
  })

  it('shows an error card with a retry action when queries fail', async () => {
    const user = userEvent.setup()
    const refetchEvents = vi.fn()
    useGlobalAlertEventsMock.mockReturnValue({
      isLoading: false,
      isError: true,
      refetch: refetchEvents,
      data: undefined,
    })

    render(<OrgAlertsFeed orgSlug="acme" status="open" onFiltersChange={vi.fn()} />)

    expect(screen.getByText('Unable to load alert data')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetchEvents).toHaveBeenCalled()
  })
})
