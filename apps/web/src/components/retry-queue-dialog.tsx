import { Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FeatureUpgradeNote } from '@/components/billing/plan-access'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useEntitlement } from '@/hooks/use-entitlement'
import {
  RETRY_QUEUE_STATUSES,
  type RetryQueueStatus,
  type RetryQueueStatusOption,
  useRetryJobs,
} from '@/hooks/use-queues'
import { cn } from '@/lib/utils'

const CHECKBOX_CLASS =
  'h-3.5 w-3.5 shrink-0 cursor-pointer accent-foreground disabled:cursor-not-allowed'

interface QueueJobCounts {
  failed: number
  completed: number
}

interface RetryQueueDialogProps {
  queueName: string
  queueJobCounts?: QueueJobCounts
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STATUS_LABELS: Record<RetryQueueStatus, string> = {
  failed: 'Failed',
  completed: 'Completed',
}

export function RetryQueueDialog({
  queueName,
  queueJobCounts,
  open,
  onOpenChange,
}: RetryQueueDialogProps) {
  const [retryAll, setRetryAll] = useState(false)
  const [selectedStatuses, setSelectedStatuses] = useState<Set<RetryQueueStatus>>(new Set())
  const retryMutation = useRetryJobs()

  useEffect(() => {
    if (!open) {
      setRetryAll(false)
      setSelectedStatuses(new Set())
    }
  }, [open])

  const jobCounts = useMemo(
    () =>
      ({
        failed: queueJobCounts?.failed ?? 0,
        completed: queueJobCounts?.completed ?? 0,
      }) satisfies Record<RetryQueueStatus, number>,
    [queueJobCounts]
  )

  const totalRetryableJobs = Object.values(jobCounts).reduce((sum, count) => sum + count, 0)
  const hasStatusSelection = retryAll || selectedStatuses.size > 0
  const selectedJobsEstimate = retryAll
    ? totalRetryableJobs
    : Array.from(selectedStatuses).reduce((sum, status) => sum + jobCounts[status], 0)
  const canRetry = hasStatusSelection && selectedJobsEstimate > 0
  const isRetrying = retryMutation.isPending
  // Retrying a queue by status is bulk recovery; single-job retry is not.
  const bulkAllowed = useEntitlement().can('jobs.bulk_recovery')

  const toggleStatus = (status: RetryQueueStatus) => {
    if (retryAll) return

    setSelectedStatuses((current) => {
      const next = new Set(current)
      if (next.has(status)) {
        next.delete(status)
      } else {
        next.add(status)
      }
      return next
    })
  }

  const handleRetry = async () => {
    if (!canRetry) return

    const statuses: RetryQueueStatusOption[] = retryAll ? ['all'] : Array.from(selectedStatuses)

    try {
      const result = await retryMutation.mutateAsync({
        queueName,
        statuses,
      })

      toast.success('Queue retry completed', {
        description:
          result.failed > 0
            ? `Retried ${result.success.toLocaleString()} jobs. ${result.failed.toLocaleString()} retries failed.`
            : `Retried ${result.success.toLocaleString()} jobs.`,
      })
      onOpenChange(false)
    } catch {
      // Errors are surfaced by shared API handlers.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Retry queue jobs</DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            Re-enqueue every job in the selected statuses on{' '}
            <code className="break-all rounded-[4px] bg-muted px-1 py-px font-mono text-xs text-foreground">
              {queueName}
            </code>
            .
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-[13px] font-medium leading-none">Statuses to retry</legend>

          <div className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2">
            <label
              htmlFor="retry-all-jobs"
              className="flex h-9 cursor-pointer items-center gap-2.5 bg-card px-3 text-[13px] transition-colors hover:bg-muted/60 sm:col-span-2"
            >
              <input
                id="retry-all-jobs"
                type="checkbox"
                checked={retryAll}
                onChange={(e) => {
                  setRetryAll(e.target.checked)
                  if (e.target.checked) {
                    setSelectedStatuses(new Set())
                  }
                }}
                className={CHECKBOX_CLASS}
              />
              <span className="font-medium">All retryable jobs</span>
              <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                {totalRetryableJobs.toLocaleString()}
              </span>
            </label>

            {RETRY_QUEUE_STATUSES.map((status) => (
              <label
                key={status}
                htmlFor={`retry-status-${status}`}
                className={cn(
                  'flex h-9 items-center gap-2.5 bg-card px-3 text-[13px] transition-colors',
                  retryAll
                    ? 'cursor-not-allowed text-muted-foreground'
                    : 'cursor-pointer hover:bg-muted/60'
                )}
              >
                <input
                  id={`retry-status-${status}`}
                  type="checkbox"
                  checked={retryAll || selectedStatuses.has(status)}
                  onChange={() => toggleStatus(status)}
                  disabled={retryAll}
                  className={CHECKBOX_CLASS}
                />
                <span>{STATUS_LABELS[status]}</span>
                <span
                  className={cn(
                    'ml-auto font-mono text-xs tabular-nums',
                    jobCounts[status] === 0 ? 'text-faint' : 'text-muted-foreground'
                  )}
                >
                  {jobCounts[status].toLocaleString()}
                </span>
              </label>
            ))}
          </div>

          <p className="pt-0.5 text-xs text-muted-foreground">
            {!hasStatusSelection
              ? 'Select one or more statuses (or All retryable jobs) to continue.'
              : selectedJobsEstimate > 0
                ? `Estimated jobs to retry: ${selectedJobsEstimate.toLocaleString()}`
                : 'No jobs currently match the selected statuses.'}
          </p>
        </fieldset>

        <FeatureUpgradeNote feature="jobs.bulk_recovery" />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRetrying}>
            Cancel
          </Button>
          <Button onClick={handleRetry} disabled={!canRetry || isRetrying || !bulkAllowed}>
            {isRetrying ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {isRetrying ? 'Retrying…' : 'Retry jobs'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
