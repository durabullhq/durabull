import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AlertEventsTable } from '@/components/alerts/alert-events-table'
import type { AlertEventRecord } from '@/hooks/use-alerts'

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
}))

function createEvent(overrides: Partial<AlertEventRecord> = {}): AlertEventRecord {
  return {
    id: 'event-1',
    alertRuleId: 'rule-1',
    organizationId: 'org-1',
    connectionId: 'conn-1',
    queueName: 'email-send',
    type: 'failure_threshold',
    status: 'firing',
    summary: '12 jobs failed in email-send',
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

async function openRowActionsMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Incident actions' }))
  return screen.findByRole('menu')
}

// The details dialog mounts a react-query mutation hook when opened.
function renderTable(ui: ReactElement) {
  const queryClient = new QueryClient()
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}

describe('AlertEventsTable', () => {
  it('renders the empty state when no events are present', () => {
    renderTable(
      <AlertEventsTable
        orgSlug="acme"
        events={[]}
        emptyTitle="No incidents"
        emptyCopy="Everything is quiet."
      />
    )

    expect(screen.getByText('No incidents')).toBeInTheDocument()
    expect(screen.getByText('Everything is quiet.')).toBeInTheDocument()
  })

  it('calls onResolve from the row menu and shows the resolving state', async () => {
    const user = userEvent.setup()
    const onResolve = vi.fn()

    const { rerender } = renderTable(
      <AlertEventsTable
        orgSlug="acme"
        events={[createEvent()]}
        emptyTitle="No incidents"
        emptyCopy="Everything is quiet."
        onResolve={onResolve}
        resolvingEventId="event-1"
      />
    )

    expect(screen.getByRole('button', { name: /resolving/i })).toBeDisabled()
    expect(screen.getByText('Not sent')).toBeInTheDocument()

    rerender(
      <AlertEventsTable
        orgSlug="acme"
        events={[createEvent()]}
        emptyTitle="No incidents"
        emptyCopy="Everything is quiet."
        onResolve={onResolve}
        resolvingEventId={null}
      />
    )

    await openRowActionsMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /resolve/i }))

    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-1' }))
    // Selecting a menu action must not also trigger the row's details dialog.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('acknowledges firing events and shows rule names when provided', async () => {
    const user = userEvent.setup()
    const onAcknowledge = vi.fn()

    renderTable(
      <AlertEventsTable
        orgSlug="acme"
        events={[createEvent()]}
        emptyTitle="No incidents"
        emptyCopy="Everything is quiet."
        getRuleName={() => 'Delivery failures'}
        onAcknowledge={onAcknowledge}
        acknowledgingEventId={null}
      />
    )

    expect(screen.getByText('Delivery failures')).toBeInTheDocument()

    await openRowActionsMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /acknowledge/i }))

    expect(onAcknowledge).toHaveBeenCalledWith('event-1')
  })

  it('renders acknowledged rows with a warning badge, ack provenance, and no acknowledge action', async () => {
    const user = userEvent.setup()

    renderTable(
      <AlertEventsTable
        orgSlug="acme"
        events={[
          createEvent({
            acknowledgedAt: '2026-03-24T10:02:00.000Z',
            acknowledgedBy: 'user-1',
            acknowledgedByName: 'Sam Operator',
          }),
        ]}
        emptyTitle="No incidents"
        emptyCopy="Everything is quiet."
        onAcknowledge={vi.fn()}
        onResolve={vi.fn()}
      />
    )

    expect(screen.getByText('Acknowledged')).toBeInTheDocument()
    expect(screen.getByText(/Ack'd by Sam Operator/)).toBeInTheDocument()

    await openRowActionsMenu(user)
    expect(screen.queryByRole('menuitem', { name: /acknowledge/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /resolve/i })).toBeInTheDocument()
  })

  it('renders suppressed rows subdued with a coalesced count and no actions', async () => {
    const user = userEvent.setup()

    renderTable(
      <AlertEventsTable
        orgSlug="acme"
        events={[
          createEvent({
            id: 'event-3',
            status: 'suppressed',
            context: { suppressedCount: 4 },
          }),
        ]}
        emptyTitle="No incidents"
        emptyCopy="Everything is quiet."
        onAcknowledge={vi.fn()}
        onResolve={vi.fn()}
      />
    )

    expect(screen.getByText('suppressed')).toBeInTheDocument()
    expect(screen.getByText('×4')).toBeInTheDocument()

    await openRowActionsMenu(user)
    expect(screen.queryByRole('menuitem', { name: /acknowledge/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /resolve/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'View details' })).toBeInTheDocument()
  })

  it('opens the details dialog from the row menu and shows the resolved subline', async () => {
    const user = userEvent.setup()

    renderTable(
      <AlertEventsTable
        orgSlug="acme"
        events={[
          createEvent({
            id: 'event-2',
            status: 'resolved',
            resolvedAt: '2026-03-24T10:05:00.000Z',
            notificationSentAt: '2026-03-24T10:01:00.000Z',
          }),
        ]}
        emptyTitle="No incidents"
        emptyCopy="Everything is quiet."
      />
    )

    expect(screen.getByText('Delivered')).toBeInTheDocument()
    expect(screen.getByText(/^Resolved /)).toBeInTheDocument()

    await openRowActionsMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'View details' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
