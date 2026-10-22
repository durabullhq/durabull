import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { routeState, topBarState, scheduledJobsState, navigateMock, trackEventMock } = vi.hoisted(
  () => ({
    routeState: {
      params: {
        orgSlug: 'acme',
        connectionId: 'conn-1',
        queueName: 'emails',
      },
      search: {
        section: 'jobs' as 'jobs' | 'observability',
        tab: 'jobs' as 'jobs' | 'scheduled',
        status: '',
        jobId: '',
        hideScheduled: 0 as const,
        page: 1,
      },
    },
    topBarState: { config: null as null | { actions?: React.ReactNode } },
    scheduledJobsState: {
      scheduledJobs: [] as Array<{
        schedulerId: string
        pattern?: string
        every?: number
        queueName: string
        jobName: string
        nextRun?: number
        enabled: boolean
        recentFailedCount?: number
      }>,
      total: 0,
    },
    navigateMock: vi.fn(),
    trackEventMock: vi.fn(),
  })
)

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
  },
}))

vi.mock('@/components/app-top-bar', () => ({
  useAppTopBar: (config: { actions?: React.ReactNode }) => {
    topBarState.config = config
  },
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
  useJobs: () => ({
    data: {
      pages: [
        {
          jobs: [],
          total: 0,
          page: 1,
          cursor: '0',
          nextCursor: null,
          hasMore: false,
          pageSize: 20,
          totalPages: 0,
        },
      ],
    },
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useMatchingJobCount: () => ({ data: undefined }),
  usePauseQueue: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useQueue: () => ({
    data: {
      name: 'emails',
      isPaused: false,
      scheduledJobsCount: scheduledJobsState.total,
      workers: [],
      jobCounts: {
        waiting: 0,
        active: 0,
        delayed: 0,
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
    data: scheduledJobsState,
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

describe('queue detail scheduled job creation', () => {
  beforeEach(() => {
    routeState.search = {
      section: 'jobs',
      tab: 'jobs',
      status: '',
      jobId: '',
      hideScheduled: 0,
      page: 1,
    }
    topBarState.config = null
    scheduledJobsState.scheduledJobs = []
    scheduledJobsState.total = 0
    navigateMock.mockReset()
    trackEventMock.mockReset()
  })

  it('navigates to the dedicated scheduled job page from the top bar action', async () => {
    const user = userEvent.setup()
    const Component = Route.options.component as () => React.ReactNode

    render(<Component />)
    render(<div>{topBarState.config?.actions}</div>)

    await user.click(screen.getByRole('button', { name: 'Schedule Job' }))

    expect(navigateMock).toHaveBeenCalledWith({
      params: {
        connectionId: 'conn-1',
        orgSlug: 'acme',
        queueName: 'emails',
      },
      to: '/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/new',
    })
  })

  it('shows an empty-state CTA in the scheduled tab', async () => {
    const user = userEvent.setup()
    routeState.search.tab = 'scheduled'
    const Component = Route.options.component as () => React.ReactNode

    render(<Component />)

    await user.click(screen.getByRole('button', { name: /Create the first scheduler/i }))

    expect(navigateMock).toHaveBeenCalledWith({
      params: {
        connectionId: 'conn-1',
        orgSlug: 'acme',
        queueName: 'emails',
      },
      to: '/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/new',
    })
  })
})
