import { Loader2, Pencil } from 'lucide-react'
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
        <div className="space-y-2 rounded-lg border bg-muted/50 p-3">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Job ID:</p>
            <p className="select-all break-all font-mono text-sm">{jobId}</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Job Name:</p>
            <p className="text-sm font-medium">{jobName}</p>
          </div>
        </div>

        {isActive ? (
          <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-4 py-3">
            <p className="text-sm text-status-danger">
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
              className="flex flex-wrap items-center gap-1.5 leading-normal"
            >
              <span>Type</span>
              <span className="inline-flex max-w-full select-all items-center break-all rounded bg-muted px-1.5 py-0.5 font-mono font-semibold">
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
  )
}
