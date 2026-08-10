import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchJobLogTail,
  type JobLogTailResponse,
  queryKeys,
  useConnectionIdFromContextOrRoute,
  useJob,
  useJobLogTail,
  useRetryJob,
} from '@/hooks/use-queues'
import { JOB_STATUS, type JobStatus } from '@/lib/constants'

const POLL_INTERVAL_MS = 1_000
const STILL_RUNNING_AFTER_MS = 60_000

export interface RetryJobLogEntry {
  id: number
  line: string
}

export const RetryJobRequestState = {
  IDLE: 'idle',
  REVIEW: 'review',
  RETRYING: 'retrying',
  WATCHING: 'watching',
  ERROR: 'error',
} as const

export type RetryJobRequestState = (typeof RetryJobRequestState)[keyof typeof RetryJobRequestState]

interface JobRetryDialogState {
  open: boolean
  requestState: RetryJobRequestState
  errorMessage: string | null
  logStart: number | null
  logEntries: RetryJobLogEntry[]
  stillRunning: boolean
}

const initialState: JobRetryDialogState = {
  open: false,
  requestState: RetryJobRequestState.IDLE,
  errorMessage: null,
  logStart: null,
  logEntries: [],
  stillRunning: false,
}

export function isTerminalJobStatus(status: string | undefined): boolean {
  return status === JOB_STATUS.COMPLETED || status === JOB_STATUS.FAILED
}

function appendLogEntries(
  current: RetryJobLogEntry[],
  tail: JobLogTailResponse | undefined
): RetryJobLogEntry[] {
  if (!tail?.logs.length) return current
  return [
    ...current,
    ...tail.logs.map((line, index) => ({
      id: tail.start + index,
      line,
    })),
  ]
}

export function useJobRetryDialog(queueName: string, jobId: string) {
  const [state, setState] = useState(initialState)
  const { mutateAsync: retryJob } = useRetryJob()
  const queryClient = useQueryClient()
  const connectionId = useConnectionIdFromContextOrRoute()
  const retryRunIdRef = useRef(0)
  const isWatching = state.requestState === RetryJobRequestState.WATCHING
  const logOffset = state.logStart == null ? null : state.logStart + state.logEntries.length

  const jobQuery = useJob(queueName, jobId, {
    enabled: isWatching,
    refetchInterval: isWatching ? POLL_INTERVAL_MS : false,
  })
  const job = jobQuery.data ?? null
  const terminal = isTerminalJobStatus(job?.status)
  const logTailQuery = useJobLogTail(queueName, jobId, logOffset, {
    enabled: isWatching,
    refetchInterval: isWatching && !terminal ? POLL_INTERVAL_MS : false,
  })

  const invalidateJobQueries = useCallback(() => {
    if (!connectionId) return
    queryClient.invalidateQueries({ queryKey: queryKeys.job(connectionId, queueName, jobId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.jobLogs(connectionId, queueName, jobId) })
    queryClient.invalidateQueries({ queryKey: ['jobs', connectionId, queueName] })
    queryClient.invalidateQueries({ queryKey: queryKeys.queue(connectionId, queueName) })
  }, [connectionId, jobId, queryClient, queueName])

  const runRetry = useCallback(
    async (data?: unknown) => {
      const retryRunId = retryRunIdRef.current + 1
      retryRunIdRef.current = retryRunId

      setState((current) => ({
        ...initialState,
        open: current.open,
        requestState: RetryJobRequestState.RETRYING,
      }))

      try {
        if (!connectionId) {
          throw new Error('Connection is still loading. Try again in a moment.')
        }

        let logStart = 0
        try {
          const snapshot = await queryClient.fetchQuery({
            queryKey: queryKeys.jobLogTail(connectionId, queueName, jobId, 0),
            queryFn: () => fetchJobLogTail({ connectionId, queueName, jobId, start: 0 }),
          })
          logStart = snapshot.count
        } catch {
          // Log history is auxiliary; a transient log read failure must not
          // prevent the actual retry request from being submitted.
        }

        if (retryRunIdRef.current !== retryRunId) return

        await retryJob({
          queueName,
          jobId,
          ...(data !== undefined ? { data } : {}),
        })

        if (retryRunIdRef.current !== retryRunId) return

        setState((current) => ({
          ...current,
          requestState: RetryJobRequestState.WATCHING,
          logStart,
        }))
      } catch (error) {
        if (retryRunIdRef.current !== retryRunId) return

        setState((current) => ({
          ...current,
          requestState: RetryJobRequestState.ERROR,
          errorMessage:
            error instanceof Error ? error.message : 'An unexpected error occurred while retrying.',
        }))
      }
    },
    [connectionId, jobId, queryClient, queueName, retryJob]
  )

  const openDialog = useCallback(() => {
    setState({ ...initialState, open: true, requestState: RetryJobRequestState.REVIEW })
    trackEvent(AnalyticsEvents.DIALOG_OPENED, {
      [AnalyticsProperties.DIALOG_TYPE]: DialogType.RETRY_JOB,
    })
  }, [])

  const backToReview = useCallback(() => {
    // Invalidate any in-flight run so a late resolution cannot push us back
    // into WATCHING after the user has returned to review.
    retryRunIdRef.current += 1
    setState((current) => ({
      ...current,
      requestState: RetryJobRequestState.REVIEW,
      errorMessage: null,
      logStart: null,
      logEntries: [],
      stillRunning: false,
    }))
  }, [])

  const setOpen = useCallback(
    (open: boolean) => {
      if (open) {
        setState((current) => ({ ...current, open: true }))
        return
      }
      // Closing never cancels the job; it keeps running server-side.
      retryRunIdRef.current += 1
      invalidateJobQueries()
      setState({ ...initialState })
    },
    [invalidateJobQueries]
  )

  useEffect(() => {
    if (!isWatching || terminal) return
    const timer = setTimeout(() => {
      setState((current) => ({ ...current, stillRunning: true }))
    }, STILL_RUNNING_AFTER_MS)

    return () => clearTimeout(timer)
  }, [isWatching, terminal])

  useEffect(() => {
    if (!logTailQuery.data || logOffset == null) return

    setState((current) => {
      if (current.requestState !== RetryJobRequestState.WATCHING) return current
      const currentOffset =
        current.logStart == null ? null : current.logStart + current.logEntries.length
      if (currentOffset !== logTailQuery.data.start) return current
      return {
        ...current,
        logEntries: appendLogEntries(current.logEntries, logTailQuery.data),
      }
    })
  }, [logOffset, logTailQuery.data])

  useEffect(() => {
    if (!terminal || !isWatching || logOffset == null) return

    void logTailQuery.refetch().finally(() => {
      invalidateJobQueries()
    })
  }, [invalidateJobQueries, isWatching, logOffset, logTailQuery.refetch, terminal])

  const jobStatus = job?.status as JobStatus | undefined

  const logTailError = logTailQuery.error instanceof Error ? logTailQuery.error.message : null
  const jobPollError = jobQuery.error instanceof Error ? jobQuery.error.message : null
  const watchError = isWatching ? (jobPollError ?? logTailError) : null

  return {
    open: state.open,
    requestState: state.requestState,
    errorMessage: state.errorMessage,
    logEntries: state.logEntries,
    stillRunning: state.stillRunning,
    job,
    jobStatus,
    watchError,
    isWatching,
    isTerminal: terminal,
    openDialog,
    setOpen,
    runRetry,
    backToReview,
  }
}
