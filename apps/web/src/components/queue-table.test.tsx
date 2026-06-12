import { fireEvent, render, screen, within } from '@testing-library/react'
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
    QUEUE_LIST_SORTED: 'QUEUE_LIST_SORTED',
    QUEUE_LIST_FILTERED: 'QUEUE_LIST_FILTERED',
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

describe('QueueTable sorting', () => {
  it('marks the active sort column with aria-sort', () => {
    render(<QueueTable queues={[makeQueue()]} sortBy="failed" sortOrder="desc" />)

    expect(screen.getByRole('columnheader', { name: /failed/i })).toHaveAttribute(
      'aria-sort',
      'descending'
    )
    expect(screen.getByRole('columnheader', { name: /queue/i })).toHaveAttribute(
      'aria-sort',
      'none'
    )
  })

  it('requests descending order on first click of a numeric column', () => {
    const onSortChange = vi.fn()
    render(
      <QueueTable
        queues={[makeQueue()]}
        sortBy="name"
        sortOrder="asc"
        onSortChange={onSortChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Waiting' }))
    expect(onSortChange).toHaveBeenCalledWith('waiting', 'desc')
  })

  it('toggles the order when clicking the active sort column', () => {
    const onSortChange = vi.fn()
    render(
      <QueueTable
        queues={[makeQueue()]}
        sortBy="name"
        sortOrder="asc"
        onSortChange={onSortChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
    expect(onSortChange).toHaveBeenCalledWith('name', 'desc')
  })
})

describe('QueueTable filtering', () => {
  it('debounces search input changes before notifying', () => {
    vi.useFakeTimers()
    try {
      const onSearchChange = vi.fn()
      render(<QueueTable queues={[makeQueue()]} onSearchChange={onSearchChange} />)

      fireEvent.change(screen.getByRole('searchbox', { name: /filter queues by name/i }), {
        target: { value: 'email' },
      })
      expect(onSearchChange).not.toHaveBeenCalled()

      vi.advanceTimersByTime(400)
      expect(onSearchChange).toHaveBeenCalledTimes(1)
      expect(onSearchChange).toHaveBeenCalledWith('email')
    } finally {
      vi.useRealTimers()
    }
  })

  it('notifies when the status filter changes', () => {
    const onStatusFilterChange = vi.fn()
    render(<QueueTable queues={[makeQueue()]} onStatusFilterChange={onStatusFilterChange} />)

    fireEvent.change(screen.getByRole('combobox', { name: /filter queues by status/i }), {
      target: { value: 'paused' },
    })
    expect(onStatusFilterChange).toHaveBeenCalledWith('paused')
  })

  it('shows a no-results message when filters match nothing', () => {
    render(<QueueTable queues={[]} search="nope" />)
    expect(screen.getByText('No queues match the current filters.')).toBeInTheDocument()
  })
})

describe('QueueTable default view', () => {
  it('shows the save-as-default action when the current view is not saved', () => {
    const onSaveDefaultView = vi.fn()
    render(<QueueTable queues={[makeQueue()]} onSaveDefaultView={onSaveDefaultView} />)

    fireEvent.click(screen.getByRole('button', { name: /save as default/i }))
    expect(onSaveDefaultView).toHaveBeenCalledTimes(1)
  })

  it('hides the save-as-default action when the current view is already saved', () => {
    render(<QueueTable queues={[makeQueue()]} />)
    expect(screen.queryByRole('button', { name: /save as default/i })).not.toBeInTheDocument()
  })
})
