import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { Loader2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  PURGE_QUEUE_STATUSES,
  type PurgeQueueStatus,
  type PurgeQueueStatusOption,
  usePurgeQueue,
} from '@/hooks/use-queues'
import { cn } from '@/lib/utils'

const CHECKBOX_CLASS =
  'h-3.5 w-3.5 shrink-0 cursor-pointer accent-foreground disabled:cursor-not-allowed'

interface QueueJobCounts {
  waiting: number
  active: number
  delayed: number
  completed: number
  failed: number
  paused: number
  prioritized: number
}

interface PurgeQueueDialogProps {
  queueName: string
  queueJobCounts?: QueueJobCounts
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MAX_KEEP_MOST_RECENT = 1_000_000
const KEEP_MOST_RECENT_PRESETS = [0, 10, 50, 100] as const

const STATUS_LABELS: Record<PurgeQueueStatus, string> = {
  waiting: 'Waiting',
  active: 'Active',
  delayed: 'Delayed',
  completed: 'Completed',
  failed: 'Failed',
  paused: 'Paused',
  prioritized: 'Prioritized',
}

function parseKeepMostRecent(rawValue: string): number | null {
  const value = rawValue.trim()

  if (value.length === 0 || !/^\d+$/.test(value)) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed)) {
    return null
  }

  return parsed
}

function formatJobCount(count: number): string {
  return `${count.toLocaleString()} job${count === 1 ? '' : 's'}`
}

