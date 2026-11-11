import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { Loader2 } from 'lucide-react'
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
import {
  formValueToJobOptions,
  hasJobOptionsValidationErrors,
  type JobOptionsFormValue,
  jobOptsToFormValue,
  validateJobOptionsFormValue,
} from '@/lib/job-options'

interface DuplicateJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  queueName: string
  originalJobId: string
  originalJobName: string
  originalJobData: Record<string, unknown>
  originalJobOpts?: Record<string, unknown>
  originalDelay?: number
  onSuccess?: (newJobId: string) => void
}

export function DuplicateJobDialog({
  open,
  onOpenChange,
  queueName,
  originalJobId,
  originalJobName,
  originalJobData,
  originalJobOpts,
  originalDelay = 0,
  onSuccess,
}: DuplicateJobDialogProps) {
  const [jobName, setJobName] = useState(originalJobName ?? '')
  const [jobData, setJobData] = useState<unknown>(originalJobData)
  const [isJsonValid, setIsJsonValid] = useState(true)
  const [jobOptions, setJobOptions] = useState<JobOptionsFormValue>(() =>
    jobOptsToFormValue(originalJobOpts, originalDelay)
  )

  const addJobMutation = useAddJob()
  const jobOptionsErrors = useMemo(
    () => validateJobOptionsFormValue(jobOptions, { includeDelay: true }),
    [jobOptions]
  )

  useEffect(() => {
    if (open) {
      setJobName(originalJobName ?? '')
      setJobData(originalJobData)
      setIsJsonValid(true)
      setJobOptions(jobOptsToFormValue(originalJobOpts, originalDelay))
    }
  }, [open, originalJobName, originalJobData, originalJobOpts, originalDelay])

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
    } catch {
      // Error is handled by react-query
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
          [AnalyticsProperties.DIALOG_TYPE]: DialogType.DUPLICATE_JOB,
        })
        onOpenChange(newOpen)
      }}
    >
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Duplicate Job</DialogTitle>
          <DialogDescription>
            Adds a new job to this queue with the same name, data and options. Adjust anything
            before adding it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs leading-5">
            <dt className="text-muted-foreground">Queue</dt>
            <dd className="break-all font-mono">{queueName}</dd>
            <dt className="text-muted-foreground">Source</dt>
            <dd className="break-all font-mono">{originalJobId}</dd>
          </dl>

          <div className="space-y-2">
            <Label htmlFor="job-name">Job Name</Label>
            <Input
              id="job-name"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="Enter job name"
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label>Job Data (JSON)</Label>
            <JsonEditor value={jobData} onChange={handleJsonChange} minHeight="180px" />
          </div>

          <div className="space-y-2">
            <Label>Options</Label>
            <JobOptionsFields
              value={jobOptions}
              onChange={setJobOptions}
              errors={jobOptionsErrors}
              showDelay
              compact
              idPrefix="duplicate-job"
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
                <Loader2 className="h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Job'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
