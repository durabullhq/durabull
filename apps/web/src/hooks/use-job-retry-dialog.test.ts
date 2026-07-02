import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RetryJobRequestState, useJobRetryDialog } from '@/hooks/use-job-retry-dialog'

const {
  mutateAsyncMock,
  trackEventMock,
  fetchQueryMock,
  invalidateQueriesMock,
  useJobMock,
  useJobLogTailMock,
  fetchJobLogTailMock,
  logTailRefetchMock,
} = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
  trackEventMock: vi.fn(),
  fetchQueryMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  useJobMock: vi.fn(),
  useJobLogTailMock: vi.fn(),
  fetchJobLogTailMock: vi.fn(),
  logTailRefetchMock: vi.fn(),
}))

vi.mock('@durabull/analytics/browser', () => ({
  trackEvent: trackEventMock,
}))

vi.mock('@durabull/analytics/events', () => ({
  AnalyticsEvents: {
    DIALOG_OPENED: 'DIALOG_OPENED',
  },
  AnalyticsProperties: {
    DIALOG_TYPE: 'dialog_type',
  },
  DialogType: {
    RETRY_JOB: 'retry_job',
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    fetchQuery: fetchQueryMock,
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-queues', () => ({
  fetchJobLogTail: fetchJobLogTailMock,
  useJob: useJobMock,
  useJobLogTail: useJobLogTailMock,
  useRetryJobs: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
  useConnectionIdFromContextOrRoute: () => 'conn-1',
  queryKeys: {
    job: (connectionId: string, queueName: string, jobId: string) => [
      'job',
      connectionId,
      queueName,
      jobId,
    ],
    jobLogs: (connectionId: string, queueName: string, jobId: string) => [
      'job',
      connectionId,
      queueName,
      jobId,
      'logs',
    ],
    jobLogTail: (connectionId: string, queueName: string, jobId: string, start: number) => [
      'job',
      connectionId,
      queueName,
      jobId,
      'logs',
      'tail',
      start,
    ],
    queue: (connectionId: string, queueName: string) => ['queue', connectionId, queueName],
  },
}))

function makeJob(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'job-123',
    name: 'send-email',
    status,
    attemptsMade: 1,
    maxAttempts: 3,
    timestamp: Date.now(),
    delay: 0,
    ...extra,
  }
}

let jobData: ReturnType<typeof makeJob> | null
let jobError: Error | null
let logTailData: { logs: string[]; count: number; start: number; hasMore: boolean } | undefined
let logTailError: Error | null

