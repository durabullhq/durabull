import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { Loader2, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { JsonEditor } from '@/components/json-editor'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useInvokeJobs } from '@/hooks/use-queues'

interface InvokeJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  queueName: string
  jobId: string
  jobName: string
  jobData: Record<string, unknown>
  onSuccess?: () => void
}

export function InvokeJobDialog({
  open,
  onOpenChange,
  queueName,
  jobId,
  jobName,
  jobData: originalJobData,
  onSuccess,
}: InvokeJobDialogProps) {
  const [jobData, setJobData] = useState<unknown>(originalJobData)
  const [isJsonValid, setIsJsonValid] = useState(true)

  const invokeMutation = useInvokeJobs()

  // Reset form when dialog opens with new job
  useEffect(() => {
    if (open) {
      setJobData(originalJobData)
      setIsJsonValid(true)
    }
  }, [open, originalJobData])

  const handleJsonChange = (value: unknown, isValid: boolean) => {
    setJobData(value)
    setIsJsonValid(isValid)
  }

  const handleSubmit = async () => {
    if (!isJsonValid) return

    try {
      await invokeMutation.mutateAsync({
        queueName,
        jobIds: [jobId],
        jobData: jobData as Record<string, unknown>,
      })

      toast.success('Job invoked successfully', {
        description: 'The job will now run immediately.',
      })

      onOpenChange(false)
      onSuccess?.()
    } catch {
      // Error is handled by react-query
    }
  }

  const isSubmitting = invokeMutation.isPending
  const canSubmit = isJsonValid && !isSubmitting

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        trackEvent(newOpen ? AnalyticsEvents.DIALOG_OPENED : AnalyticsEvents.DIALOG_CLOSED, {
          [AnalyticsProperties.DIALOG_TYPE]: DialogType.INVOKE_JOB,
        })
        onOpenChange(newOpen)
      }}
    >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Invoke job</DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            Run this delayed job immediately. You can edit the payload before it runs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Read-only reference for the job being run */}
          <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
            <dt className="text-muted-foreground">Job ID</dt>
            <dd className="break-all font-mono text-xs leading-5">{jobId}</dd>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="break-all font-mono text-xs leading-5">{jobName}</dd>
          </dl>

          <div className="space-y-1.5">
            <Label className="text-[13px]">Payload (JSON)</Label>
            <JsonEditor value={jobData} onChange={handleJsonChange} minHeight="200px" />
            <p className="text-xs text-muted-foreground">
              Passed to the job as its data when it runs.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Zap className="h-4 w-4" aria-hidden="true" />
            )}
            {isSubmitting ? 'Invoking…' : 'Invoke now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
