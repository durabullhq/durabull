import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { useAppTopBar } from '@/components/app-top-bar'
import { PageTitle } from '@/components/page-title'
import { ScheduledJobForm } from '@/components/scheduled-job-form'
import { useCreateScheduledJob, useQueueScheduledJobs } from '@/hooks/use-queues'
import { ApiError } from '@/lib/api'

export const Route = createFileRoute(
  '/$orgSlug/c/$connectionId/queues/$queueName_/scheduled-jobs/new'
)({
  component: NewScheduledJobPage,
})

function NewScheduledJobPage() {
  const { orgSlug, connectionId, queueName } = Route.useParams()
  const navigate = useNavigate()
  const { data: scheduledJobs } = useQueueScheduledJobs(queueName)
  const createScheduledJobMutation = useCreateScheduledJob()

  useEffect(() => {
    trackEvent(AnalyticsEvents.SCHEDULED_JOB_CREATED, {
      queue_name: queueName,
      action: 'page_viewed',
    })
  }, [queueName])

  const handleBack = useCallback(() => {
    navigate({
      to: '/$orgSlug/c/$connectionId/queues/$queueName',
      params: { orgSlug, connectionId, queueName },
      search: {
        section: 'jobs',
        tab: 'scheduled',
        status: '',
        jobId: '',
        hideScheduled: 0,
        page: 1,
      },
    })
  }, [connectionId, navigate, orgSlug, queueName])

  const topBarConfig = useMemo(
    () => ({
      left: (
        <PageTitle
          title="New schedule"
          crumbs={[
            { label: 'Scheduled Jobs', to: `/${orgSlug}/c/${connectionId}/scheduled-jobs` },
            {
              label: queueName,
              to: `/${orgSlug}/c/${connectionId}/queues/${encodeURIComponent(queueName)}`,
            },
          ]}
        />
      ),
    }),
    [connectionId, orgSlug, queueName]
  )

  useAppTopBar(topBarConfig)

  return (
    <ScheduledJobForm
      mode="create"
      queueName={queueName}
      existingSchedulerIds={scheduledJobs?.scheduledJobs.map((job) => job.schedulerId) ?? []}
      isSubmitting={createScheduledJobMutation.isPending}
      onCancel={handleBack}
      onSubmit={async (payload) => {
        try {
          const result = await createScheduledJobMutation.mutateAsync({
            queueName,
            ...payload,
          })

          toast.success('Scheduled job created', {
            description: `Scheduler ID: ${result.scheduler.schedulerId}`,
          })

          navigate({
            to: '/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/$schedulerId',
            params: {
              orgSlug,
              connectionId,
              queueName,
              schedulerId: result.scheduler.schedulerId,
            },
            replace: true,
          })
        } catch (error) {
          if (error instanceof ApiError && error.status === 429) {
            return
          }

          const message =
            error instanceof Error && error.message
              ? error.message
              : 'Unable to create the scheduled job.'

          toast.error('Failed to create scheduled job', {
            description: message,
          })
        }
      }}
    />
  )
}
