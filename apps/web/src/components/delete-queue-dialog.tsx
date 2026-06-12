import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { useState, useEffect } from 'react'
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCanDeleteQueue, useDeleteQueue } from '@/hooks/use-queues'

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
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Queue
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the queue and all its data
            from Redis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-8 py-4">
          {/* Queue name display */}
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 pb-5">
            <p className="text-sm text-muted-foreground mb-2">Queue to delete:</p>
            <p className="font-mono font-semibold text-foreground break-all">{queueName}</p>
          </div>

          {/* Status check */}
          {checkingCanDelete ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Checking queue status...</span>
            </div>
          ) : !canDelete ? (
            <div className="rounded-lg border border-status-warning/20 bg-status-warning/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-status-warning shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-status-warning">Queue cannot be deleted</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    This queue contains <span className="font-semibold">{totalJobs}</span> job
                    {totalJobs !== 1 ? 's' : ''} that must be removed first.
                  </p>
                  {canDeleteData?.jobCounts && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      {canDeleteData.jobCounts.waiting > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Waiting:</span>
                          <span className="font-medium">{canDeleteData.jobCounts.waiting}</span>
                        </div>
                      )}
                      {canDeleteData.jobCounts.active > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Active:</span>
                          <span className="font-medium text-status-active">
                            {canDeleteData.jobCounts.active}
                          </span>
                        </div>
                      )}
                      {canDeleteData.jobCounts.delayed > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Delayed:</span>
                          <span className="font-medium text-status-delayed">
                            {canDeleteData.jobCounts.delayed}
                          </span>
                        </div>
                      )}
                      {canDeleteData.jobCounts.failed > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Failed:</span>
                          <span className="font-medium text-status-danger">
                            {canDeleteData.jobCounts.failed}
                          </span>
                        </div>
                      )}
                      {canDeleteData.jobCounts.paused > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Paused:</span>
                          <span className="font-medium">{canDeleteData.jobCounts.paused}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <Label htmlFor="confirm-queue-name" className="text-sm block mb-3">
                Type{' '}
                <span className="font-mono font-semibold bg-muted px-1.5 py-1 rounded break-all">
                  {queueName}
                </span>{' '}
                to confirm:
              </Label>
              <Input
                id="confirm-queue-name"
                data-testid="delete-queue-confirm-input"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="Enter queue name"
                className={
                  confirmInput && !isConfirmed
                    ? 'border-destructive focus-visible:ring-destructive'
                    : ''
                }
                autoComplete="off"
                autoFocus
              />
              {confirmInput && !isConfirmed && (
                <p className="text-sm text-destructive">Queue name does not match</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
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
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Queue
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
