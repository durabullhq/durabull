import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueueFlowControlsDialog } from '@/components/queue-flow-controls-dialog'
import { formatTtl } from '@/lib/flow-controls'

const { updateMock, clearMock, toastSuccessMock, queryState } = vi.hoisted(() => ({
  updateMock: vi.fn(),
  clearMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  queryState: {
    data: null as null | Record<string, unknown>,
    isFetching: false,
    error: null as null | Error,
  },
}))

vi.mock('@/hooks/use-queues', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-queues')>('@/hooks/use-queues')
  return {
    ...actual,
    useQueueFlowControls: () => ({
      data: queryState.data,
      isLoading: false,
      isFetching: queryState.isFetching,
      error: queryState.error,
    }),
    useUpdateQueueFlowControls: () => ({ mutateAsync: updateMock, isPending: false }),
    useClearQueueRateLimit: () => ({ mutateAsync: clearMock, isPending: false }),
  }
})

vi.mock('sonner', () => ({ toast: { success: toastSuccessMock } }))

function state(overrides: Record<string, unknown> = {}) {
  return {
    globalConcurrency: null,
    globalRateLimit: null,
    rateLimitTtlMs: 0,
    rateLimited: false,
    isMaxed: false,
    activeCount: 2,
    ...overrides,
  }
}

describe('QueueFlowControlsDialog', () => {
  beforeEach(() => {
    updateMock.mockReset().mockResolvedValue(state())
    clearMock.mockReset().mockResolvedValue(state())
    toastSuccessMock.mockReset()
    queryState.data = state()
    queryState.isFetching = false
    queryState.error = null
  })

  it('disables save until something changes', () => {
    render(<QueueFlowControlsDialog queueName="emails" open onOpenChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Save limits/ })).toBeDisabled()
    expect(screen.getByText('No queue-wide cap')).toBeInTheDocument()
    expect(screen.getByText('Not throttled')).toBeInTheDocument()
  })

  it('sends only the changed controls', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<QueueFlowControlsDialog queueName="emails" open onOpenChange={onOpenChange} />)

    await user.click(screen.getByLabelText('Limit concurrent jobs'))
    await user.type(screen.getByLabelText('Global concurrency'), '4')
    await user.click(screen.getByRole('button', { name: /Save limits/ }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    expect(updateMock).toHaveBeenCalledWith({
      queueName: 'emails',
      update: { globalConcurrency: 4 },
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('sets a rate limit in the chosen unit', async () => {
    const user = userEvent.setup()
    render(<QueueFlowControlsDialog queueName="emails" open onOpenChange={vi.fn()} />)

    await user.click(screen.getByLabelText('Rate limit job starts'))
    await user.type(screen.getByLabelText('Jobs per window'), '100')
    await user.clear(screen.getByLabelText('Window length'))
    await user.type(screen.getByLabelText('Window length'), '2')
    await user.selectOptions(screen.getByLabelText('Window unit'), 'm')
    await user.click(screen.getByRole('button', { name: /Save limits/ }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    expect(updateMock).toHaveBeenCalledWith({
      queueName: 'emails',
      update: { globalRateLimit: { max: 100, durationMs: 120_000 } },
    })
  })

  it('removes an existing limit when unchecked', async () => {
    const user = userEvent.setup()
    queryState.data = state({ globalConcurrency: 3, isMaxed: false })
    render(<QueueFlowControlsDialog queueName="emails" open onOpenChange={vi.fn()} />)

    expect(screen.getByLabelText('Global concurrency')).toHaveValue('3')
    await user.click(screen.getByLabelText('Limit concurrent jobs'))
    await user.click(screen.getByRole('button', { name: /Save limits/ }))

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        queueName: 'emails',
        update: { globalConcurrency: null },
      })
    )
  })

  it('blocks invalid values', async () => {
    const user = userEvent.setup()
    render(<QueueFlowControlsDialog queueName="emails" open onOpenChange={vi.fn()} />)

    await user.click(screen.getByLabelText('Limit concurrent jobs'))
    await user.type(screen.getByLabelText('Global concurrency'), '0')

    expect(screen.getByText(/Enter a whole number from 1/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save limits/ })).toBeDisabled()
  })

  it('ends an open rate-limit window', async () => {
    const user = userEvent.setup()
    queryState.data = state({
      globalRateLimit: { max: 10, durationMs: 60_000 },
      rateLimited: true,
      rateLimitTtlMs: 42_000,
    })
    render(<QueueFlowControlsDialog queueName="emails" open onOpenChange={vi.fn()} />)

    expect(screen.getByText('42 s left')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /End window now/ }))

    await waitFor(() => expect(clearMock).toHaveBeenCalledWith('emails'))
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('waits for a fresh fetch before seeding the form from cached state', () => {
    queryState.data = state({ globalConcurrency: 3 })
    queryState.isFetching = true
    const { rerender } = render(
      <QueueFlowControlsDialog queueName="emails" open onOpenChange={vi.fn()} />
    )
    expect(screen.queryByLabelText('Limit concurrent jobs')).not.toBeInTheDocument()

    queryState.data = state({ globalConcurrency: 7 })
    queryState.isFetching = false
    rerender(<QueueFlowControlsDialog queueName="emails" open onOpenChange={vi.fn()} />)
    expect(screen.getByLabelText('Global concurrency')).toHaveValue('7')
  })

  it('does not revert a limit changed elsewhere while the dialog is open', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <QueueFlowControlsDialog queueName="emails" open onOpenChange={vi.fn()} />
    )

    // A poll picks up a rate limit another user just set.
    queryState.data = state({ globalRateLimit: { max: 5, durationMs: 1_000 } })
    rerender(<QueueFlowControlsDialog queueName="emails" open onOpenChange={vi.fn()} />)

    await user.click(screen.getByLabelText('Limit concurrent jobs'))
    await user.type(screen.getByLabelText('Global concurrency'), '4')
    await user.click(screen.getByRole('button', { name: /Save limits/ }))

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        queueName: 'emails',
        update: { globalConcurrency: 4 },
      })
    )
  })
})

