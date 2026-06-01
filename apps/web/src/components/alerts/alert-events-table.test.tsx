import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
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
    deliveries: [],
    ...overrides,
  }
}

describe('AlertEventsTable', () => {
  it('renders the empty state when no events are present', () => {
    render(
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

  it('calls onResolve for firing events and shows the resolving state', async () => {
    const user = userEvent.setup()
    const onResolve = vi.fn()

    const { rerender } = render(
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

    await user.click(screen.getByRole('button', { name: /resolve/i }))

    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-1' }))
  })

  it('exposes a details action for non-firing events', () => {
    render(
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
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument()
  })
})
