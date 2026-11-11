import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { JobPayloadEditor } from '@/components/job-payload-editor'
import { Button } from '@/components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { hasJobPayloadChanged } from '@/lib/job-payload'

interface EditJobDataDialogContentProps {
  jobId: string
  jobName: string
  originalJobData: unknown
  jobStatus: string
  isSubmitting: boolean
  onCancel: () => void
  onSubmit: (data: unknown) => Promise<void>
}

export function EditJobDataDialogContent({
  jobId,
  jobName,
  originalJobData,
  jobStatus,
  isSubmitting,
  onCancel,
  onSubmit,
}: EditJobDataDialogContentProps) {
  const [jobData, setJobData] = useState<unknown>(originalJobData)
  const [isJsonValid, setIsJsonValid] = useState(true)
  const [confirmInput, setConfirmInput] = useState('')

  const isActive = jobStatus === 'active'
  const isConfirmed = confirmInput === jobId
  const payloadChanged = hasJobPayloadChanged(originalJobData, jobData)
  const canSubmit = !isActive && isJsonValid && payloadChanged && isConfirmed && !isSubmitting

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
      <DialogHeader>
        <DialogTitle>Edit Job Payload</DialogTitle>
        <DialogDescription>
          Overwrite the data payload for this job. This is a destructive change and cannot be
          undone.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs leading-5">
          {jobName ? (
            <>
              <dt className="text-muted-foreground">Job</dt>
              <dd className="break-all font-medium">{jobName}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">ID</dt>
          <dd className="select-all break-all font-mono">{jobId}</dd>
        </dl>

        {isActive ? (
          <div className="rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2">
            <p className="text-[13px] leading-5 text-status-warning">
              This job is currently active. A worker already holds the current payload, so changing
              it now would not take effect. Wait for the attempt to finish, then edit again.
            </p>
          </div>
        ) : null}

        <JobPayloadEditor
          original={originalJobData}
          value={jobData}
          onChange={(value, isValid) => {
            setJobData(value)
            setIsJsonValid(isValid)
          }}
          minHeight="200px"
        />

        {!isActive ? (
          <div className="space-y-2">
            <Label
              htmlFor="edit-job-data-confirm-input"
              className="flex flex-wrap items-center gap-1.5 text-[13px] leading-normal"
            >
              <span>Type</span>
              <span className="inline-flex max-w-full select-all items-center break-all rounded-[4px] border bg-muted px-1.5 py-px font-mono text-xs font-medium">
                {jobId}
              </span>
              <span>to confirm overwrite</span>
            </Label>
            <Input
              id="edit-job-data-confirm-input"
              data-testid="edit-job-data-confirm-input"
              value={confirmInput}
              onChange={(event) => setConfirmInput(event.target.value)}
              placeholder="Enter job ID to confirm"
              className={
                confirmInput && !isConfirmed
                  ? 'border-status-danger font-mono focus-visible:ring-status-danger/40'
                  : 'font-mono'
              }
              autoComplete="off"
            />
            {confirmInput && !isConfirmed ? (
              <p className="text-xs text-status-danger">Job ID does not match.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={() => void onSubmit(jobData)}
          disabled={!canSubmit}
          data-testid="edit-job-data-confirm-button"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Overwrite Payload'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
