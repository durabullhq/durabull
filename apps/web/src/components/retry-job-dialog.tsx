import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { RetryJobProgress } from '@/components/retry-job-progress'
import { RetryJobReview } from '@/components/retry-job-review'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  isTerminalJobStatus,
  RetryJobRequestState,
  type useJobRetryDialog,
} from '@/hooks/use-job-retry-dialog'
import { JOB_STATUS } from '@/lib/constants'
import { getJobPayloadKey } from '@/lib/job-payload'

type RetryJobDialogController = ReturnType<typeof useJobRetryDialog>

interface RetryJobDialogProps {
  queueName: string
  jobId: string
  jobName: string
  jobData: unknown
  retry: RetryJobDialogController
}

function getDialogCopy({
  requestState,
  jobStatus,
}: {
  requestState: RetryJobDialogController['requestState']
  jobStatus: RetryJobDialogController['jobStatus']
}) {
  if (requestState === RetryJobRequestState.REVIEW) {
    return {
      title: 'Review Before Retry',
      description:
        'The job has not been retried yet. Confirm a plain retry, or expand the payload to overwrite it first.',
    }
  }

  if (requestState === RetryJobRequestState.RETRYING) {
    return {
      title: 'Retrying Job',
      description: 'Sending this job back to the queue...',
    }
  }

  if (requestState === RetryJobRequestState.ERROR) {
    return {
      title: 'Retry Failed',
      description: 'We could not retry this job. Review the details below and try again if needed.',
    }
  }

  if (jobStatus === JOB_STATUS.COMPLETED) {
    return {
      title: 'Job Completed',
      description: 'The retried job finished successfully.',
    }
  }

  if (jobStatus === JOB_STATUS.FAILED) {
    return {
      title: 'Job Failed',
      description: 'The retried job ran but finished in a failed state.',
    }
  }

  if (jobStatus === JOB_STATUS.DELAYED) {
    return {
      title: 'Waiting for Retry',
      description: 'The attempt failed and the job is waiting for its automatic retry backoff.',
    }
  }

  return {
    title: 'Job Running',
    description: 'The job was requeued. Watching status and logs until it finishes.',
  }
}

export function RetryJobDialog({ queueName, jobId, jobName, jobData, retry }: RetryJobDialogProps) {
  const isReview = retry.requestState === RetryJobRequestState.REVIEW

  const handleOpenChange = (nextOpen: boolean) => {
    trackEvent(nextOpen ? AnalyticsEvents.DIALOG_OPENED : AnalyticsEvents.DIALOG_CLOSED, {
      [AnalyticsProperties.DIALOG_TYPE]: DialogType.RETRY_JOB,
    })
    retry.setOpen(nextOpen)
  }

  const { requestState, jobStatus } = retry
  const { title, description } = getDialogCopy({ requestState, jobStatus })
  const terminal = isTerminalJobStatus(jobStatus)
  const inFlight = requestState === RetryJobRequestState.RETRYING || (retry.isWatching && !terminal)

  return (
    <Dialog open={retry.open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReview ? null : inFlight ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : jobStatus === JOB_STATUS.COMPLETED ? (
              <CheckCircle2 className="h-4 w-4 text-status-success" />
            ) : (
              <AlertCircle className="h-4 w-4 text-status-danger" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs leading-5">
          <dt className="text-muted-foreground">Queue</dt>
          <dd className="break-all font-mono">{queueName}</dd>
          {jobName ? (
            <>
              <dt className="text-muted-foreground">Job</dt>
              <dd className="break-all font-medium">{jobName}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">ID</dt>
          <dd className="break-all font-mono">{jobId}</dd>
        </dl>

        {isReview ? (
          <RetryJobReview
            key={getJobPayloadKey(jobData)}
            jobData={jobData}
            onCancel={() => handleOpenChange(false)}
            onRetry={retry.runRetry}
          />
        ) : (
          <RetryJobProgress retry={retry} onClose={() => handleOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}
