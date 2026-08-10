import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { AlertCircle, CheckCircle2, ChevronDown, Info, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { hasJobPayloadChanged, JobPayloadEditor } from '@/components/job-payload-editor'
import { RetryCountdown } from '@/components/retry-countdown'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  isTerminalJobStatus,
  type RetryJobLogEntry,
  RetryJobRequestState,
  type useJobRetryDialog,
} from '@/hooks/use-job-retry-dialog'
import type { GetJobResponse } from '@/hooks/use-queues'
import { JOB_STATUS } from '@/lib/constants'
import { cn } from '@/lib/utils'

type RetryJobDialogController = ReturnType<typeof useJobRetryDialog>

interface RetryJobDialogProps {
  queueName: string
  jobId: string
  jobName: string
  jobData: unknown
  retry: RetryJobDialogController
}

interface RetryBackoffConfig {
  type?: 'fixed' | 'exponential'
  delay?: number
}

function getRetryBackoff(opts: GetJobResponse['opts'] | undefined): RetryBackoffConfig | undefined {
  const backoff = opts?.backoff
  if (!backoff || typeof backoff !== 'object') return undefined

  const record = backoff as Record<string, unknown>
  return {
    type: record.type === 'fixed' || record.type === 'exponential' ? record.type : undefined,
    delay: typeof record.delay === 'number' ? record.delay : undefined,
  }
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

function LogStream({ entries, inFlight }: { entries: RetryJobLogEntry[]; inFlight: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const entryCount = entries.length

  // Pin the scroll position to the newest line only when new content arrives.
  useEffect(() => {
    if (entryCount === 0) return
    const node = containerRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [entryCount])

  return (
    <div
      ref={containerRef}
      data-testid="retry-log-stream"
      className="max-h-48 overflow-y-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs"
    >
      {entries.length === 0 && inFlight ? (
        <p className="text-muted-foreground">Waiting for logs...</p>
      ) : (
        entries.map((entry) => (
          <p key={entry.id} className="whitespace-pre-wrap break-all leading-5">
            {entry.line}
          </p>
        ))
      )}
    </div>
  )
}

export function RetryJobDialog({ queueName, jobId, jobName, jobData, retry }: RetryJobDialogProps) {
  const [editorValue, setEditorValue] = useState<unknown>(jobData)
  const [isJsonValid, setIsJsonValid] = useState(true)
  const [payloadExpanded, setPayloadExpanded] = useState(false)
  const [overwriteAcknowledged, setOverwriteAcknowledged] = useState(false)

  const isReview = retry.requestState === RetryJobRequestState.REVIEW

  useEffect(() => {
    if (!isReview) return
    setEditorValue(jobData)
    setIsJsonValid(true)
    setPayloadExpanded(false)
    setOverwriteAcknowledged(false)
  }, [isReview, jobData])

  const handleOpenChange = (nextOpen: boolean) => {
    trackEvent(nextOpen ? AnalyticsEvents.DIALOG_OPENED : AnalyticsEvents.DIALOG_CLOSED, {
      [AnalyticsProperties.DIALOG_TYPE]: DialogType.RETRY_JOB,
    })
    retry.setOpen(nextOpen)
  }

  const { requestState, jobStatus, logEntries, stillRunning, job, watchError } = retry
  const { title, description } = getDialogCopy({ requestState, jobStatus })
  const terminal = isTerminalJobStatus(jobStatus)
  const inFlight = requestState === RetryJobRequestState.RETRYING || (retry.isWatching && !terminal)
  const failedReason = jobStatus === JOB_STATUS.FAILED ? (job?.failedReason ?? null) : null
  const showLogs =
    retry.isWatching &&
    requestState !== RetryJobRequestState.ERROR &&
    (inFlight || logEntries.length > 0)

  const payloadChanged = hasJobPayloadChanged(jobData, editorValue, isJsonValid)
  const primaryDisabled = !isJsonValid || (payloadChanged && !overwriteAcknowledged)

  const handlePrimaryAction = () => {
    if (primaryDisabled) return
    if (payloadChanged) {
      void retry.runRetry({ jobData: editorValue })
      return
    }
    void retry.runRetry()
  }

  return (
    <Dialog open={retry.open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReview ? (
              <RefreshCw className="h-5 w-5 text-muted-foreground" />
            ) : inFlight ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : jobStatus === JOB_STATUS.COMPLETED ? (
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

          {isReview ? (
            <>
              <Collapsible open={payloadExpanded} onOpenChange={setPayloadExpanded}>
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-left text-sm font-medium hover:bg-muted/40">
                  <span>Edit job payload</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      payloadExpanded && 'rotate-180'
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pt-3">
                    <JobPayloadEditor
                      original={jobData}
                      value={editorValue}
                      onChange={(value, isValid) => {
                        setEditorValue(value)
                        setIsJsonValid(isValid)
                      }}
                      minHeight="180px"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {payloadChanged ? (
                <div className="flex items-start gap-3 rounded-lg border px-4 py-3">
                  <input
                    id="retry-overwrite-ack"
                    type="checkbox"
                    checked={overwriteAcknowledged}
                    onChange={(e) => setOverwriteAcknowledged(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300"
                  />
                  <Label htmlFor="retry-overwrite-ack" className="text-sm font-normal leading-5">
                    I understand, overwrite the stored payload and retry with it.
                  </Label>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {jobStatus === JOB_STATUS.DELAYED && job && (
                <RetryCountdown
                  processedOn={job.processedOn ?? undefined}
                  finishedOn={job.finishedOn ?? undefined}
                  attemptsMade={job.attemptsMade}
                  maxAttempts={job.maxAttempts}
                  backoff={getRetryBackoff(job.opts)}
                  status={job.status}
                  timestamp={job.timestamp}
                  delay={job.delay}
                />
              )}

              {showLogs && (inFlight || logEntries.length > 0) && (
                <LogStream entries={logEntries} inFlight={inFlight} />
              )}

              {inFlight && stillRunning && jobStatus !== JOB_STATUS.DELAYED && (
                <div className="flex items-start gap-3 rounded-lg border border-status-delayed/30 bg-status-delayed/10 px-4 py-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-delayed" />
                  <p className="text-sm text-status-delayed">
                    This job is still running. It's safe to close this dialog — the job will keep
                    running in the background.
                  </p>
                </div>
              )}

              {watchError && (
                <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-4 py-3">
                  <p className="text-sm text-status-danger">
                    Could not refresh this job yet. Retrying automatically...
                  </p>
                </div>
              )}

              {jobStatus === JOB_STATUS.COMPLETED && (
                <div className="rounded-lg border border-status-success/30 bg-status-success/10 px-4 py-3">
                  <p className="text-sm text-status-success">The job completed successfully.</p>
                </div>
              )}

              {jobStatus === JOB_STATUS.FAILED && (
                <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-4 py-3">
                  <p className="text-sm font-medium text-status-danger mb-1">
                    The job failed again.
                  </p>
                  {failedReason && (
                    <p className="font-mono text-xs text-status-danger break-all whitespace-pre-wrap">
                      {failedReason}
                    </p>
                  )}
                </div>
              )}

              {requestState === RetryJobRequestState.ERROR && retry.errorMessage && (
                <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-4 py-3">
                  <p className="text-sm text-status-danger">{retry.errorMessage}</p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {isReview ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant={payloadChanged ? 'destructive' : 'default'}
                onClick={handlePrimaryAction}
                disabled={primaryDisabled}
              >
                {payloadChanged ? 'Overwrite Payload & Retry' : 'Retry Job'}
              </Button>
            </>
          ) : jobStatus === JOB_STATUS.COMPLETED ? (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
              {(jobStatus === JOB_STATUS.FAILED || requestState === RetryJobRequestState.ERROR) && (
                <Button onClick={() => retry.backToReview()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {jobStatus === JOB_STATUS.FAILED ? 'Retry Again' : 'Try Again'}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
