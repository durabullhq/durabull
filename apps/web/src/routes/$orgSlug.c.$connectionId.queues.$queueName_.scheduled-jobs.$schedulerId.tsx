import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, ArrowUpRight } from 'lucide-react'
import { useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { useAppTopBar } from '@/components/app-top-bar'
import { PageTitle } from '@/components/page-title'
import {
  ScheduledJobForm,
  type ScheduledJobFormInitialValue,
} from '@/components/scheduled-job-form'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, PanelHeader } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import { useScheduledJob, useUpdateScheduledJob } from '@/hooks/use-queues'
import { ApiError } from '@/lib/api'

export const Route = createFileRoute(
  '/$orgSlug/c/$connectionId/queues/$queueName_/scheduled-jobs/$schedulerId'
)({
  component: ScheduledJobDetailPage,
})

function ScheduledJobDetailPage() {
  const { orgSlug, connectionId, queueName, schedulerId } = Route.useParams()
  const navigate = useNavigate()
  const { data, isLoading, error } = useScheduledJob(queueName, schedulerId)
  const updateScheduledJobMutation = useUpdateScheduledJob()

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

  useEffect(() => {
    if (!data?.scheduler) {
      return
    }

    trackEvent(AnalyticsEvents.SCHEDULED_JOB_UPDATED, {
      queue_name: queueName,
      scheduler_id: schedulerId,
      action: 'page_viewed',
    })
  }, [data?.scheduler, queueName, schedulerId])

  const title = data?.scheduler?.jobName ?? schedulerId

  const nextRun = data?.scheduler?.nextRun

  const topBarConfig = useMemo(() => {
    const nextRunJobId = nextRun ? `repeat:${schedulerId}:${nextRun}` : null

    return {
      left: (
        <PageTitle
          title={title}
          mono
          crumbs={[
            { label: 'Scheduled Jobs', to: `/${orgSlug}/c/${connectionId}/scheduled-jobs` },
            {
              label: queueName,
              to: `/${orgSlug}/c/${connectionId}/queues/${encodeURIComponent(queueName)}`,
            },
          ]}
        />
      ),
      actions: nextRunJobId ? (
        <Button asChild variant="outline" size="xs">
          <Link
            to="/$orgSlug/c/$connectionId/queues/$queueName/jobs/$jobId"
            params={{ orgSlug, connectionId, queueName, jobId: nextRunJobId }}
            search={{ tab: 'data' }}
          >
            Inspect next run
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      ) : undefined,
      mobileActions: nextRunJobId ? (
        <DropdownMenuItem asChild>
          <Link
            to="/$orgSlug/c/$connectionId/queues/$queueName/jobs/$jobId"
            params={{ orgSlug, connectionId, queueName, jobId: nextRunJobId }}
            search={{ tab: 'data' }}
          >
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Inspect next run
          </Link>
        </DropdownMenuItem>
      ) : undefined,
    }
  }, [connectionId, nextRun, orgSlug, queueName, schedulerId, title])

  useAppTopBar(topBarConfig)

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-[70px] w-full rounded-lg" />
        <Panel>
          <PanelHeader>
            <Skeleton className="h-4 w-24" />
          </PanelHeader>
          <div className="space-y-4 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
            <Skeleton className="h-48 w-full" />
          </div>
        </Panel>
        <Panel>
          <PanelHeader>
            <Skeleton className="h-4 w-16" />
          </PanelHeader>
          <div className="p-4">
            <Skeleton className="h-24 w-full" />
          </div>
        </Panel>
      </div>
    )
  }

  if (error || !data?.scheduler) {
    return (
      <EmptyState
        icon={AlertCircle}
        tone="danger"
        title="Scheduled job not found"
        description={error?.message ?? `Scheduler "${schedulerId}" could not be loaded.`}
        actions={
          <Button variant="outline" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to Queue
          </Button>
        }
      />
    )
  }

  const initialValue: ScheduledJobFormInitialValue = {
    schedulerId: data.scheduler.schedulerId,
    jobName: data.scheduler.jobName,
    data: data.scheduler.data,
    pattern: data.scheduler.pattern,
    every: data.scheduler.every,
    timezone: data.scheduler.timezone,
    startDate: data.scheduler.startDate,
    endDate: data.scheduler.endDate,
    limit: data.scheduler.limit,
    templateOptions: data.scheduler.templateOptions,
    nextRun: data.scheduler.nextRun,
    iterationCount: data.scheduler.iterationCount,
    recentFailedCount: data.scheduler.recentFailedCount,
    lastFailedAt: data.scheduler.lastFailedAt,
  }

  return (
    <ScheduledJobForm
      mode="edit"
      queueName={queueName}
      initialValue={initialValue}
      existingSchedulerIds={[schedulerId]}
      isSubmitting={updateScheduledJobMutation.isPending}
      onCancel={handleBack}
      onSubmit={async (payload) => {
        try {
          const result = await updateScheduledJobMutation.mutateAsync({
            queueName,
            ...payload,
          })

          toast.success('Scheduled job updated', {
            description: `Scheduler ID: ${result.scheduler.schedulerId}`,
          })
        } catch (error) {
          if (error instanceof ApiError && error.status === 429) {
            return
          }

          const message =
            error instanceof Error && error.message
              ? error.message
              : 'Unable to save the scheduled job.'

          toast.error('Failed to update scheduled job', {
            description: message,
          })
        }
      }}
    />
  )
}
