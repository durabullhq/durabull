import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RetryJobDialog } from '@/components/retry-job-dialog'
import { RetryJobRequestState, type useJobRetryDialog } from '@/hooks/use-job-retry-dialog'
import type { GetJobResponse } from '@/hooks/use-queues'

const { trackEventMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
}))

vi.mock('@durabull/analytics/browser', () => ({
  trackEvent: trackEventMock,
}))

vi.mock('@durabull/analytics/events', () => ({
  AnalyticsEvents: {
    DIALOG_OPENED: 'DIALOG_OPENED',
    DIALOG_CLOSED: 'DIALOG_CLOSED',
  },
  AnalyticsProperties: {
    DIALOG_TYPE: 'dialog_type',
  },
  DialogType: {
    RETRY_JOB: 'retry_job',
  },
}))

const delayedJob = {
  id: 'job-123',
  name: 'send-email',
  status: 'delayed',
  attemptsMade: 1,
  maxAttempts: 3,
  processedOn: Date.now() - 1_000,
  timestamp: Date.now() - 5_000,
  delay: 0,
  opts: { backoff: { type: 'fixed', delay: 30_000 } },
} as unknown as GetJobResponse

const completedJob = {
  ...delayedJob,
  status: 'completed',
  failedReason: undefined,
} as unknown as GetJobResponse

const failedJob = {
  ...delayedJob,
  status: 'failed',
  failedReason: 'Timeout after 30s',
} as unknown as GetJobResponse

type RetryController = ReturnType<typeof useJobRetryDialog>

function makeRetryController(overrides: Partial<RetryController> = {}): RetryController {
  return {
    open: true,
    requestState: RetryJobRequestState.RETRYING,
    errorMessage: null,
    logEntries: [],
    stillRunning: false,
    job: null,
    jobStatus: undefined,
    watchError: null,
    isWatching: false,
    isTerminal: false,
    openDialog: vi.fn(),
    setOpen: vi.fn(),
    runRetry: vi.fn(),
    ...overrides,
  }
}

const defaultProps = {
  queueName: 'emails',
  jobId: 'job-123',
  jobName: 'send-email',
  retry: makeRetryController(),
}

describe('RetryJobDialog', () => {
  beforeEach(() => {
    trackEventMock.mockReset()
  })

  it('shows retrying state without a log pane', () => {
    render(<RetryJobDialog {...defaultProps} retry={makeRetryController()} />)

    expect(screen.getByText('Retrying Job')).toBeInTheDocument()
    expect(screen.queryByTestId('retry-log-stream')).not.toBeInTheDocument()
  })

  it('streams log lines while running', () => {
    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.WATCHING,
          isWatching: true,
          jobStatus: 'active',
          logEntries: [
            { id: 10, line: 'processing item 1' },
            { id: 11, line: 'processing item 2' },
          ],
        })}
      />
    )

    expect(screen.getByText('Job Running')).toBeInTheDocument()
    expect(screen.getByText('processing item 1')).toBeInTheDocument()
    expect(screen.getByText('processing item 2')).toBeInTheDocument()
  })

  it('shows waiting placeholder when no logs have arrived', () => {
    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.WATCHING,
          isWatching: true,
          jobStatus: 'active',
        })}
      />
    )

    expect(screen.getByText('Waiting for logs...')).toBeInTheDocument()
  })

  it('shows the still-running notice after the timeout', () => {
    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.WATCHING,
          isWatching: true,
          jobStatus: 'active',
          stillRunning: true,
        })}
      />
    )

    expect(screen.getByText(/safe to close this dialog/i)).toBeInTheDocument()
  })

  it('shows the delayed state with a backoff countdown', () => {
    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.WATCHING,
          isWatching: true,
          job: delayedJob,
          jobStatus: 'delayed',
        })}
      />
    )

    expect(screen.getByText('Waiting for Retry')).toBeInTheDocument()
    expect(screen.getByText(/Next retry in/i)).toBeInTheDocument()
  })

  it('shows success state', () => {
    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.WATCHING,
          isWatching: true,
          isTerminal: true,
          job: completedJob,
          jobStatus: 'completed',
        })}
      />
    )

    expect(screen.getByText('Job Completed')).toBeInTheDocument()
    expect(screen.getByText('The job completed successfully.')).toBeInTheDocument()
    expect(screen.queryByText('Waiting for logs...')).not.toBeInTheDocument()
    expect(screen.queryByTestId('retry-log-stream')).not.toBeInTheDocument()
  })

  it('hides the log stream on terminal success when no new logs arrived', () => {
    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.WATCHING,
          isWatching: true,
          isTerminal: true,
          job: completedJob,
          jobStatus: 'completed',
          logEntries: [],
        })}
      />
    )

    expect(screen.queryByTestId('retry-log-stream')).not.toBeInTheDocument()
  })

  it('still shows streamed logs on terminal success when present', () => {
    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.WATCHING,
          isWatching: true,
          isTerminal: true,
          job: completedJob,
          jobStatus: 'completed',
          logEntries: [{ id: 20, line: 'done processing' }],
        })}
      />
    )

    expect(screen.getByTestId('retry-log-stream')).toBeInTheDocument()
    expect(screen.getByText('done processing')).toBeInTheDocument()
  })

  it('shows failed run with reason and Retry Again', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.WATCHING,
          isWatching: true,
          isTerminal: true,
          job: failedJob,
          jobStatus: 'failed',
          logEntries: [
            { id: 30, line: 'starting...' },
            { id: 31, line: 'error: timeout' },
          ],
          runRetry: onRetry,
        })}
      />
    )

    expect(screen.getByText('Job Failed')).toBeInTheDocument()
    expect(screen.getByText('Timeout after 30s')).toBeInTheDocument()
    expect(screen.getByText('error: timeout')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry Again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows error state with Try Again', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.ERROR,
          errorMessage: 'Job is locked',
          runRetry: onRetry,
        })}
      />
    )

    expect(screen.getByText('Retry Failed')).toBeInTheDocument()
    expect(screen.getByText('Job is locked')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try Again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('is closable while the job is running', async () => {
    const user = userEvent.setup()
    const setOpen = vi.fn()

    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.WATCHING,
          isWatching: true,
          jobStatus: 'active',
          setOpen,
        })}
      />
    )

    // Two "Close" buttons exist: the footer button and Radix's X icon button.
    const [footerClose] = screen.getAllByRole('button', { name: 'Close' })
    await user.click(footerClose)
    expect(setOpen).toHaveBeenCalledWith(false)
  })

  it('does not show still-running copy while a delayed job is waiting for backoff', () => {
    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.WATCHING,
          isWatching: true,
          job: delayedJob,
          jobStatus: 'delayed',
          stillRunning: true,
        })}
      />
    )

    expect(screen.getByText('Waiting for Retry')).toBeInTheDocument()
    expect(screen.queryByText(/still running/i)).not.toBeInTheDocument()
  })

  it('closes when Done is clicked after success', async () => {
    const user = userEvent.setup()
    const setOpen = vi.fn()

    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.WATCHING,
          isWatching: true,
          isTerminal: true,
          job: completedJob,
          jobStatus: 'completed',
          setOpen,
        })}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(setOpen).toHaveBeenCalledWith(false)
  })
})
