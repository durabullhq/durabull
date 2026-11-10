import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { routeState, navigateMock, trackEventMock, useJobsMock } = vi.hoisted(() => ({
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
      hideScheduled: 0 as const,
      sortBy: '' as '' | 'attempts',
      sortOrder: 'asc' as 'asc' | 'desc',
      page: 1,
    },
  },
  navigateMock: vi.fn(),
  trackEventMock: vi.fn(),
  useJobsMock: vi.fn(),
}))

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
  trackEvent: trackEventMock,
}))

vi.mock('@durabull/analytics/events', () => ({
  AnalyticsEvents: {
    QUEUE_VIEWED: 'QUEUE_VIEWED',
    JOB_LIST_SORTED: 'JOB_LIST_SORTED',
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
  useInvokeJobs: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useJobs: (...args: unknown[]) => {
    useJobsMock(...args)
    return {
      data: {
        pages: [
          {
            jobs: [
              {
                id: 'repeat:scheduler-key:123',
                name: 'send-email',
                status: 'delayed',
                data: { email: 'hello@example.com' },
                progress: 0,
                attemptsMade: 0,
                maxAttempts: 1,
                failedReason: null,
                processedOn: undefined,
                finishedOn: undefined,
                timestamp: 1_700_000_000_000,
                delay: 60_000,
                priority: 0,
              },
            ],
            total: 1,
            page: 1,
            cursor: '0',
            nextCursor: null,
            hasMore: false,
            pageSize: 20,
            totalPages: 1,
          },
        ],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    }
  },
  usePauseQueue: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useQueue: () => ({
    data: {
      name: 'emails',
      isPaused: false,
      scheduledJobsCount: 1,
      workers: [],
      jobCounts: {
        waiting: 0,
        active: 0,
        delayed: 1,
        completed: 0,
        failed: 0,
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
        totals: {
          failedLifetime: 0,
          failedInWindow: 0,
        },
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
      queue: {
        workersCount: 0,
        waitingToProcess: 0,
      },
      prometheus: {
        metrics: '',
      },
      priorities: {
        counts: {},
      },
    },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useQueueScheduledJobs: () => ({
    data: {
      scheduledJobs: [
        {
          schedulerId: 'scheduler-key',
          pattern: '0 * * * *',
          queueName: 'emails',
          jobName: 'send-email',
          nextRun: 1_700_000_060_000,
          enabled: true,
          data: {},
          recentFailedCount: 0,
        },
      ],
      total: 1,
    },
  }),
  useRemoveJobs: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useResumeQueue: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useRetryJobs: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

import { Route } from '@/routes/$orgSlug.c.$connectionId.queues.$queueName'

describe('queue detail job sorting', () => {
  beforeEach(() => {
    routeState.search = {
      section: 'jobs',
      tab: 'jobs',
      status: '',
      jobId: '',
      hideScheduled: 0,
      sortBy: '',
      sortOrder: 'asc',
      page: 1,
    }
    navigateMock.mockReset()
    trackEventMock.mockReset()
    useJobsMock.mockReset()
  })

  it('sorts a column descending on the first click and keeps the other filters', async () => {
    const user = userEvent.setup()
    const Component = Route.options.component as () => React.ReactNode

    render(<Component />)
    await user.click(screen.getByRole('button', { name: 'Attempts' }))

    expect(navigateMock).toHaveBeenCalledWith({
      to: '.',
      search: {
        section: 'jobs',
        tab: 'jobs',
        status: '',
        jobId: '',
        name: '',
        data: '',
        hideScheduled: 0,
        sortBy: 'attempts',
        sortOrder: 'desc',
        page: 1,
      },
      replace: true,
    })
    expect(trackEventMock).toHaveBeenCalledWith('JOB_LIST_SORTED', {
      queue_name: 'emails',
      sort_by: 'attempts',
      sort_order: 'desc',
    })
  })

  it('toggles the direction of the active sort column', async () => {
    routeState.search.sortBy = 'attempts'
    routeState.search.sortOrder = 'desc'
    const user = userEvent.setup()
    const Component = Route.options.component as () => React.ReactNode

    render(<Component />)
    const attemptsHeader = screen.getByRole('columnheader', { name: 'Attempts' })
    expect(attemptsHeader).toHaveAttribute('aria-sort', 'descending')
    await user.click(screen.getByRole('button', { name: 'Attempts' }))

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.objectContaining({ sortBy: 'attempts', sortOrder: 'asc' }),
      })
    )
  })

  it('requests the jobs list with the sort from the URL', () => {
    routeState.search.sortBy = 'attempts'
    routeState.search.sortOrder = 'desc'
    const Component = Route.options.component as () => React.ReactNode

    render(<Component />)

    expect(useJobsMock).toHaveBeenCalledWith(
      'emails',
      expect.objectContaining({ sortBy: 'attempts', sortOrder: 'desc' })
    )
  })
})
