import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  routeState,
  navigateMock,
  removeMutateMock,
  pauseMutateMock,
  resumeMutateMock,
  retryMutateMock,
  invokeMutateMock,
  trackEventMock,
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
      hideScheduled: 0 as const,
      page: 1,
    },
  },
  navigateMock: vi.fn(),
  removeMutateMock: vi.fn(),
  pauseMutateMock: vi.fn(),
  resumeMutateMock: vi.fn(),
  retryMutateMock: vi.fn(),
  invokeMutateMock: vi.fn(),
  trackEventMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  Outlet: () => null,
  createFileRoute: () => (options: unknown) => ({
    useParams: () => routeState.params,
    useSearch: () => routeState.search,
    options,
  }),
  useMatchRoute: () => () => false,
  useNavigate: () => navigateMock,
}))

vi.mock('@durabull/analytics', () => ({
  AnalyticsEvents: {
    QUEUE_VIEWED: 'QUEUE_VIEWED',
  },
  trackEvent: trackEventMock,
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
    mutate: invokeMutateMock,
    isPending: false,
  }),
  useJobs: () => ({
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
  }),
  usePauseQueue: () => ({
    mutate: pauseMutateMock,
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
    mutate: removeMutateMock,
    isPending: false,
  }),
  useResumeQueue: () => ({
    mutate: resumeMutateMock,
    isPending: false,
  }),
  useRetryJobs: () => ({
    mutate: retryMutateMock,
    isPending: false,
  }),
}))

import { Route } from '@/routes/$orgSlug.c.$connectionId.queues.$queueName'

describe('queue detail scheduled removal', () => {
  beforeEach(() => {
    routeState.search = {
      section: 'jobs',
      tab: 'jobs',
      status: '',
      jobId: '',
      name: '',
      hideScheduled: 0,
      page: 1,
    }
    navigateMock.mockReset()
    removeMutateMock.mockReset()
    pauseMutateMock.mockReset()
    resumeMutateMock.mockReset()
    retryMutateMock.mockReset()
    invokeMutateMock.mockReset()
    trackEventMock.mockReset()
  })

  it('requires confirmation before bulk-removing a scheduled job and stopping the scheduler', async () => {
    const user = userEvent.setup()
    const Component = Route.options.component as () => React.ReactNode

    render(<Component />)

    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[1])

    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('menuitem', { name: /Remove Job & Stop Scheduler/i }))
    expect(screen.getByText('Remove Job & Stop Scheduler?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove & Stop Scheduler' }))

    expect(removeMutateMock).toHaveBeenCalledTimes(1)
    expect(removeMutateMock).toHaveBeenCalledWith(
      {
        queueName: 'emails',
        jobIds: ['repeat:scheduler-key:123'],
        removeScheduler: true,
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      })
    )
  })
})
