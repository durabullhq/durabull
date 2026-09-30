import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { Loader2, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { JsonEditor } from '@/components/json-editor'
import { JobOptionsFields } from '@/components/job-options-fields'
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
  validateJobOptionsFormValue,
  type JobOptionsFormValue,
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
    createDefaultJobOptionsFormValue()
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Job
          </DialogTitle>
          <DialogDescription>Create a new job and add it to this queue.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="job-name">Job Name</Label>
            <Input
              id="job-name"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="Enter job name"
            />
          </div>

          <div className="space-y-2">
            <Label>Job Data (JSON)</Label>
            <JsonEditor value={jobData} onChange={handleJsonChange} minHeight="180px" />
          </div>

          <div className="space-y-4">
            <Label className="text-sm font-medium">Options</Label>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add Job
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
