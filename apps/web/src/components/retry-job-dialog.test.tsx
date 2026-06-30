import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RetryJobDialog } from '@/components/retry-job-dialog'

const { mutateAsyncMock, trackEventMock } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
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

vi.mock('@/hooks/use-queues', () => ({
  useRetryJobs: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}))

describe('RetryJobDialog', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
    trackEventMock.mockReset()
  })

  it('shows success state when retry succeeds', async () => {
    mutateAsyncMock.mockResolvedValue({ success: 1, failed: 0, errors: [] })

    render(
      <RetryJobDialog
        open
        onOpenChange={vi.fn()}
        queueName="emails"
        jobId="job-123"
        jobName="send-email"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Job Retried')).toBeInTheDocument()
    })

    expect(screen.getByText(/Retry succeeded/i)).toBeInTheDocument()
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      queueName: 'emails',
      jobIds: ['job-123'],
    })
  })

  it('shows error state when retry fails', async () => {
    mutateAsyncMock.mockResolvedValue({
      success: 0,
      failed: 1,
      errors: [{ jobId: 'job-123', error: 'Job is locked' }],
    })

    render(
      <RetryJobDialog
        open
        onOpenChange={vi.fn()}
        queueName="emails"
        jobId="job-123"
        jobName="send-email"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Retry Failed')).toBeInTheDocument()
    })

    expect(screen.getByText('Job is locked')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
  })

  it('retries again when Try Again is clicked', async () => {
    const user = userEvent.setup()
    mutateAsyncMock
      .mockResolvedValueOnce({
        success: 0,
        failed: 1,
        errors: [{ jobId: 'job-123', error: 'Temporary failure' }],
      })
      .mockResolvedValueOnce({ success: 1, failed: 0, errors: [] })

    render(
      <RetryJobDialog
        open
        onOpenChange={vi.fn()}
        queueName="emails"
        jobId="job-123"
        jobName="send-email"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Temporary failure')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Try Again' }))

    await waitFor(() => {
      expect(screen.getByText('Job Retried')).toBeInTheDocument()
    })

    expect(mutateAsyncMock).toHaveBeenCalledTimes(2)
  })

  it('closes when Done is clicked after success', async () => {
    const user = userEvent.setup()
    mutateAsyncMock.mockResolvedValue({ success: 1, failed: 0, errors: [] })
    const onOpenChange = vi.fn()

    render(
      <RetryJobDialog
        open
        onOpenChange={onOpenChange}
        queueName="emails"
        jobId="job-123"
        jobName="send-email"
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
