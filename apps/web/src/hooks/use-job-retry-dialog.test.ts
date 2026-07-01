import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useJobRetryDialog } from '@/hooks/use-job-retry-dialog'

const { mutateAsyncMock } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
}))

vi.mock('@/hooks/use-queues', () => ({
  useRetryJobs: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}))

describe('useJobRetryDialog', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
  })

  it('opens dialog and runs retry from openDialog', async () => {
    mutateAsyncMock.mockResolvedValue({ success: 1, failed: 0, errors: [] })

    const { result } = renderHook(() => useJobRetryDialog('emails', 'job-123'))

    await act(async () => {
      result.current.openDialog()
    })

    await waitFor(() => {
      expect(result.current.open).toBe(true)
    })
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      queueName: 'emails',
      jobIds: ['job-123'],
    })

    await waitFor(() => {
      expect(result.current.phase).toBe('success')
    })
  })

  it('sets error phase when retry fails', async () => {
    mutateAsyncMock.mockResolvedValue({
      success: 0,
      failed: 1,
      errors: [{ jobId: 'job-123', error: 'Job is locked' }],
    })

    const { result } = renderHook(() => useJobRetryDialog('emails', 'job-123'))

    await act(async () => {
      result.current.openDialog()
    })

    await waitFor(() => {
      expect(result.current.phase).toBe('error')
      expect(result.current.errorMessage).toBe('Job is locked')
    })
  })

  it('resets state when dialog closes', async () => {
    mutateAsyncMock.mockResolvedValue({ success: 1, failed: 0, errors: [] })

    const { result } = renderHook(() => useJobRetryDialog('emails', 'job-123'))

    await act(async () => {
      result.current.openDialog()
    })

    await waitFor(() => {
      expect(result.current.phase).toBe('success')
    })

    await act(() => {
      result.current.setOpen(false)
    })

    await waitFor(() => {
      expect(result.current.open).toBe(false)
    })
    expect(result.current.phase).toBe('retrying')
    expect(result.current.errorMessage).toBeNull()
  })
})
