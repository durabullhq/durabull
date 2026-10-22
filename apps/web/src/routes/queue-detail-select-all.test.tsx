import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  routeState,
  jobsState,
  navigateMock,
  removeMutateMock,
  retryMutateMock,
  invokeMutateMock,
  matchingJobCountMock,
} = vi.hoisted(() => ({
  routeState: {
    params: {
      orgSlug: 'acme',
      connectionId: 'conn-1',
      queueName: 'emails',
    },
    search: {
      section: 'jobs' as const,
      tab: 'jobs' as const,
      status: '',
      jobId: '',
      name: '',
      data: '',
      hideScheduled: 0 as 0 | 1,
      page: 1,
    },
  },
  jobsState: {
    jobCount: 25,
    hasNextPage: false,
  },
  navigateMock: vi.fn(),
  removeMutateMock: vi.fn(),
  retryMutateMock: vi.fn(),
  invokeMutateMock: vi.fn(),
  matchingJobCountMock: vi.fn(),
}))

function createJob(index: number) {
  return {
    id: `job-${index}`,
    name: 'send-email',
    status: 'failed',
    data: {},
    progress: 0,
    attemptsMade: 1,
    maxAttempts: 1,
    failedReason: 'boom',
    processedOn: undefined,
    finishedOn: undefined,
    timestamp: 1_700_000_000_000,
    delay: 0,
    priority: 0,
  }
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  Outlet: () => null,
  createFileRoute: () => (options: unknown) => ({
    useParams: () => routeState.params,
    useSearch: () => routeState.search,
    options,
  }),
  useMatchRoute: () => () => false,
  useNavigate: () => navigateMock,
}))

vi.mock('@durabull/analytics/browser', () => ({
  trackEvent: vi.fn(),
}))

vi.mock('@durabull/analytics/events', () => ({
  AnalyticsEvents: {
    QUEUE_VIEWED: 'QUEUE_VIEWED',
  },
}))

vi.mock('@/components/app-top-bar', () => ({
  useAppTopBar: () => {},
}))

vi.mock('@/components/add-job-dialog', () => ({
  AddJobDialog: () => null,
}))

vi.mock('@/components/delete-queue-dialog', () => ({
  DeleteQueueDialog: () => null,
}))

vi.mock('@/components/purge-queue-dialog', () => ({
  PurgeQueueDialog: () => null,
}))

vi.mock('@/components/retry-queue-dialog', () => ({
  RetryQueueDialog: () => null,
}))

vi.mock('@/components/status-badge', () => ({
  StatusIndicator: ({ status }: { status: string }) => <span>{status}</span>,
}))

