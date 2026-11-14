import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  flowControlsState,
  routeState,
  topBarState,
  scheduledJobsState,
  navigateMock,
  trackEventMock,
} = vi.hoisted(() => ({
  flowControlsState: {
    dialogOpen: false,
    limits: null as null | {
      globalConcurrency: number | null
      globalRateLimit: { max: number; durationMs: number } | null
    },
  },
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
  topBarState: { config: null as null | { actions?: React.ReactNode; left?: React.ReactNode } },
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
    DIALOG_OPENED: 'dialog_opened',
  },
  AnalyticsProperties: { DIALOG_TYPE: 'dialog_type' },
  DialogType: { QUEUE_FLOW_CONTROLS: 'queue_flow_controls' },
}))

vi.mock('@/components/app-top-bar', () => ({
  useAppTopBar: (config: { actions?: React.ReactNode; left?: React.ReactNode }) => {
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

vi.mock('@/components/queue-flow-controls-dialog', () => ({
  QueueFlowControlsDialog: ({ open }: { open: boolean }) => {
    flowControlsState.dialogOpen = open
    return null
  },
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
  usePauseQueue: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useQueue: () => ({
    data: {
      name: 'emails',
      isPaused: false,
      scheduledJobsCount: scheduledJobsState.total,
      flowControls: flowControlsState.limits ?? {
        globalConcurrency: null,
        globalRateLimit: null,
      },
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
    flowControlsState.dialogOpen = false
    flowControlsState.limits = null
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

    // Scheduling is a rare action, so it lives in the top bar's overflow menu.
    await user.click(screen.getByRole('button', { name: 'Queue actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Schedule job' }))

    expect(navigateMock).toHaveBeenCalledWith({
      params: {
        connectionId: 'conn-1',
        orgSlug: 'acme',
        queueName: 'emails',
      },
      to: '/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/new',
    })
  })

  it('opens flow controls from the queue actions menu', async () => {
    const user = userEvent.setup()
    const Component = Route.options.component as () => React.ReactNode

    render(<Component />)
    render(<div>{topBarState.config?.actions}</div>)
    expect(flowControlsState.dialogOpen).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Queue actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Flow controls' }))

    expect(flowControlsState.dialogOpen).toBe(true)
    expect(trackEventMock).toHaveBeenCalledWith('dialog_opened', {
      dialog_type: 'queue_flow_controls',
    })
  })

  it('summarizes active flow controls in the header only when set', () => {
    const Component = Route.options.component as () => React.ReactNode
    const { unmount } = render(<Component />)
    const { unmount: unmountBar } = render(<div>{topBarState.config?.left}</div>)
    expect(screen.queryByTestId('queue-flow-controls-summary')).toBeNull()
    unmountBar()
    unmount()

    flowControlsState.limits = {
      globalConcurrency: 8,
      globalRateLimit: { max: 120, durationMs: 60_000 },
    }
    render(<Component />)
    render(<div>{topBarState.config?.left}</div>)
    expect(screen.getByTestId('queue-flow-controls-summary')).toHaveTextContent(
      '8 concurrent · 120/min'
    )
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
