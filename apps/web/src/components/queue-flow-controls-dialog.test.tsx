import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatTtl, QueueFlowControlsDialog } from '@/components/queue-flow-controls-dialog'

const { updateMock, clearMock, toastSuccessMock, queryState } = vi.hoisted(() => ({
  updateMock: vi.fn(),
  clearMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  queryState: {
    data: null as null | Record<string, unknown>,
    isFetching: false,
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
      error: null,
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
