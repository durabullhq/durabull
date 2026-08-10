import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditJobDataDialog } from '@/components/edit-job-data-dialog'

function setEditorValue(value: string) {
  fireEvent.change(screen.getByTestId('mock-json-editor'), { target: { value } })
}

const { mutateAsyncMock, toastSuccessMock, mutationState, trackEventMock } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  mutationState: { isPending: false },
  trackEventMock: vi.fn(),
}))

vi.mock('@/hooks/use-queues', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-queues')>('@/hooks/use-queues')

  return {
    ...actual,
    useUpdateJobData: () => ({
      mutateAsync: mutateAsyncMock,
      isPending: mutationState.isPending,
    }),
  }
})

vi.mock('@durabull/analytics/browser', () => ({
  trackEvent: trackEventMock,
}))

vi.mock('@durabull/analytics/events', () => ({
  AnalyticsEvents: {
    DIALOG_OPENED: 'dialog_opened',
    DIALOG_CLOSED: 'dialog_closed',
  },
  AnalyticsProperties: {
    DIALOG_TYPE: 'dialog_type',
  },
  DialogType: {
    EDIT_JOB_DATA: 'edit_job_data',
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
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

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  queueName: 'emails',
  jobId: 'job-123',
  jobName: 'send-email',
  jobData: { message: 'hello' },
  jobStatus: 'waiting',
}

describe('EditJobDataDialog', () => {
  beforeEach(() => {
    mutationState.isPending = false
    mutateAsyncMock.mockReset()
    toastSuccessMock.mockReset()
    trackEventMock.mockReset()
    defaultProps.onOpenChange = vi.fn()
  })

  it('disables save until the typed job ID matches', async () => {
    const user = userEvent.setup()

    render(<EditJobDataDialog {...defaultProps} />)

    setEditorValue('{"message":"updated"}')

    const saveButton = screen.getByTestId('edit-job-data-confirm-button')
    expect(saveButton).toBeDisabled()

    await user.type(screen.getByTestId('edit-job-data-confirm-input'), 'job-12')
    expect(screen.getByText('Job ID does not match.')).toBeInTheDocument()
    expect(saveButton).toBeDisabled()

    await user.type(screen.getByTestId('edit-job-data-confirm-input'), '3')
    expect(saveButton).toBeEnabled()
  })

  it('disables save when the payload is unchanged even with a matching job ID', async () => {
    const user = userEvent.setup()

    render(<EditJobDataDialog {...defaultProps} />)

    await user.type(screen.getByTestId('edit-job-data-confirm-input'), 'job-123')

    expect(screen.getByTestId('edit-job-data-confirm-button')).toBeDisabled()
    await user.click(screen.getByTestId('edit-job-data-confirm-button'))
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('disables save on invalid JSON', async () => {
    const user = userEvent.setup()

    render(<EditJobDataDialog {...defaultProps} />)

    setEditorValue('{not-valid')
    await user.type(screen.getByTestId('edit-job-data-confirm-input'), 'job-123')

    expect(screen.getByTestId('edit-job-data-confirm-button')).toBeDisabled()
    await user.click(screen.getByTestId('edit-job-data-confirm-button'))
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('submits the edited payload to the mutation', async () => {
    const user = userEvent.setup()
    mutateAsyncMock.mockResolvedValue({ success: true, state: 'waiting' })
    const onOpenChange = vi.fn()
    const onSuccess = vi.fn()

    render(
      <EditJobDataDialog {...defaultProps} onOpenChange={onOpenChange} onSuccess={onSuccess} />
    )

    setEditorValue('{"message":"updated"}')
    await user.type(screen.getByTestId('edit-job-data-confirm-input'), 'job-123')
    await user.click(screen.getByTestId('edit-job-data-confirm-button'))

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1))
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      queueName: 'emails',
      jobId: 'job-123',
      data: { message: 'updated' },
    })
    expect(toastSuccessMock).toHaveBeenCalledWith(
      'Job payload updated',
      expect.objectContaining({
        description: expect.stringContaining('Redis'),
      })
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('blocks save when the job is active', async () => {
    const user = userEvent.setup()

    render(<EditJobDataDialog {...defaultProps} jobStatus="active" />)

    expect(screen.getByText(/worker already holds the current payload/i)).toBeInTheDocument()
    expect(screen.queryByTestId('edit-job-data-confirm-input')).not.toBeInTheDocument()
    expect(screen.getByTestId('edit-job-data-confirm-button')).toBeDisabled()

    await user.click(screen.getByTestId('edit-job-data-confirm-button'))
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })
})