vi.mock('@/hooks/use-queues', () => ({
  useInvokeJobs: () => ({ mutate: invokeMutateMock, isPending: false }),
  useJobs: () => ({
    data: {
      pages: [
        {
          jobs: Array.from({ length: jobsState.jobCount }, (_, index) => createJob(index)),
          total: jobsState.jobCount,
          page: 1,
          cursor: '0',
          nextCursor: null,
          hasMore: jobsState.hasNextPage,
          pageSize: 20,
          totalPages: 1,
        },
      ],
    },
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: jobsState.hasNextPage,
    fetchNextPage: vi.fn(),
  }),
  useMatchingJobCount: (...args: unknown[]) => matchingJobCountMock(...args),
  usePauseQueue: () => ({ mutate: vi.fn(), isPending: false }),
  useQueue: () => ({
    data: {
      name: 'emails',
      isPaused: false,
      scheduledJobsCount: 0,
      workers: [],
      jobCounts: {
        waiting: 0,
        active: 0,
        delayed: 0,
        completed: 0,
        failed: 1234,
        paused: 0,
        prioritized: 0,
      },
    },
    isLoading: false,
    error: null,
  }),
  useQueueMetrics: () => ({
    data: {
      counts: { waitingChildren: 0 },
      series: {
        points: [],
        totals: { failedLifetime: 0, failedInWindow: 0 },
        completed: { count: 0 },
        failed: { count: 0 },
      },
      range: {
        returnedPoints: 0,
        oldestPointTimestamp: null,
        newestPointTimestamp: null,
        latestPointAgeMs: null,
        requestedWindowCoverage: 0,
        retainedPoints: 0,
      },
      queue: { workersCount: 0, waitingToProcess: 0 },
      prometheus: { metrics: '' },
      priorities: { counts: {} },
    },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useQueueScheduledJobs: () => ({ data: { scheduledJobs: [], total: 0 } }),
  useRemoveJobs: () => ({ mutate: removeMutateMock, isPending: false }),
  useResumeQueue: () => ({ mutate: vi.fn(), isPending: false }),
  useRetryJobs: () => ({ mutate: retryMutateMock, isPending: false }),
}))

import { Route } from '@/routes/$orgSlug.c.$connectionId.queues.$queueName'

const Component = Route.options.component as () => React.ReactNode

describe('queue detail select all matching jobs', () => {
  beforeEach(() => {
    routeState.search = {
      section: 'jobs',
      tab: 'jobs',
      status: 'failed',
      jobId: '',
      name: 'send',
      data: '',
      hideScheduled: 0,
      page: 1,
    }
    jobsState.jobCount = 25
    jobsState.hasNextPage = false
    navigateMock.mockReset()
    removeMutateMock.mockReset()
    retryMutateMock.mockReset()
    invokeMutateMock.mockReset()
    matchingJobCountMock.mockReset()
    matchingJobCountMock.mockReturnValue({ data: { total: 25 } })
  })

  it('selects every job that matches the filter and removes them with the filter', async () => {
    const user = userEvent.setup()
    render(<Component />)

    await user.click(screen.getByRole('checkbox', { name: 'Select all loaded jobs' }))

    expect(screen.getByText('20 selected')).toBeInTheDocument()
    expect(screen.getByText('All 20 loaded jobs are selected.')).toBeInTheDocument()
    expect(matchingJobCountMock).toHaveBeenLastCalledWith(
      'emails',
      { status: 'failed', name: 'send' },
      { enabled: true }
    )

    await user.click(
      screen.getByRole('button', { name: 'Select all 25 jobs that match this filter' })
    )

    expect(screen.getByText('All 25 jobs that match this filter are selected.')).toBeInTheDocument()
    expect(screen.getByText('25 selected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Remove Job' }))

    expect(removeMutateMock).toHaveBeenCalledWith(
      {
        queueName: 'emails',
        filter: { status: 'failed', name: 'send' },
        removeScheduler: false,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    )
    expect(removeMutateMock.mock.calls[0]?.[0]).not.toHaveProperty('jobIds')
  })

  it('sends the filter for retry and invoke in all-matching mode', async () => {
    const user = userEvent.setup()
    render(<Component />)

    await user.click(screen.getByRole('checkbox', { name: 'Select all loaded jobs' }))
    await user.click(
      screen.getByRole('button', { name: 'Select all 25 jobs that match this filter' })
    )
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await user.click(screen.getByRole('button', { name: 'Invoke' }))

    const expectedPayload = { queueName: 'emails', filter: { status: 'failed', name: 'send' } }
    expect(retryMutateMock).toHaveBeenCalledWith(expectedPayload, expect.anything())
    expect(invokeMutateMock).toHaveBeenCalledWith(expectedPayload, expect.anything())
  })

  it('keeps sending loaded job IDs until the user selects all matching jobs', async () => {
    const user = userEvent.setup()
    render(<Component />)

    await user.click(screen.getByRole('checkbox', { name: 'Select all loaded jobs' }))
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    const payload = retryMutateMock.mock.calls[0]?.[0]
    expect(payload.jobIds).toHaveLength(20)
    expect(payload).not.toHaveProperty('filter')
  })

  it('clears the selection with the clear control', async () => {
    const user = userEvent.setup()
    render(<Component />)

    await user.click(screen.getByRole('checkbox', { name: 'Select all loaded jobs' }))
    await user.click(
      screen.getByRole('button', { name: 'Select all 25 jobs that match this filter' })
    )
    await user.click(screen.getByRole('button', { name: 'Clear selection' }))

    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select all loaded jobs' })).not.toBeChecked()
  })

  it('resets the selection when the filter changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Component />)

    await user.click(screen.getByRole('checkbox', { name: 'Select all loaded jobs' }))
    await user.click(
      screen.getByRole('button', { name: 'Select all 25 jobs that match this filter' })
    )
    expect(screen.getByText('25 selected')).toBeInTheDocument()

    routeState.search = { ...routeState.search, name: 'resize' }
    rerender(<Component />)

    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it('does not offer the control when every matching job is loaded', async () => {
    const user = userEvent.setup()
    jobsState.jobCount = 5
    render(<Component />)

    await user.click(screen.getByRole('checkbox', { name: 'Select all loaded jobs' }))

    expect(screen.getByText('5 selected')).toBeInTheDocument()
    expect(screen.queryByText(/loaded jobs are selected/)).not.toBeInTheDocument()
  })

  it('names the whole queue when no filter is set', async () => {
    const user = userEvent.setup()
    routeState.search = { ...routeState.search, status: '', name: '' }
    jobsState.jobCount = 20
    jobsState.hasNextPage = true
    matchingJobCountMock.mockReturnValue({ data: { total: 1234 } })
    render(<Component />)

    await user.click(screen.getByRole('checkbox', { name: 'Select all loaded jobs' }))
    await user.click(screen.getByRole('button', { name: 'Select all 1,234 jobs in this queue' }))

    expect(screen.getByText('All 1,234 jobs in this queue are selected.')).toBeInTheDocument()
  })
})
