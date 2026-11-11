import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { useCanDeleteQueue, useDeleteQueue } from '@/hooks/use-queues'
import { cn } from '@/lib/utils'

interface DeleteQueueDialogProps {
  queueName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteQueueDialog({ queueName, open, onOpenChange }: DeleteQueueDialogProps) {
  const navigate = useNavigate()
  const [confirmInput, setConfirmInput] = useState('')
  const { data: canDeleteData, isLoading: checkingCanDelete } = useCanDeleteQueue(
    open ? queueName : ''
  )
  const deleteMutation = useDeleteQueue()

  // Reset input when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setConfirmInput('')
    }
  }, [open])

  const canDelete = canDeleteData?.canDelete ?? false
  const totalJobs = canDeleteData?.totalJobs ?? 0
  const isConfirmed = confirmInput === queueName
  const isDeleting = deleteMutation.isPending
  const remainingCounts = canDeleteData?.jobCounts
    ? [
        { label: 'Waiting', count: canDeleteData.jobCounts.waiting },
        { label: 'Active', count: canDeleteData.jobCounts.active },
        { label: 'Delayed', count: canDeleteData.jobCounts.delayed },
        { label: 'Failed', count: canDeleteData.jobCounts.failed },
        { label: 'Paused', count: canDeleteData.jobCounts.paused },
      ].filter((entry) => entry.count > 0)
    : []

  const handleDelete = async () => {
    if (!isConfirmed || !canDelete) return

    try {
      await deleteMutation.mutateAsync({ queueName, confirmName: confirmInput })
      onOpenChange(false)
      navigate({ to: '/' })
    } catch {
      // Error handling is done by react-query
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (newOpen) {
          trackEvent(AnalyticsEvents.DIALOG_OPENED, {
            [AnalyticsProperties.DIALOG_TYPE]: DialogType.DELETE_QUEUE,
          })
        } else {
          trackEvent(AnalyticsEvents.DIALOG_CLOSED, {
            [AnalyticsProperties.DIALOG_TYPE]: DialogType.DELETE_QUEUE,
          })
        }
        onOpenChange(newOpen)
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Delete queue</DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            Permanently delete{' '}
            <code className="break-all rounded-[4px] bg-muted px-1 py-px font-mono text-xs text-foreground">
              {queueName}
            </code>{' '}
            and all of its data from Redis. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {checkingCanDelete ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Checking queue status…
          </div>
        ) : !canDelete ? (
          <div className="flex gap-2.5 rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2.5 text-[13px] leading-5">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-status-warning"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-status-warning">Queue cannot be deleted</p>
              <p className="text-muted-foreground">
                It still holds{' '}
                <span className="font-mono tabular-nums text-foreground">
                  {totalJobs.toLocaleString()}
                </span>{' '}
                job{totalJobs !== 1 ? 's' : ''}. Purge them first, then delete the queue.
              </p>
              {remainingCounts.length > 0 ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-status-warning/20 pt-2">
                  {remainingCounts.map((entry) => (
                    <div key={entry.label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">{entry.label}</dt>
                      <dd className="font-mono text-xs tabular-nums">
                        {entry.count.toLocaleString()}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label
              htmlFor="confirm-queue-name"
              className="flex flex-wrap items-center gap-1 text-[13px] leading-5"
            >
              <span>Type</span>
              <code className="max-w-full break-all rounded-[4px] bg-muted px-1 py-px font-mono text-xs">
                {queueName}
              </code>
              <span>to confirm</span>
            </Label>
            <Input
              id="confirm-queue-name"
              data-testid="delete-queue-confirm-input"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder="Queue name"
              aria-invalid={confirmInput && !isConfirmed ? true : undefined}
              className={cn(
                'font-mono',
                confirmInput && !isConfirmed && 'border-destructive focus-visible:ring-destructive'
              )}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            {confirmInput && !isConfirmed ? (
              <p className="text-xs text-status-danger">Queue name does not match</p>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete || !isConfirmed || isDeleting}
            data-testid="delete-queue-confirm-button"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
            {isDeleting ? 'Deleting…' : 'Delete queue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
