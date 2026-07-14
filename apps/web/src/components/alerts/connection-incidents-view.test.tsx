import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionIncidentsView } from '@/components/alerts/connection-incidents-view'

const {
  toastSuccessMock,
  useAlertSummaryMock,
  useConnectionAlertEventsMock,
  useConnectionAlertRulesMock,
  useResolveAlertEventMock,
  useAcknowledgeAlertEventMock,
  resolveEventMutateAsyncMock,
  acknowledgeEventMutateAsyncMock,
} = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  useAlertSummaryMock: vi.fn(),
  useConnectionAlertEventsMock: vi.fn(),
  useConnectionAlertRulesMock: vi.fn(),
  useResolveAlertEventMock: vi.fn(),
  useAcknowledgeAlertEventMock: vi.fn(),
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

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
  },
}))

vi.mock('@/hooks/use-alerts', () => ({
  useAlertSummary: useAlertSummaryMock,
  useConnectionAlertEvents: useConnectionAlertEventsMock,
  useConnectionAlertRules: useConnectionAlertRulesMock,
  useResolveAlertEvent: useResolveAlertEventMock,
  useAcknowledgeAlertEvent: useAcknowledgeAlertEventMock,
  // Imported by BulkResolveDialog, rendered (closed) by the incidents view.
  useBulkResolveAlertEvents: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

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
        acknowledgedAt: null,
        acknowledgedBy: null,
        acknowledgedByName: null,
        deliveries: [],
      },
    ],
  },
}

describe('ConnectionIncidentsView', () => {
  beforeEach(() => {
    toastSuccessMock.mockReset()
    resolveEventMutateAsyncMock.mockReset().mockResolvedValue(undefined)
    acknowledgeEventMutateAsyncMock.mockReset().mockResolvedValue(undefined)

    useAlertSummaryMock.mockReturnValue({
      data: {
        connections: [{ connectionId: 'conn-1', firing: 2, acknowledged: 1, open: 3, count: 3 }],
      },
    })
    useConnectionAlertEventsMock.mockImplementation(() => baseEventsQuery)
    useConnectionAlertRulesMock.mockReturnValue({
      data: {
        rules: [{ id: 'rule-1', name: 'Delivery failures' }],
      },
    })
    useResolveAlertEventMock.mockReturnValue({
      mutateAsync: resolveEventMutateAsyncMock,
    })
    useAcknowledgeAlertEventMock.mockReturnValue({
      mutateAsync: acknowledgeEventMutateAsyncMock,
    })
  })

  it('renders metric cards from the connection summary', () => {
    render(
      <ConnectionIncidentsView
        orgSlug="acme"
        connectionId="conn-1"
        status="open"
        onStatusChange={vi.fn()}
      />
    )

    // "Open" and "Acknowledged" also appear as filter options, so scope to card labels.
    const openLabels = screen.getAllByText('Open')
    expect(openLabels.some((element) => element.tagName !== 'OPTION')).toBe(true)
    const acknowledgedLabels = screen.getAllByText('Acknowledged')
    expect(acknowledgedLabels.some((element) => element.tagName !== 'OPTION')).toBe(true)
    expect(screen.getByText('Resolved · 24h')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('maps the open filter to firing events and resolves incidents', async () => {
    const user = userEvent.setup()

    render(
      <ConnectionIncidentsView
        orgSlug="acme"
        connectionId="conn-1"
        status="open"
        onStatusChange={vi.fn()}
      />
    )

    expect(useConnectionAlertEventsMock).toHaveBeenCalledWith('conn-1', {
      status: 'firing',
      queueName: undefined,
      limit: 100,
    })

    await user.click(screen.getByRole('button', { name: 'Incident actions' }))
    await user.click(await screen.findByRole('menuitem', { name: /^resolve$/i }))

    await waitFor(() =>
      expect(resolveEventMutateAsyncMock).toHaveBeenCalledWith({
        connectionId: 'conn-1',
        eventId: 'event-1',
      })
    )

    expect(toastSuccessMock).toHaveBeenCalledWith('Incident resolved', {
      description: 'The alert event was marked resolved for this connection.',
    })
  })

  it('maps acknowledged and unacknowledged filters onto the events query', () => {
    const { rerender } = render(
      <ConnectionIncidentsView
        orgSlug="acme"
        connectionId="conn-1"
        status="acknowledged"
        onStatusChange={vi.fn()}
      />
    )

    expect(useConnectionAlertEventsMock).toHaveBeenCalledWith('conn-1', {
      status: 'firing',
      acknowledged: true,
      queueName: undefined,
      limit: 100,
    })

    rerender(
      <ConnectionIncidentsView
        orgSlug="acme"
        connectionId="conn-1"
        status="firing"
        onStatusChange={vi.fn()}
      />
    )

    expect(useConnectionAlertEventsMock).toHaveBeenCalledWith('conn-1', {
      status: 'firing',
      acknowledged: false,
      queueName: undefined,
      limit: 100,
    })
  })

  it('acknowledges firing incidents with toast feedback and rule names', async () => {
    const user = userEvent.setup()

    render(
      <ConnectionIncidentsView
        orgSlug="acme"
        connectionId="conn-1"
        status="open"
        onStatusChange={vi.fn()}
      />
    )

    expect(screen.getByText('Delivery failures')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Incident actions' }))
    await user.click(await screen.findByRole('menuitem', { name: /acknowledge/i }))

    await waitFor(() => expect(acknowledgeEventMutateAsyncMock).toHaveBeenCalledWith('event-1'))

    expect(toastSuccessMock).toHaveBeenCalledWith('Incident acknowledged', {
      description: 'The alert event is now marked as being handled.',
    })
  })

  it('shows the calm success empty state when no incidents are open', () => {
    useConnectionAlertEventsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: { events: [] },
    })

    render(
      <ConnectionIncidentsView
        orgSlug="acme"
        connectionId="conn-1"
        status="open"
        onStatusChange={vi.fn()}
      />
    )

    expect(screen.getByText('No open incidents')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View rules' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create rule' })).toBeInTheDocument()
  })

  it('shows an error card with a retry action when events fail to load', async () => {
    const user = userEvent.setup()
    const refetchMock = vi.fn()
    useConnectionAlertEventsMock.mockReturnValue({
      isLoading: false,
      isError: true,
      refetch: refetchMock,
      data: undefined,
    })

    render(
      <ConnectionIncidentsView
        orgSlug="acme"
        connectionId="conn-1"
        status="open"
        onStatusChange={vi.fn()}
      />
    )

    expect(screen.getByText('Unable to load alert data')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetchMock).toHaveBeenCalled()
  })

  it('propagates status filter changes through the select', async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn()

    render(
      <ConnectionIncidentsView
        orgSlug="acme"
        connectionId="conn-1"
        status="open"
        onStatusChange={onStatusChange}
      />
    )

    await user.selectOptions(screen.getByRole('combobox'), 'resolved')

    expect(onStatusChange).toHaveBeenCalledWith('resolved')
  })
})
