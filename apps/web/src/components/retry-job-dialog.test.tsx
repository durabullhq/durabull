import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RetryJobDialog } from '@/components/retry-job-dialog'
import { RetryJobPhase } from '@/components/retry-job-phase'

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

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  queueName: 'emails',
  jobId: 'job-123',
  jobName: 'send-email',
  phase: RetryJobPhase.RETRYING,
  errorMessage: null,
  onRetry: vi.fn(),
}

describe('RetryJobDialog', () => {
  beforeEach(() => {
    trackEventMock.mockReset()
    defaultProps.onOpenChange.mockReset()
    defaultProps.onRetry.mockReset()
  })

  it('shows success state', () => {
    render(<RetryJobDialog {...defaultProps} phase={RetryJobPhase.SUCCESS} />)

    expect(screen.getByText('Job Retried')).toBeInTheDocument()
    expect(screen.getByText(/Retry succeeded/i)).toBeInTheDocument()
  })

  it('shows error state with message', () => {
    render(
      <RetryJobDialog {...defaultProps} phase={RetryJobPhase.ERROR} errorMessage="Job is locked" />
    )

    expect(screen.getByText('Retry Failed')).toBeInTheDocument()
    expect(screen.getByText('Job is locked')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
  })

  it('calls onRetry when Try Again is clicked', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(
      <RetryJobDialog
        {...defaultProps}
        phase={RetryJobPhase.ERROR}
        errorMessage="Temporary failure"
        onRetry={onRetry}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Try Again' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('closes when Done is clicked after success', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(<RetryJobDialog {...defaultProps} phase={RetryJobPhase.SUCCESS} onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows retrying state while in progress', () => {
    render(<RetryJobDialog {...defaultProps} phase={RetryJobPhase.RETRYING} />)

    expect(screen.getByText('Retrying Job')).toBeInTheDocument()
    expect(screen.getByText('Retry in progress...')).toBeInTheDocument()
  })
})
