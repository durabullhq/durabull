import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { Loader2, Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { hasJobPayloadChanged, JobPayloadEditor } from '@/components/job-payload-editor'
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
import { useUpdateJobData } from '@/hooks/use-queues'

interface EditJobDataDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  queueName: string
  jobId: string
  jobName: string
  jobData: unknown
  jobStatus: string
  onSuccess?: () => void
}

export function EditJobDataDialog({
  open,
  onOpenChange,
  queueName,
  jobId,
  jobName,
  jobData: originalJobData,
  jobStatus,
  onSuccess,
}: EditJobDataDialogProps) {
  const [jobData, setJobData] = useState<unknown>(originalJobData)
  const [isJsonValid, setIsJsonValid] = useState(true)
  const [confirmInput, setConfirmInput] = useState('')

  const updateMutation = useUpdateJobData()

  useEffect(() => {
    if (open) {
      setJobData(originalJobData)
      setIsJsonValid(true)
      setConfirmInput('')
    }
  }, [open, originalJobData])

  const handleJsonChange = (value: unknown, isValid: boolean) => {
    setJobData(value)
    setIsJsonValid(isValid)
  }

  const isActive = jobStatus === 'active'
  const isConfirmed = confirmInput === jobId
  const isSubmitting = updateMutation.isPending
  const payloadChanged = hasJobPayloadChanged(originalJobData, jobData, isJsonValid)
  const canSubmit = !isActive && isJsonValid && payloadChanged && isConfirmed && !isSubmitting

  const handleSubmit = async () => {
    if (!canSubmit) return

    try {
      await updateMutation.mutateAsync({
        queueName,
        jobId,
        data: jobData,
      })

      toast.success('Job payload updated', {
        description: 'The stored job data in Redis has been overwritten.',
      })

      onOpenChange(false)
      onSuccess?.()
    } catch {
      // Error is handled by react-query
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (isSubmitting) return
        trackEvent(newOpen ? AnalyticsEvents.DIALOG_OPENED : AnalyticsEvents.DIALOG_CLOSED, {
          [AnalyticsProperties.DIALOG_TYPE]: DialogType.EDIT_JOB_DATA,
        })
        onOpenChange(newOpen)
      }}
    >
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Job Payload
          </DialogTitle>
          <DialogDescription>
            Overwrite the data payload for this job. This is a destructive change and cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Job ID:</p>
              <p className="font-mono text-sm break-all select-all">{jobId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Job Name:</p>
              <p className="text-sm font-medium">{jobName}</p>
            </div>
          </div>

          {isActive ? (
            <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-4 py-3">
              <p className="text-sm text-status-danger">
                This job is currently active. A worker already holds the current payload, so
                changing it now would not take effect. Wait for the attempt to finish, then edit
                again.
              </p>
            </div>
          ) : null}

          <JobPayloadEditor
            original={originalJobData}
            value={jobData}
            onChange={handleJsonChange}
            minHeight="200px"
          />

          {!isActive ? (
            <div className="space-y-2">
              <Label
                htmlFor="edit-job-data-confirm-input"
                className="flex flex-wrap items-center gap-1.5 leading-normal"
              >
                <span>Type</span>
                <span className="inline-flex max-w-full items-center rounded bg-muted px-1.5 py-0.5 font-mono font-semibold break-all select-all">
                  {jobId}
                </span>
                <span>to confirm overwrite</span>
              </Label>
              <Input
                id="edit-job-data-confirm-input"
                data-testid="edit-job-data-confirm-input"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="Enter job ID to confirm"
                className={
                  confirmInput && !isConfirmed
                    ? 'border-destructive focus-visible:ring-destructive'
                    : ''
                }
                autoComplete="off"
              />
              {confirmInput && !isConfirmed ? (
                <p className="text-sm text-destructive">Job ID does not match.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="edit-job-data-confirm-button"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Pencil className="mr-2 h-4 w-4" />
                Overwrite Payload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