describe('QueueFlowControlsDialog refresh errors', () => {
  beforeEach(() => {
    updateMock.mockReset().mockResolvedValue(state())
    queryState.data = state()
    queryState.isFetching = false
    queryState.error = null
  })

  it('keeps unsaved edits on screen when a poll fails', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <QueueFlowControlsDialog queueName="emails" open onOpenChange={vi.fn()} />
    )
    await user.click(screen.getByLabelText('Limit concurrent jobs'))
    await user.type(screen.getByLabelText('Global concurrency'), '4')

    queryState.error = new Error('Redis connection lost')
    rerender(<QueueFlowControlsDialog queueName="emails" open onOpenChange={vi.fn()} />)

    expect(screen.getByText(/Could not refresh the live status/)).toBeInTheDocument()
    expect(screen.getByLabelText('Global concurrency')).toHaveValue('4')
  })

  it('does not seed the form from cached state whose refresh failed', () => {
    queryState.error = new Error('Redis connection lost')
    render(<QueueFlowControlsDialog queueName="emails" open onOpenChange={vi.fn()} />)

    expect(screen.getByText('Redis connection lost')).toBeInTheDocument()
    expect(screen.queryByLabelText('Limit concurrent jobs')).not.toBeInTheDocument()
  })
})

describe('QueueFlowControlsDialog mutation failures', () => {
  beforeEach(() => {
    updateMock.mockReset()
    clearMock.mockReset()
    queryState.data = state()
    queryState.isFetching = false
    queryState.error = null
  })

  it('shows a failed save inline and keeps the edits', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    updateMock.mockRejectedValue(new Error('READONLY replica'))
    render(<QueueFlowControlsDialog queueName="emails" open onOpenChange={onOpenChange} />)

    await user.click(screen.getByLabelText('Limit concurrent jobs'))
    await user.type(screen.getByLabelText('Global concurrency'), '4')
    await user.click(screen.getByRole('button', { name: /Save limits/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the limits: READONLY replica'
    )
    expect(screen.getByLabelText('Global concurrency')).toHaveValue('4')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    // Editing again clears the stale error.
    await user.type(screen.getByLabelText('Global concurrency'), '0')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a failed window clear inline', async () => {
    const user = userEvent.setup()
    clearMock.mockRejectedValue(new Error('Connection is closed'))
    queryState.data = state({
      globalRateLimit: { max: 10, durationMs: 60_000 },
      rateLimited: true,
      rateLimitTtlMs: 42_000,
    })
    render(<QueueFlowControlsDialog queueName="emails" open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /End window now/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not end the rate-limit window: Connection is closed'
    )
  })
})

describe('formatTtl', () => {
  it('never shows 60 seconds in a part', () => {
    expect(formatTtl(500)).toBe('500 ms')
    expect(formatTtl(9_400)).toBe('9.4 s')
    expect(formatTtl(9_960)).toBe('10 s')
    expect(formatTtl(59_600)).toBe('1 min 0 s')
    expect(formatTtl(119_600)).toBe('2 min 0 s')
    expect(formatTtl(90_000)).toBe('1 min 30 s')
  })
})
