import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PurgeQueueDialog } from '@/components/purge-queue-dialog'

const { mutateAsyncMock, toastSuccessMock, mutationState } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  mutationState: { isPending: false },
}))

vi.mock('@/hooks/use-queues', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-queues')>('@/hooks/use-queues')

  return {
    ...actual,
    usePurgeQueue: () => ({
      mutateAsync: mutateAsyncMock,
      isPending: mutationState.isPending,
    }),
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
  },
}))

describe('PurgeQueueDialog', () => {
  beforeEach(() => {
    mutationState.isPending = false
    mutateAsyncMock.mockReset()
    toastSuccessMock.mockReset()
  })

  it('submits keepMostRecent when purging with retention', async () => {
    const user = userEvent.setup()
    mutateAsyncMock.mockResolvedValue({ totalRemoved: 75, keptMostRecent: 25 })
    const onOpenChange = vi.fn()

    render(
      <PurgeQueueDialog
        queueName="emails"
        queueJobCounts={{
          waiting: 100,
          active: 0,
          delayed: 0,
          completed: 0,
          failed: 0,
          paused: 0,
          prioritized: 0,
        }}
        open
        onOpenChange={onOpenChange}
      />
    )

    await user.click(screen.getByLabelText(/All jobs/i))
    await user.clear(screen.getByTestId('purge-queue-keep-most-recent-input'))
    await user.type(screen.getByTestId('purge-queue-keep-most-recent-input'), '25')
    await user.type(screen.getByTestId('purge-queue-confirm-input'), 'emails')
    await user.click(screen.getByRole('button', { name: 'Purge jobs' }))

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1))
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      queueName: 'emails',
      confirmName: 'emails',
      statuses: ['all'],
      keepMostRecent: 25,
    })

    expect(toastSuccessMock).toHaveBeenCalledWith(
      'Queue purge completed',
      expect.objectContaining({
        description: expect.stringContaining('75 jobs'),
      })
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('blocks submission when retain value is invalid', async () => {
    const user = userEvent.setup()

    render(
      <PurgeQueueDialog
        queueName="emails"
        queueJobCounts={{
          waiting: 100,
          active: 0,
          delayed: 0,
          completed: 0,
          failed: 0,
          paused: 0,
          prioritized: 0,
        }}
        open
        onOpenChange={() => {}}
      />
    )

    await user.click(screen.getByLabelText(/All jobs/i))
    await user.type(screen.getByTestId('purge-queue-confirm-input'), 'emails')
    await user.clear(screen.getByTestId('purge-queue-keep-most-recent-input'))
    await user.type(screen.getByTestId('purge-queue-keep-most-recent-input'), 'abc')

    expect(screen.getByText('Enter a whole number between 0 and 1,000,000.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Purge jobs' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Purge jobs' }))
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })
})
