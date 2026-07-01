import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { useCallback, useState } from 'react'
import { RetryJobPhase } from '@/components/retry-job-phase'
import { useRetryJobs } from '@/hooks/use-queues'

interface JobRetryDialogState {
  open: boolean
  phase: RetryJobPhase
  errorMessage: string | null
}

const initialState: JobRetryDialogState = {
  open: false,
  phase: RetryJobPhase.RETRYING,
  errorMessage: null,
}

export function useJobRetryDialog(queueName: string, jobId: string) {
  const [state, setState] = useState(initialState)
  const { mutateAsync: retryJobs } = useRetryJobs()

  const runRetry = useCallback(async () => {
    setState((current) => ({
      ...current,
      phase: RetryJobPhase.RETRYING,
      errorMessage: null,
    }))

    try {
      const result = await retryJobs({
        queueName,
        jobIds: [jobId],
      })

      if (result.success > 0 && result.failed === 0) {
        setState((current) => ({ ...current, phase: RetryJobPhase.SUCCESS }))
        return
      }

      const apiError =
        result.errors.find((entry) => entry.jobId === jobId)?.error ??
        (result.failed > 0
          ? 'The job could not be retried.'
          : 'The job was not in a failed state and could not be retried.')

      setState((current) => ({
        ...current,
        phase: RetryJobPhase.ERROR,
        errorMessage: apiError,
      }))
    } catch (error) {
      setState((current) => ({
        ...current,
        phase: RetryJobPhase.ERROR,
        errorMessage:
          error instanceof Error ? error.message : 'An unexpected error occurred while retrying.',
      }))
    }
  }, [jobId, queueName, retryJobs])

  const openDialog = useCallback(() => {
    setState({ ...initialState, open: true })
    trackEvent(AnalyticsEvents.DIALOG_OPENED, {
      [AnalyticsProperties.DIALOG_TYPE]: DialogType.RETRY_JOB,
    })
    void runRetry()
  }, [runRetry])

  const setOpen = useCallback((open: boolean) => {
    setState((current) =>
      open
        ? { ...current, open: true }
        : { ...initialState }
    )
  }, [])

  return {
    open: state.open,
    phase: state.phase,
    errorMessage: state.errorMessage,
    openDialog,
    setOpen,
    runRetry,
  }
}
