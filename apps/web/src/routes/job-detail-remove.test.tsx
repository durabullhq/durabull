import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { routeState, topBarState, navigateMock, removeMutateMock, trackEventMock } =
  vi.hoisted(() => ({
    routeState: {
      params: {
        orgSlug: 'acme',
        connectionId: 'conn-1',
        queueName: 'emails',
        jobId: 'repeat:scheduler-key:123',
      },
      search: { tab: 'data' as const },
    },
    topBarState: { config: null as null | { actions?: React.ReactNode } },
    navigateMock: vi.fn(),
    removeMutateMock: vi.fn(),
    trackEventMock: vi.fn(),
  }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  createFileRoute: () => (options: unknown) => ({
    useParams: () => routeState.params,
    useSearch: () => routeState.search,
    options,
  }),
  useNavigate: () => navigateMock,
}))

vi.mock('@durabull/analytics/browser', () => ({
  trackEvent: trackEventMock,
}))

vi.mock('@durabull/analytics/events', () => ({
  AnalyticsEvents: {
    JOB_VIEWED: 'JOB_VIEWED',
    JOB_TAB_CHANGED: 'JOB_TAB_CHANGED',
  },
}))

vi.mock('@/components/app-top-bar', () => ({
  useAppTopBar: (config: { actions?: React.ReactNode }) => {
    topBarState.config = config
  },
}))

vi.mock('@/components/delete-job-logs-button', () => ({
  DeleteJobLogsButton: () => null,
}))

vi.mock('@/components/duplicate-job-dialog', () => ({
  DuplicateJobDialog: () => null,
}))

vi.mock('@/components/failed-attempts', () => ({
  FailedAttempts: () => null,
}))

vi.mock('@/components/invoke-job-dialog', () => ({
  InvokeJobDialog: () => null,
}))

vi.mock('@/components/json-viewer', () => ({
  JsonViewer: () => <div>json</div>,
}))

vi.mock('@/components/queue-name-tag', () => ({
  QueueNameTag: ({ name }: { name: string }) => <span>{name}</span>,
}))

vi.mock('@/components/retry-countdown', () => ({
  RetryCountdown: () => null,
}))

vi.mock('@/components/retry-job-dialog', () => ({
  RetryJobDialog: () => null,
}))

vi.mock('@/hooks/use-alerts', () => ({
  useConnectionAlertEvents: () => ({
    data: { events: [] },
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-queues', () => ({
  useJob: () => ({
    data: {
      id: routeState.params.jobId,
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
      opts: {},
      returnvalue: null,
      stacktraceCount: 0,
      logsCount: 0,
      parentKey: null,
    },
    isLoading: false,
    error: null,
  }),
  useJobLogs: () => ({
    data: {
      pages: [{ logs: [], count: 0, page: 1, pageSize: 50, totalPages: 0, hasMore: false }],
    },
  }),
  useRemoveJobs: () => ({
    mutate: removeMutateMock,
    isPending: false,
  }),
}))

import { Route } from '@/routes/$orgSlug.c.$connectionId.queues.$queueName_.jobs.$jobId'

describe('job detail scheduled removal', () => {
  beforeEach(() => {
    routeState.params.jobId = 'repeat:scheduler-key:123'
    routeState.search = { tab: 'data' }
    topBarState.config = null
    navigateMock.mockReset()
    removeMutateMock.mockReset()
    trackEventMock.mockReset()
  })

  it('routes scheduled job removal through scheduler stop after confirmation', async () => {
    const user = userEvent.setup()
    const Component = Route.options.component as () => React.ReactNode

    render(<Component />)
    render(<div>{topBarState.config?.actions}</div>)

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

  it('routes regular job removal through confirmation before deleting', async () => {
    routeState.params.jobId = 'job-123'
    const user = userEvent.setup()
    const Component = Route.options.component as () => React.ReactNode

    render(<Component />)
    render(<div>{topBarState.config?.actions}</div>)

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByText('Remove Job?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove Job' }))

    expect(removeMutateMock).toHaveBeenCalledTimes(1)
    expect(removeMutateMock).toHaveBeenCalledWith(
      {
        queueName: 'emails',
        jobIds: ['job-123'],
        removeScheduler: false,
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      })
    )
  })
})
