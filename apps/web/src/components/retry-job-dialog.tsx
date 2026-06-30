import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useRetryJobs } from '@/hooks/use-queues'

type RetryPhase = 'retrying' | 'success' | 'error'

interface RetryJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  queueName: string
  jobId: string
  jobName: string
}

export function RetryJobDialog({
  open,
  onOpenChange,
  queueName,
  jobId,
  jobName,
}: RetryJobDialogProps) {
  const { mutateAsync: retryJobs } = useRetryJobs()
  const [phase, setPhase] = useState<RetryPhase>('retrying')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const previousOpenRef = useRef(false)

  const runRetry = useCallback(async () => {
    setPhase('retrying')
    setErrorMessage(null)

    try {
      const result = await retryJobs({
        queueName,
        jobIds: [jobId],
      })

      if (result.success > 0 && result.failed === 0) {
        setPhase('success')
        return
      }

      const apiError =
        result.errors.find((entry) => entry.jobId === jobId)?.error ??
        (result.failed > 0
          ? 'The job could not be retried.'
          : 'The job was not in a failed state and could not be retried.')

      setErrorMessage(apiError)
      setPhase('error')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'An unexpected error occurred while retrying.'
      )
      setPhase('error')
    }
  }, [jobId, queueName, retryJobs])

  useEffect(() => {
    const didOpen = open && !previousOpenRef.current

    if (!open) {
      setPhase('retrying')
      setErrorMessage(null)
    } else if (didOpen) {
      void runRetry()
    }

    previousOpenRef.current = open
  }, [open, runRetry])

  const handleOpenChange = (nextOpen: boolean) => {
    trackEvent(nextOpen ? AnalyticsEvents.DIALOG_OPENED : AnalyticsEvents.DIALOG_CLOSED, {
      [AnalyticsProperties.DIALOG_TYPE]: DialogType.RETRY_JOB,
    })
    onOpenChange(nextOpen)
  }

  const title =
    phase === 'retrying'
      ? 'Retrying Job'
      : phase === 'success'
        ? 'Job Retried'
        : 'Retry Failed'

  const description =
    phase === 'retrying'
      ? 'Sending this job back to the queue. This usually takes just a moment.'
      : phase === 'success'
        ? 'The job was requeued successfully and should start processing again soon.'
        : 'We could not retry this job. Review the details below and try again if needed.'

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && phase === 'retrying') return
        handleOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {phase === 'retrying' ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : phase === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-status-success" />
            ) : (
              <AlertCircle className="h-5 w-5 text-status-danger" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Queue</p>
              <p className="font-mono text-sm break-all">{queueName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Job</p>
              <p className="text-sm font-medium">{jobName}</p>
              <p className="font-mono text-xs text-muted-foreground break-all mt-1">{jobId}</p>
            </div>
          </div>

          {phase === 'retrying' && (
            <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/60 px-4 py-3">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Retry in progress...</p>
            </div>
          )}

          {phase === 'success' && (
            <div className="rounded-lg border border-status-success/30 bg-status-success/10 px-4 py-3">
              <p className="text-sm text-status-success">
                Retry succeeded. The job status on this page will update shortly.
              </p>
            </div>
          )}

          {phase === 'error' && errorMessage && (
            <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-4 py-3">
              <p className="text-sm text-status-danger">{errorMessage}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {phase === 'retrying' ? (
            <Button variant="outline" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Retrying...
            </Button>
          ) : phase === 'success' ? (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => void runRetry()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
