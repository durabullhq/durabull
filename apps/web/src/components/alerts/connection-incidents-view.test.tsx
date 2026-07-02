import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionIncidentsView } from '@/components/alerts/connection-incidents-view'

const {
  toastSuccessMock,
  useAlertSummaryMock,
  useConnectionAlertEventsMock,
  useResolveAlertEventMock,
  resolveEventMutateAsyncMock,
} = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  useAlertSummaryMock: vi.fn(),
  useConnectionAlertEventsMock: vi.fn(),
  useResolveAlertEventMock: vi.fn(),
  resolveEventMutateAsyncMock: vi.fn(),
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
  useResolveAlertEvent: useResolveAlertEventMock,
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
        deliveries: [],
      },
    ],
  },
}

describe('ConnectionIncidentsView', () => {
  beforeEach(() => {
    toastSuccessMock.mockReset()
    resolveEventMutateAsyncMock.mockReset().mockResolvedValue(undefined)

    useAlertSummaryMock.mockReturnValue({
      data: {
        connections: [{ connectionId: 'conn-1', firing: 2, acknowledged: 1, open: 3, count: 3 }],
      },
    })
    useConnectionAlertEventsMock.mockImplementation(() => baseEventsQuery)
    useResolveAlertEventMock.mockReturnValue({
      mutateAsync: resolveEventMutateAsyncMock,
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
