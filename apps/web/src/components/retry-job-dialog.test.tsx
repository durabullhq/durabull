import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RetryJobDialog } from '@/components/retry-job-dialog'
import { RetryJobRequestState, type useJobRetryDialog } from '@/hooks/use-job-retry-dialog'
import type { GetJobResponse } from '@/hooks/use-queues'

function setEditorValue(value: string) {
  fireEvent.change(screen.getByTestId('mock-json-editor'), { target: { value } })
}

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

vi.mock('@/components/json-editor', () => ({
  JsonEditor: ({
    value,
    onChange,
  }: {
    value: unknown
    onChange: (value: unknown, isValid: boolean) => void
  }) => (
    <textarea
      data-testid="mock-json-editor"
      defaultValue={JSON.stringify(value)}
      onChange={(event) => {
        try {
          onChange(JSON.parse(event.target.value), true)
        } catch {
          onChange(value, false)
        }
      }}
    />
  ),
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
    backToReview: vi.fn(),
    ...overrides,
  }
}

const sampleJobData = { message: 'hello' }

const defaultProps = {
  queueName: 'emails',
  jobId: 'job-123',
  jobName: 'send-email',
  jobData: sampleJobData,
  retry: makeRetryController(),
}

describe('RetryJobDialog', () => {
  beforeEach(() => {
    trackEventMock.mockReset()
  })

  it('renders the review step with the payload collapsed and does not auto-retry', () => {
    const runRetry = vi.fn()

    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.REVIEW,
          runRetry,
        })}
      />
    )

    expect(screen.getByText('Review Before Retry')).toBeInTheDocument()
    expect(screen.getByText(/has not been retried yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit job payload' })).toBeInTheDocument()
    expect(screen.queryByTestId('mock-json-editor')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry Job' })).toBeEnabled()
    expect(runRetry).not.toHaveBeenCalled()
  })

  it('expands to show the editor prefilled with the current payload', async () => {
    const user = userEvent.setup()

    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.REVIEW,
        })}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Edit job payload' }))

    expect(screen.getByTestId('mock-json-editor')).toBeInTheDocument()
    expect(screen.getByTestId('mock-json-editor')).toHaveValue(JSON.stringify(sampleJobData))
  })

  it('unchanged payload Retry Job calls runRetry with no argument', async () => {
    const user = userEvent.setup()
    const runRetry = vi.fn()

    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.REVIEW,
          runRetry,
        })}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Retry Job' }))
    expect(runRetry).toHaveBeenCalledTimes(1)
    expect(runRetry).toHaveBeenCalledWith()
  })

  it('edited payload requires acknowledgement before overwrite retry', async () => {
    const user = userEvent.setup()
    const runRetry = vi.fn()

    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.REVIEW,
          runRetry,
        })}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Edit job payload' }))
    setEditorValue(JSON.stringify({ message: 'rewritten' }))

    const overwriteButton = screen.getByRole('button', { name: 'Overwrite Payload & Retry' })
    expect(overwriteButton).toBeDisabled()

    const acknowledgement = screen.getByLabelText(
      'I understand, overwrite the stored payload and retry with it.'
    )
    expect(acknowledgement).toBeInTheDocument()

    await user.click(acknowledgement)
    expect(overwriteButton).toBeEnabled()

    await user.click(overwriteButton)
    expect(runRetry).toHaveBeenCalledWith({ message: 'rewritten' })
  })

  it('disables the primary action when JSON is invalid', async () => {
    const user = userEvent.setup()
    const runRetry = vi.fn()

    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.REVIEW,
          runRetry,
        })}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Edit job payload' }))
    setEditorValue('{ not valid')

    expect(screen.getByRole('button', { name: 'Retry Job' })).toBeDisabled()
    expect(runRetry).not.toHaveBeenCalled()
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

  it('shows failed run with reason and Retry Again returns to review', async () => {
    const user = userEvent.setup()
    const backToReview = vi.fn()

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
          backToReview,
        })}
      />
    )

    expect(screen.getByText('Job Failed')).toBeInTheDocument()
    expect(screen.getByText('Timeout after 30s')).toBeInTheDocument()
    expect(screen.getByText('error: timeout')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry Again' }))
    expect(backToReview).toHaveBeenCalledTimes(1)
  })

  it('shows error state with Try Again returning to review', async () => {
    const user = userEvent.setup()
    const backToReview = vi.fn()

    render(
      <RetryJobDialog
        {...defaultProps}
        retry={makeRetryController({
          requestState: RetryJobRequestState.ERROR,
          errorMessage: 'Job is locked',
          backToReview,
        })}
      />
    )

    expect(screen.getByText('Retry Failed')).toBeInTheDocument()
    expect(screen.getByText('Job is locked')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try Again' }))
    expect(backToReview).toHaveBeenCalledTimes(1)
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
