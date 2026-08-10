import { Info, RefreshCw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { RetryCountdown } from '@/components/retry-countdown'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import {
  isTerminalJobStatus,
  type RetryJobLogEntry,
  RetryJobRequestState,
  type useJobRetryDialog,
} from '@/hooks/use-job-retry-dialog'
import type { GetJobResponse } from '@/hooks/use-queues'
import { JOB_STATUS } from '@/lib/constants'

type RetryJobDialogController = ReturnType<typeof useJobRetryDialog>

interface RetryBackoffConfig {
  type?: 'fixed' | 'exponential'
  delay?: number
}

interface RetryJobProgressProps {
  retry: RetryJobDialogController
  onClose: () => void
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

function LogStream({ entries, inFlight }: { entries: RetryJobLogEntry[]; inFlight: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const entryCount = entries.length

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

export function RetryJobProgress({ retry, onClose }: RetryJobProgressProps) {
  const { requestState, jobStatus, logEntries, stillRunning, job, watchError } = retry
  const terminal = isTerminalJobStatus(jobStatus)
  const inFlight = requestState === RetryJobRequestState.RETRYING || (retry.isWatching && !terminal)
  const failedReason = jobStatus === JOB_STATUS.FAILED ? (job?.failedReason ?? null) : null
  const showLogs =
    retry.isWatching &&
    requestState !== RetryJobRequestState.ERROR &&
    (inFlight || logEntries.length > 0)

  return (
    <>
      <div className="space-y-4">
        {jobStatus === JOB_STATUS.DELAYED && job ? (
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
        ) : null}

        {showLogs ? <LogStream entries={logEntries} inFlight={inFlight} /> : null}

        {inFlight && stillRunning && jobStatus !== JOB_STATUS.DELAYED ? (
          <div className="flex items-start gap-3 rounded-lg border border-status-delayed/30 bg-status-delayed/10 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-delayed" />
            <p className="text-sm text-status-delayed">
              This job is still running. It's safe to close this dialog — the job will keep running
              in the background.
            </p>
          </div>
        ) : null}

        {watchError ? (
          <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-4 py-3">
            <p className="text-sm text-status-danger">
              Could not refresh this job yet. Retrying automatically...
            </p>
          </div>
        ) : null}

        {jobStatus === JOB_STATUS.COMPLETED ? (
          <div className="rounded-lg border border-status-success/30 bg-status-success/10 px-4 py-3">
            <p className="text-sm text-status-success">The job completed successfully.</p>
          </div>
        ) : null}

        {jobStatus === JOB_STATUS.FAILED ? (
          <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-4 py-3">
            <p className="mb-1 text-sm font-medium text-status-danger">The job failed again.</p>
            {failedReason ? (
              <p className="whitespace-pre-wrap break-all font-mono text-xs text-status-danger">
                {failedReason}
              </p>
            ) : null}
          </div>
        ) : null}

        {requestState === RetryJobRequestState.ERROR && retry.errorMessage ? (
          <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-4 py-3">
            <p className="text-sm text-status-danger">{retry.errorMessage}</p>
          </div>
        ) : null}
      </div>

      <DialogFooter>
        {jobStatus === JOB_STATUS.COMPLETED ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {jobStatus === JOB_STATUS.FAILED || requestState === RetryJobRequestState.ERROR ? (
              <Button onClick={retry.backToReview}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {jobStatus === JOB_STATUS.FAILED ? 'Retry Again' : 'Try Again'}
              </Button>
            ) : null}
          </>
        )}
      </DialogFooter>
    </>
  )
}