describe('useJobRetryDialog', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
    trackEventMock.mockReset()
    fetchQueryMock.mockReset()
    invalidateQueriesMock.mockReset()
    useJobMock.mockReset()
    useJobLogTailMock.mockReset()
    fetchJobLogTailMock.mockReset()
    logTailRefetchMock.mockReset()
    jobData = null
    jobError = null
    logTailData = undefined
    logTailError = null
    mutateAsyncMock.mockResolvedValue({ success: 1, failed: 0, errors: [] })
    fetchQueryMock.mockResolvedValue({ logs: [], count: 2, start: 0, hasMore: false })
    fetchJobLogTailMock.mockResolvedValue({ logs: [], count: 2, start: 0, hasMore: false })
    logTailRefetchMock.mockResolvedValue({ data: { logs: [], count: 2, start: 2, hasMore: false } })
    useJobMock.mockImplementation(() => ({ data: jobData, error: jobError }))
    useJobLogTailMock.mockImplementation(() => ({
      data: logTailData,
      error: logTailError,
      refetch: logTailRefetchMock,
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens, snapshots log count, retries, and enters watching state', async () => {
    const { result } = renderHook(() => useJobRetryDialog('emails', 'job-123'))

    await act(async () => {
      result.current.openDialog()
    })

    expect(result.current.open).toBe(true)
    expect(fetchQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['job', 'conn-1', 'emails', 'job-123', 'logs', 'tail', 0],
      })
    )
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      queueName: 'emails',
      jobIds: ['job-123'],
    })
    await waitFor(() => {
      expect(result.current.requestState).toBe(RetryJobRequestState.WATCHING)
      expect(useJobLogTailMock).toHaveBeenLastCalledWith(
        'emails',
        'job-123',
        2,
        expect.objectContaining({ enabled: true, refetchInterval: 1000 })
      )
    })
  })

  it('still submits the retry when the auxiliary log snapshot fails', async () => {
    fetchQueryMock.mockRejectedValue(new Error('logs unavailable'))
    const { result } = renderHook(() => useJobRetryDialog('emails', 'job-123'))

    await act(async () => {
      result.current.openDialog()
    })

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      queueName: 'emails',
      jobIds: ['job-123'],
    })
    await waitFor(() => {
      expect(result.current.requestState).toBe(RetryJobRequestState.WATCHING)
      expect(useJobLogTailMock).toHaveBeenLastCalledWith(
        'emails',
        'job-123',
        0,
        expect.objectContaining({ enabled: true, refetchInterval: 1000 })
      )
    })
  })

  it('derives status from the polled job query instead of mirroring phases', async () => {
    const { result, rerender } = renderHook(() => useJobRetryDialog('emails', 'job-123'))
    await act(async () => {
      result.current.openDialog()
    })

    jobData = makeJob('active')
    rerender()

    expect(result.current.jobStatus).toBe('active')
    expect(result.current.isTerminal).toBe(false)
  })

  it('appends tail logs and advances the next tail offset', async () => {
    const { result, rerender } = renderHook(() => useJobRetryDialog('emails', 'job-123'))
    await act(async () => {
      result.current.openDialog()
    })

    logTailData = { logs: ['line 1', 'line 2'], count: 4, start: 2, hasMore: false }
    rerender()

    await waitFor(() => {
      expect(result.current.logEntries).toEqual([
        { id: 2, line: 'line 1' },
        { id: 3, line: 'line 2' },
      ])
    })
    expect(useJobLogTailMock).toHaveBeenLastCalledWith(
      'emails',
      'job-123',
      4,
      expect.objectContaining({ enabled: true, refetchInterval: 1000 })
    )
  })

  it('sets stillRunning after 60s of non-terminal polling', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useJobRetryDialog('emails', 'job-123'))
    await act(async () => {
      await result.current.runRetry()
    })
    expect(result.current.requestState).toBe(RetryJobRequestState.WATCHING)

    expect(result.current.stillRunning).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(result.current.stillRunning).toBe(true)
    expect(result.current.requestState).toBe(RetryJobRequestState.WATCHING)
    vi.useRealTimers()
  })

  it('sets error phase when the retry request fails', async () => {
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
      expect(result.current.requestState).toBe(RetryJobRequestState.ERROR)
      expect(result.current.errorMessage).toBe('Job is locked')
    })
  })

  it('surfaces polling errors without retrying the mutation or deleting anything', async () => {
    const { result, rerender } = renderHook(() => useJobRetryDialog('emails', 'job-123'))
    await act(async () => {
      result.current.openDialog()
    })

    jobError = new Error('poll failed')
    rerender()

    expect(result.current.watchError).toBe('poll failed')
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
  })

  it('stops polling, invalidates, and resets state when dialog closes', async () => {
    const { result } = renderHook(() => useJobRetryDialog('emails', 'job-123'))
    await act(async () => {
      result.current.openDialog()
    })

    await act(() => {
      result.current.setOpen(false)
    })

    expect(result.current.open).toBe(false)
    expect(result.current.requestState).toBe(RetryJobRequestState.IDLE)
    expect(result.current.logEntries).toEqual([])
    expect(invalidateQueriesMock).toHaveBeenCalled()
  })

  it('ignores stale retry completions after the dialog closes', async () => {
    let resolveSnapshot: (value: { logs: string[]; count: number; start: number; hasMore: boolean }) => void
    fetchQueryMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSnapshot = resolve
      })
    )

    const { result } = renderHook(() => useJobRetryDialog('emails', 'job-123'))

    act(() => {
      result.current.openDialog()
    })
    await act(() => {
      result.current.setOpen(false)
    })
    await act(async () => {
      resolveSnapshot({ logs: [], count: 2, start: 0, hasMore: false })
      await Promise.resolve()
    })

    expect(mutateAsyncMock).not.toHaveBeenCalled()
    expect(result.current.open).toBe(false)
    expect(result.current.requestState).toBe(RetryJobRequestState.IDLE)
  })

  it('tracks dialog opened analytics from openDialog', async () => {
    const { result } = renderHook(() => useJobRetryDialog('emails', 'job-123'))
    await act(async () => {
      result.current.openDialog()
    })

    expect(trackEventMock).toHaveBeenCalledWith('DIALOG_OPENED', {
      dialog_type: 'retry_job',
    })
  })

  it('refetches final logs and invalidates cache when the watched job becomes terminal', async () => {
    const { result, rerender } = renderHook(() => useJobRetryDialog('emails', 'job-123'))
    await act(async () => {
      result.current.openDialog()
    })

    jobData = makeJob('completed')
    rerender()

    expect(result.current.isTerminal).toBe(true)
    expect(logTailRefetchMock).toHaveBeenCalled()
    await waitFor(() => {
      expect(invalidateQueriesMock).toHaveBeenCalled()
    })
  })
})
