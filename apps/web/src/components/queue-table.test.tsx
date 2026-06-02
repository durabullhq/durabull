import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueueTable } from '@/components/queue-table'

const { pauseMutateMock, resumeMutateMock, trackEventMock } = vi.hoisted(() => ({
  pauseMutateMock: vi.fn(),
  resumeMutateMock: vi.fn(),
  trackEventMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  useNavigate: () => vi.fn(),
  useParams: () => ({ orgSlug: 'acme' }),
}))

vi.mock('@durabull/analytics/browser', () => ({
  trackEvent: trackEventMock,
}))

vi.mock('@durabull/analytics/events', () => ({
  AnalyticsEvents: {
    QUEUE_EMPTY_TOGGLE: 'QUEUE_EMPTY_TOGGLE',
  },
}))

vi.mock('@/components/connection-provider', () => ({
  useConnection: () => ({ currentConnection: { id: 'conn-1' } }),
}))

vi.mock('@/components/status-badge', () => ({
  StatusIndicator: ({ status }: { status: string }) => <span>{status}</span>,
}))

vi.mock('@/components/queue-name-tag', () => ({
  QueueNameTag: ({ name }: { name: string }) => <span>{name}</span>,
}))

vi.mock('@/hooks/use-queues', () => ({
  usePauseQueue: () => ({ mutate: pauseMutateMock, isPending: false }),
  useResumeQueue: () => ({ mutate: resumeMutateMock, isPending: false }),
}))

function makeQueue(overrides?: Partial<{ name: string; prioritized: number }>) {
  return {
    name: overrides?.name ?? 'emails',
    status: 'active' as const,
    isPaused: false,
    discoveryState: 'confirmed' as const,
    jobCounts: {
      waiting: 12,
      active: 3,
      delayed: 1,
      completed: 100,
      failed: 2,
      paused: 0,
      prioritized: overrides?.prioritized ?? 7,
    },
  }
}

describe('QueueTable prioritized column', () => {
  it('renders a Prioritized header column', () => {
    render(<QueueTable queues={[makeQueue()]} />)
    expect(screen.getByRole('columnheader', { name: 'Prioritized' })).toBeInTheDocument()
  })

  it('renders the prioritized count for a queue', () => {
    render(<QueueTable queues={[makeQueue({ prioritized: 7 })]} />)
    const row = screen.getByTestId('queue-row-emails')
    expect(within(row).getByText('7')).toBeInTheDocument()
  })

  it('treats prioritized jobs as non-empty workload', () => {
    render(
      <QueueTable
        queues={[
          {
            name: 'only-prioritized',
            status: 'active' as const,
            isPaused: false,
            discoveryState: 'confirmed' as const,
            jobCounts: {
              waiting: 0,
              active: 0,
              delayed: 0,
              completed: 0,
              failed: 0,
              paused: 0,
              prioritized: 5,
            },
          },
        ]}
      />
    )

    // A queue whose only jobs are prioritized must not be counted as empty,
    // so the "Hide empty" toggle should not appear.
    expect(screen.queryByRole('button', { name: /hide empty/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('queue-row-only-prioritized')).toBeInTheDocument()
  })
})
