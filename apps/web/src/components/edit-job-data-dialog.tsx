import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { toast } from 'sonner'
import { EditJobDataDialogContent } from '@/components/edit-job-data-dialog-content'
import { Dialog } from '@/components/ui/dialog'
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
  const updateMutation = useUpdateJobData()

  const isSubmitting = updateMutation.isPending

  const handleSubmit = async (data: unknown) => {
    try {
      await updateMutation.mutateAsync({
        queueName,
        jobId,
        data,
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
      {open ? (
        <EditJobDataDialogContent
          jobId={jobId}
          jobName={jobName}
          originalJobData={originalJobData}
          jobStatus={jobStatus}
          isSubmitting={isSubmitting}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
        />
      ) : null}
    </Dialog>
  )
}