export function PurgeQueueDialog({
  queueName,
  queueJobCounts,
  open,
  onOpenChange,
}: PurgeQueueDialogProps) {
  const [confirmInput, setConfirmInput] = useState('')
  const [purgeAll, setPurgeAll] = useState(false)
  const [selectedStatuses, setSelectedStatuses] = useState<Set<PurgeQueueStatus>>(new Set())
  const [keepMostRecentInput, setKeepMostRecentInput] = useState('0')
  const purgeMutation = usePurgeQueue()

  useEffect(() => {
    if (!open) {
      setConfirmInput('')
      setPurgeAll(false)
      setSelectedStatuses(new Set())
      setKeepMostRecentInput('0')
    }
  }, [open])

  const jobCounts: QueueJobCounts = useMemo(
    () => ({
      waiting: queueJobCounts?.waiting ?? 0,
      active: queueJobCounts?.active ?? 0,
      delayed: queueJobCounts?.delayed ?? 0,
      completed: queueJobCounts?.completed ?? 0,
      failed: queueJobCounts?.failed ?? 0,
      paused: queueJobCounts?.paused ?? 0,
      prioritized: queueJobCounts?.prioritized ?? 0,
    }),
    [queueJobCounts]
  )

  const totalJobs = Object.values(jobCounts).reduce((sum, count) => sum + count, 0)
  const hasStatusSelection = purgeAll || selectedStatuses.size > 0
  const isConfirmed = confirmInput === queueName
  const isPurging = purgeMutation.isPending
  const parsedKeepMostRecent = useMemo(
    () => parseKeepMostRecent(keepMostRecentInput),
    [keepMostRecentInput]
  )
  const keepMostRecentError = useMemo(() => {
    if (parsedKeepMostRecent === null) {
      return 'Enter a whole number between 0 and 1,000,000.'
    }

    if (parsedKeepMostRecent > MAX_KEEP_MOST_RECENT) {
      return `Value must be ${MAX_KEEP_MOST_RECENT.toLocaleString()} or less.`
    }

    return null
  }, [parsedKeepMostRecent])
  const keepMostRecentValue = parsedKeepMostRecent ?? 0

  const selectedJobsEstimate = purgeAll
    ? totalJobs
    : Array.from(selectedStatuses).reduce((sum, status) => sum + jobCounts[status], 0)
  const estimatedRetainedJobs = hasStatusSelection
    ? Math.min(selectedJobsEstimate, keepMostRecentValue)
    : 0
  const estimatedPurgedJobs = hasStatusSelection
    ? Math.max(selectedJobsEstimate - keepMostRecentValue, 0)
    : 0
  const canSubmit =
    hasStatusSelection &&
    isConfirmed &&
    parsedKeepMostRecent !== null &&
    keepMostRecentError === null &&
    !isPurging

  const toggleStatus = (status: PurgeQueueStatus) => {
    if (purgeAll) return

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

  const handlePurge = async () => {
    if (!canSubmit) return

    const statuses: PurgeQueueStatusOption[] = purgeAll ? ['all'] : Array.from(selectedStatuses)
    const keepMostRecent = parsedKeepMostRecent ?? 0

    try {
      const result = await purgeMutation.mutateAsync({
        queueName,
        confirmName: confirmInput,
        statuses,
        keepMostRecent,
      })
      const keptMostRecent =
        typeof result.keptMostRecent === 'number'
          ? result.keptMostRecent
          : Math.min(keepMostRecent, selectedJobsEstimate)
      const removedDescription = `Removed ${formatJobCount(result.totalRemoved)}.`
      const retainedDescription =
        keepMostRecent > 0 ? ` Kept ${formatJobCount(keptMostRecent)}.` : ''

      toast.success('Queue purge completed', {
        description: `${removedDescription}${retainedDescription}`,
      })
      onOpenChange(false)
    } catch {
      // Errors are surfaced by shared API handlers.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        trackEvent(newOpen ? AnalyticsEvents.DIALOG_OPENED : AnalyticsEvents.DIALOG_CLOSED, {
          [AnalyticsProperties.DIALOG_TYPE]: DialogType.PURGE_QUEUE,
        })
        onOpenChange(newOpen)
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Purge queue jobs</DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            Permanently remove jobs from{' '}
            <code className="break-all rounded-[4px] bg-muted px-1 py-px font-mono text-xs text-foreground">
              {queueName}
            </code>{' '}
            by status. You can keep the most recent matches.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-[13px] font-medium leading-none">
              Statuses to purge
            </legend>

            <div className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2">
              <label
                htmlFor="purge-all-jobs"
                className="flex h-9 cursor-pointer items-center gap-2.5 bg-card px-3 text-[13px] transition-colors hover:bg-muted/60 sm:col-span-2"
              >
                <input
                  id="purge-all-jobs"
                  type="checkbox"
                  checked={purgeAll}
                  onChange={(e) => {
                    setPurgeAll(e.target.checked)
                    if (e.target.checked) {
                      setSelectedStatuses(new Set())
                    }
                  }}
                  className={CHECKBOX_CLASS}
                />
                <span className="font-medium">All jobs</span>
                <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                  {totalJobs.toLocaleString()}
                </span>
              </label>

              {PURGE_QUEUE_STATUSES.map((status) => (
                <label
                  key={status}
                  htmlFor={`purge-status-${status}`}
                  className={cn(
                    'flex h-9 items-center gap-2.5 bg-card px-3 text-[13px] transition-colors',
                    purgeAll
                      ? 'cursor-not-allowed text-muted-foreground'
                      : 'cursor-pointer hover:bg-muted/60'
                  )}
                >
                  <input
                    id={`purge-status-${status}`}
                    type="checkbox"
                    checked={purgeAll || selectedStatuses.has(status)}
                    onChange={() => toggleStatus(status)}
                    disabled={purgeAll}
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
              {PURGE_QUEUE_STATUSES.length % 2 === 1 ? (
                <div className="hidden bg-card sm:block" aria-hidden="true" />
              ) : null}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="purge-queue-keep-most-recent-input" className="text-[13px]">
              Keep most recent
            </Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                id="purge-queue-keep-most-recent-input"
                data-testid="purge-queue-keep-most-recent-input"
                value={keepMostRecentInput}
                onChange={(event) => setKeepMostRecentInput(event.target.value)}
                inputMode="numeric"
                placeholder="0"
                min={0}
                max={MAX_KEEP_MOST_RECENT}
                aria-invalid={keepMostRecentError ? true : undefined}
                className={cn(
                  'w-28 font-mono tabular-nums',
                  keepMostRecentError && 'border-destructive focus-visible:ring-destructive'
                )}
              />
              {KEEP_MOST_RECENT_PRESETS.map((value) => {
                const isSelected = keepMostRecentError === null && keepMostRecentValue === value
                return (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    size="xs"
                    aria-pressed={isSelected}
                    className={cn(
                      'h-8 font-mono tabular-nums',
                      isSelected && 'bg-accent text-accent-foreground'
                    )}
                    onClick={() => setKeepMostRecentInput(String(value))}
                  >
                    {value === 0 ? 'None' : value.toLocaleString()}
                  </Button>
                )
              })}
            </div>

            {keepMostRecentError ? (
              <p className="text-xs text-status-danger">{keepMostRecentError}</p>
            ) : hasStatusSelection ? (
              <p className="text-xs text-muted-foreground">
                Estimated outcome: purge {formatJobCount(estimatedPurgedJobs)} and retain{' '}
                {formatJobCount(estimatedRetainedJobs)}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select statuses to preview what will be purged.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="purge-queue-confirm-input"
              className="flex flex-wrap items-center gap-1 text-[13px] leading-5"
            >
              <span>Type</span>
              <code className="max-w-full break-all rounded-[4px] bg-muted px-1 py-px font-mono text-xs">
                {queueName}
              </code>
              <span>to confirm</span>
            </Label>
            <Input
              id="purge-queue-confirm-input"
              data-testid="purge-queue-confirm-input"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={hasStatusSelection ? 'Queue name' : 'Select statuses first'}
              disabled={!hasStatusSelection}
              aria-invalid={confirmInput && !isConfirmed ? true : undefined}
              className={cn(
                'font-mono',
                confirmInput && !isConfirmed && 'border-destructive focus-visible:ring-destructive'
              )}
              autoComplete="off"
              spellCheck={false}
            />
            {confirmInput && !isConfirmed ? (
              <p className="text-xs text-status-danger">Queue name does not match.</p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPurging}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handlePurge}
            disabled={!canSubmit}
            data-testid="purge-queue-confirm-button"
          >
            {isPurging ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
            {isPurging ? 'Purging…' : 'Purge jobs'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
