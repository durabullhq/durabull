import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { RetryJobPhase } from '@/components/retry-job-phase'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface RetryJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  queueName: string
  jobId: string
  jobName: string
  phase: RetryJobPhase
  errorMessage: string | null
  onRetry: () => void
}

export function RetryJobDialog({
  open,
  onOpenChange,
  queueName,
  jobId,
  jobName,
  phase,
  errorMessage,
  onRetry,
}: RetryJobDialogProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    trackEvent(nextOpen ? AnalyticsEvents.DIALOG_OPENED : AnalyticsEvents.DIALOG_CLOSED, {
      [AnalyticsProperties.DIALOG_TYPE]: DialogType.RETRY_JOB,
    })
    onOpenChange(nextOpen)
  }

  const title =
    phase === RetryJobPhase.RETRYING
      ? 'Retrying Job'
      : phase === RetryJobPhase.SUCCESS
        ? 'Job Retried'
        : 'Retry Failed'

  const description =
    phase === RetryJobPhase.RETRYING
      ? 'Sending this job back to the queue. This usually takes just a moment.'
      : phase === RetryJobPhase.SUCCESS
        ? 'The job was requeued successfully and should start processing again soon.'
        : 'We could not retry this job. Review the details below and try again if needed.'

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && phase === RetryJobPhase.RETRYING) return
        handleOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {phase === RetryJobPhase.RETRYING ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : phase === RetryJobPhase.SUCCESS ? (
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

          {phase === RetryJobPhase.RETRYING && (
            <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/60 px-4 py-3">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Retry in progress...</p>
            </div>
          )}

          {phase === RetryJobPhase.SUCCESS && (
            <div className="rounded-lg border border-status-success/30 bg-status-success/10 px-4 py-3">
              <p className="text-sm text-status-success">
                Retry succeeded. The job status on this page will update shortly.
              </p>
            </div>
          )}

          {phase === RetryJobPhase.ERROR && errorMessage && (
            <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-4 py-3">
              <p className="text-sm text-status-danger">{errorMessage}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {phase === RetryJobPhase.RETRYING ? (
            <Button variant="outline" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Retrying...
            </Button>
          ) : phase === RetryJobPhase.SUCCESS ? (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
              <Button onClick={onRetry}>
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
