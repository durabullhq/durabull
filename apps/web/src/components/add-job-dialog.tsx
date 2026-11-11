import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { Loader2, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { JobOptionsFields } from '@/components/job-options-fields'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAddJob } from '@/hooks/use-queues'
import { ApiError } from '@/lib/api'
import {
  createDefaultJobOptionsFormValue,
  formValueToJobOptions,
  hasJobOptionsValidationErrors,
  type JobOptionsFormValue,
  validateJobOptionsFormValue,
} from '@/lib/job-options'

interface AddJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  queueName: string
  onSuccess?: (newJobId: string) => void
}

export function AddJobDialog({ open, onOpenChange, queueName, onSuccess }: AddJobDialogProps) {
  const [jobName, setJobName] = useState('')
  const [jobData, setJobData] = useState<unknown>({})
  const [isJsonValid, setIsJsonValid] = useState(true)
  const [jobOptions, setJobOptions] = useState<JobOptionsFormValue>(
    createDefaultJobOptionsFormValue
  )

  const addJobMutation = useAddJob()
  const jobOptionsErrors = useMemo(
    () => validateJobOptionsFormValue(jobOptions, { includeDelay: true }),
    [jobOptions]
  )

  useEffect(() => {
    if (open) {
      setJobName('')
      setJobData({})
      setIsJsonValid(true)
      setJobOptions(createDefaultJobOptionsFormValue())
    }
  }, [open])

  const handleJsonChange = (value: unknown, isValid: boolean) => {
    setJobData(value)
    setIsJsonValid(isValid)
  }

  const handleSubmit = async () => {
    if (!isJsonValid || !jobName.trim() || hasJobOptionsValidationErrors(jobOptionsErrors)) {
      return
    }

    try {
      const result = await addJobMutation.mutateAsync({
        queueName,
        name: jobName.trim(),
        jobData,
        options: formValueToJobOptions(jobOptions),
      })

      toast.success('Job created successfully', {
        description: `Job ID: ${result.jobId}`,
      })

      onOpenChange(false)
      if (result.jobId && onSuccess) {
        onSuccess(result.jobId)
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        // 429 errors already show a toast in handleRes.
        return
      }

      const apiErrorMessage =
        error instanceof Error && error.message ? error.message : 'Unable to add job.'

      toast.error('Failed to add job', {
        description: apiErrorMessage,
      })
    }
  }

  const isSubmitting = addJobMutation.isPending
  const canSubmit =
    isJsonValid &&
    jobName.trim() &&
    !isSubmitting &&
    !hasJobOptionsValidationErrors(jobOptionsErrors)

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        trackEvent(newOpen ? AnalyticsEvents.DIALOG_OPENED : AnalyticsEvents.DIALOG_CLOSED, {
          [AnalyticsProperties.DIALOG_TYPE]: DialogType.ADD_JOB,
        })
        onOpenChange(newOpen)
      }}
    >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add job</DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            Enqueue a new job on{' '}
            <code className="break-all rounded-[4px] bg-muted px-1 py-px font-mono text-xs text-foreground">
              {queueName}
            </code>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="job-name" className="text-[13px]">
              Job name
            </Label>
            <Input
              id="job-name"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="e.g. send-email"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px]">Data (JSON)</Label>
            <JsonEditor value={jobData} onChange={handleJsonChange} minHeight="180px" />
          </div>

          <div className="space-y-3 border-t pt-4">
            <h3 className="text-[13px] font-medium leading-none">Options</h3>
            <JobOptionsFields
              value={jobOptions}
              onChange={setJobOptions}
              errors={jobOptionsErrors}
              showDelay
              compact
              idPrefix="add-job"
            />
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
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {isSubmitting ? 'Adding…' : 'Add job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
