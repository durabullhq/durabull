import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { zodValidator } from '@tanstack/zod-adapter'
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  CopyPlus,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  ScrollText,
  Search,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { useAppTopBar } from '@/components/app-top-bar'
import { DeleteJobLogsButton } from '@/components/delete-job-logs-button'
import { DuplicateJobDialog } from '@/components/duplicate-job-dialog'
import { EditJobDataDialog } from '@/components/edit-job-data-dialog'
import { FailedAttempts } from '@/components/failed-attempts'
import { InvokeJobDialog } from '@/components/invoke-job-dialog'
import { JobDependencies } from '@/components/job-dependencies'
import { JobRemoveButton } from '@/components/job-remove-button'
import { JsonViewer } from '@/components/json-viewer'
import { PageTitle } from '@/components/page-title'
import { RetryCountdown } from '@/components/retry-countdown'
import { RetryJobDialog } from '@/components/retry-job-dialog'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Metric, MetricStrip } from '@/components/ui/metric'
import { Panel, PanelHeader } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useConnectionAlertEvents } from '@/hooks/use-alerts'
import { useJobRetryDialog } from '@/hooks/use-job-retry-dialog'
import { useJob, useJobLogs, useRemoveJobs } from '@/hooks/use-queues'
import { cn, formatDateWithTimezone, formatDuration } from '@/lib/utils'

const jobSearchSchema = z.object({
  tab: z.enum(['attempts', 'data', 'logs', 'options', 'dependencies']).catch('data'),
})

const LOG_FORMATTING_DOCS_URL =
  'https://durabull.io/documentation/workflows/log-formatting-and-highlighting'

type StatusBadgeStatus = React.ComponentProps<typeof StatusBadge>['status']

/** Job state → status pill. An active *job* is in flight (blue), not healthy (green). */
const JOB_STATUS_BADGE: Record<string, { status: StatusBadgeStatus; label?: string }> = {
  waiting: { status: 'waiting' },
  active: { status: 'running', label: 'Active' },
  delayed: { status: 'delayed' },
  completed: { status: 'completed' },
  failed: { status: 'failed' },
  paused: { status: 'paused' },
  prioritized: { status: 'prioritized' },
  'waiting-children': { status: 'waiting-children' },
}

export const Route = createFileRoute('/$orgSlug/c/$connectionId/queues/$queueName_/jobs/$jobId')({
  validateSearch: zodValidator(jobSearchSchema),
  component: JobDetailPage,
})

function JobDetailPage() {
  const { orgSlug, connectionId, queueName, jobId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [invokeDialogOpen, setInvokeDialogOpen] = useState(false)
  const [editJobDataDialogOpen, setEditJobDataDialogOpen] = useState(false)
  const retryDialog = useJobRetryDialog(queueName, jobId)

  const { data: job, isLoading, error } = useJob(queueName, jobId)
  const { data: logsData } = useJobLogs(queueName, jobId)
  const alertEventsQuery = useConnectionAlertEvents(connectionId, {
    queueName,
    jobId,
    limit: 20,
  })

  const removeMutation = useRemoveJobs()

  // Track job view when job data is loaded
  useEffect(() => {
    if (job) {
      trackEvent(AnalyticsEvents.JOB_VIEWED, {
        queue_name: queueName,
        job_id: jobId,
        job_status: job.status,
      })
    }
  }, [job, queueName, jobId])

  // Track tab changes
  const handleTabChange = (newTab: string) => {
    trackEvent(AnalyticsEvents.JOB_TAB_CHANGED, {
      job_id: jobId,
      job_tab: newTab,
    })
  }

  const handleEditJobDataDialogOpenChange = (open: boolean) => {
    trackEvent(open ? AnalyticsEvents.DIALOG_OPENED : AnalyticsEvents.DIALOG_CLOSED, {
      [AnalyticsProperties.DIALOG_TYPE]: DialogType.EDIT_JOB_DATA,
    })
    setEditJobDataDialogOpen(open)
  }

  const hasFailedAttempts = (job?.stacktraceCount ?? 0) > 0
  const hasFailed = job?.status === 'failed'
  const status = job?.status
  const jobName = job?.name

  const isScheduledJob = jobId.startsWith('repeat:')

  const linearIssueLinks = useMemo(() => {
    return (alertEventsQuery.data?.events ?? []).flatMap((event) => {
      return event.deliveries
        .filter((delivery) => delivery.channelType === 'linear' && delivery.externalUrl)
        .map((delivery) => ({
          id: delivery.id,
          label: delivery.externalIdentifier ?? 'Linear issue',
          url: delivery.externalUrl ?? '',
        }))
    })
  }, [alertEventsQuery.data?.events])

  const handleRemove = useCallback(
    (removeScheduler = false) => {
      removeMutation.mutate(
        { queueName, jobIds: [jobId], removeScheduler },
        {
          onSuccess: () => {
            navigate({
              to: '/$orgSlug/c/$connectionId/queues/$queueName',
              params: { orgSlug, connectionId, queueName },
              search: {},
            })
          },
        }
      )
    },
    [connectionId, jobId, navigate, orgSlug, queueName, removeMutation]
  )

  const handleInvokeSuccess = useCallback(() => {
    navigate({
      to: '/$orgSlug/c/$connectionId/queues/$queueName',
      params: { orgSlug, connectionId, queueName },
      search: {},
    })
  }, [connectionId, navigate, orgSlug, queueName])

  const hasJob = Boolean(job)

  const topBarConfig = useMemo(() => {
    const badge = status ? JOB_STATUS_BADGE[status] : undefined
    // One primary action, chosen by state: retry what failed, run what is waiting on a
    // delay, otherwise run it again.
    const primary = status === 'failed' ? 'retry' : status === 'delayed' ? 'invoke' : 'duplicate'

    return {
      left: (
        <PageTitle
          mono
          title={jobId}
          crumbs={[
            { label: 'Queues', to: `/${orgSlug}/c/${connectionId}` },
            {
              label: queueName,
              to: `/${orgSlug}/c/${connectionId}/queues/${encodeURIComponent(queueName)}`,
            },
          ]}
          meta={
            <>
              <CopyJobIdButton jobId={jobId} />
              {badge ? (
                <StatusBadge status={badge.status} label={badge.label} />
              ) : status ? (
                <Badge variant="neutral">{status}</Badge>
              ) : null}
              {jobName ? (
                <span className="hidden max-w-56 truncate font-mono text-xs text-muted-foreground xl:inline">
                  {jobName}
                </span>
              ) : null}
            </>
          }
        />
      ),
      actions: (
        <>
          {status === 'failed' && (
            <Button size="xs" onClick={retryDialog.openDialog}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry Job
            </Button>
          )}
          {status === 'delayed' && (
            <Button size="xs" onClick={() => setInvokeDialogOpen(true)}>
              <Zap className="h-3.5 w-3.5" />
              Invoke
            </Button>
          )}
          <Button
            variant={primary === 'duplicate' ? 'default' : 'outline'}
            size="xs"
            onClick={() => setDuplicateDialogOpen(true)}
            disabled={!hasJob}
          >
            <CopyPlus className="h-3.5 w-3.5" />
            Duplicate
          </Button>
          <JobRemoveButton
            isScheduledJob={isScheduledJob}
            isPending={removeMutation.isPending}
            onRemoveJobOnly={() => handleRemove(false)}
            onRemoveJobAndStopScheduler={() => handleRemove(true)}
            size="xs"
          />
        </>
      ),
      mobileActions: (
        <>
          {status === 'failed' && (
            <DropdownMenuItem onClick={retryDialog.openDialog}>
              <RefreshCw />
              Retry Job
            </DropdownMenuItem>
          )}
          {status === 'delayed' && (
            <DropdownMenuItem onClick={() => setInvokeDialogOpen(true)}>
              <Zap />
              Invoke Job
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDuplicateDialogOpen(true)} disabled={!hasJob}>
            <CopyPlus />
            Duplicate Job
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {isScheduledJob ? (
            <DropdownMenuItem
              onClick={() => handleRemove(true)}
              disabled={removeMutation.isPending}
              className="text-status-danger focus:bg-status-danger/10 focus:text-status-danger"
            >
              <Trash2 />
              Remove Job & Stop Scheduler
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => handleRemove(false)}
              disabled={removeMutation.isPending}
              className="text-status-danger focus:bg-status-danger/10 focus:text-status-danger"
            >
              <Trash2 />
              Remove Job
            </DropdownMenuItem>
          )}
        </>
      ),
    }
  }, [
    connectionId,
    handleRemove,
    retryDialog.openDialog,
    hasJob,
    jobId,
    jobName,
    status,
    orgSlug,
    queueName,
    removeMutation.isPending,
    isScheduledJob,
  ])

  useAppTopBar(topBarConfig)

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        tone="danger"
        title="Job not found"
        description={error.message}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({
                to: '/$orgSlug/c/$connectionId/queues/$queueName',
                params: { orgSlug, connectionId, queueName },
                search: {},
              })
            }
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Queue
          </Button>
        }
      />
    )
  }

  // Failed attempts and options are always on the page now (failure panel, details rail),
  // so their old tab values fall back to the payload.
  const activeTab = tab === 'logs' || tab === 'dependencies' ? tab : 'data'
  const logCount = logsData?.pages?.[0]?.count ?? 0
  const backoff = job?.opts?.backoff as
    | { type?: 'fixed' | 'exponential'; delay?: number }
    | undefined

  return (
    <div className="space-y-4">
      <JobMetrics job={job} isLoading={isLoading} backoff={backoff} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {/* Why it failed comes first: error, stack, earlier attempts. */}
          {(hasFailedAttempts || hasFailed) && (
            <FailedAttempts
              queueName={queueName}
              jobId={jobId}
              attemptsMade={job?.attemptsMade ?? 0}
              maxAttempts={job?.maxAttempts ?? 1}
              stacktraceCount={job?.stacktraceCount ?? 0}
              failedReason={job?.failedReason}
              processedOn={job?.processedOn}
              finishedOn={job?.finishedOn}
              backoff={backoff}
              status={job?.status}
            />
          )}

          <Tabs
            value={activeTab}
            onValueChange={(newTab) => {
              handleTabChange(newTab)
              navigate({
                to: '.',
                search: { tab: newTab as typeof tab },
                replace: true,
              })
            }}
          >
            <TabsList>
              <TabsTrigger value="data">Payload</TabsTrigger>
              <TabsTrigger value="logs">
                Logs
                {logCount ? (
                  <span className="font-mono text-[11px] font-normal tabular-nums text-muted-foreground">
                    {logCount.toLocaleString()}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
            </TabsList>

            <TabsContent value="data" className="mt-3">
              {isLoading ? (
                <Panel className="p-4">
                  <Skeleton className="h-48" />
                </Panel>
              ) : (
                <div
                  className={cn(
                    'grid items-start gap-4',
                    job?.returnvalue != null && 'xl:grid-cols-2'
                  )}
                >
                  <JsonViewer
                    title="Payload"
                    data={job?.data}
                    maxInitialDepth={3}
                    actions={
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-7 px-2 text-foreground"
                        disabled={!job}
                        onClick={() => handleEditJobDataDialogOpenChange(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit Payload
                      </Button>
                    }
                  />
                  {job?.returnvalue != null && (
                    <JsonViewer title="Return value" data={job.returnvalue} maxInitialDepth={3} />
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="logs" className="mt-3">
              <LogViewer queueName={queueName} jobId={jobId} />
            </TabsContent>

            <TabsContent value="dependencies" className="mt-3">
              <JobDependencies
                key={`${connectionId}:${queueName}:${jobId}`}
                orgSlug={orgSlug}
                connectionId={connectionId}
                queueName={queueName}
                jobId={jobId}
              />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="min-w-0 space-y-4">
          <JobTimeline job={job} isLoading={isLoading} />
          <JobDetails
            job={job}
            jobId={jobId}
            queueName={queueName}
            orgSlug={orgSlug}
            connectionId={connectionId}
            isLoading={isLoading}
          />
          {linearIssueLinks.length > 0 ? (
            <Panel>
              <RailHeader title="Linked Linear issues" />
              <div className="flex flex-wrap gap-2 px-4 py-3">
                {linearIssueLinks.map((issue) => (
                  <Button key={issue.id} asChild variant="outline" size="xs">
                    <a href={issue.url} target="_blank" rel="noreferrer">
                      {issue.label}
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                  </Button>
                ))}
              </div>
            </Panel>
          ) : null}
        </aside>
      </div>

      {/* Duplicate Job Dialog */}
      {job && (
        <DuplicateJobDialog
          open={duplicateDialogOpen}
          onOpenChange={setDuplicateDialogOpen}
          queueName={queueName}
          originalJobId={job.id}
          originalJobName={job.name}
          originalJobData={job.data}
          originalJobOpts={job.opts}
          originalDelay={job.delay}
          onSuccess={() => {
            navigate({
              to: '/$orgSlug/c/$connectionId/queues/$queueName',
              params: { orgSlug, connectionId, queueName },
              search: {},
            })
          }}
        />
      )}

      {/* Retry Job Dialog - rendered whenever the job exists so it survives
          the status flipping away from 'failed' once the retry starts */}
      {job && (
        <RetryJobDialog
          queueName={queueName}
          jobId={job.id}
          jobName={job.name}
          jobData={job.data}
          retry={retryDialog}
        />
      )}

      {/* Invoke Job Dialog */}
      {job && job.status === 'delayed' && (
        <InvokeJobDialog
          open={invokeDialogOpen}
          onOpenChange={setInvokeDialogOpen}
          queueName={queueName}
          jobId={job.id}
          jobName={job.name}
          jobData={job.data}
          onSuccess={handleInvokeSuccess}
        />
      )}

      {/* Edit Job Data Dialog */}
      {job && (
        <EditJobDataDialog
          open={editJobDataDialogOpen}
          onOpenChange={handleEditJobDataDialogOpenChange}
          queueName={queueName}
          jobId={job.id}
          jobName={job.name}
          jobData={job.data}
          jobStatus={job.status}
        />
      )}
    </div>
  )
}

type JobRecord = NonNullable<ReturnType<typeof useJob>['data']>

const DASH = '—'

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`
}

function retriesLeftLabel(job: JobRecord): string | undefined {
  if (job.maxAttempts <= 0) return undefined
  const left = Math.max(0, job.maxAttempts - job.attemptsMade)
  if (left === 0) return 'no retries left'
  return left === 1 ? '1 attempt left' : `${left.toLocaleString()} attempts left`
}

/** Normalises BullMQ progress (a number, or an object a worker reported) for display. */
function readProgress(progress: unknown): { value: string; hint: string } {
  if (typeof progress === 'number') {
    return { value: `${progress}%`, hint: 'reported by worker' }
  }
  if (progress && typeof progress === 'object') {
    const record = progress as Record<string, unknown>
    const percent = typeof record.progress === 'number' ? record.progress : record.percent
    const stage = [record.stage, record.step, record.status, record.message].find(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0
    )
    return {
      value: typeof percent === 'number' ? `${percent}%` : 'custom',
      hint: stage ?? 'reported by worker',
    }
  }
  return { value: DASH, hint: 'none reported' }
}

/** The headline facts, in the order you ask them: how many tries, how long, how late. */
function JobMetrics({
  job,
  isLoading,
  backoff,
}: {
  job: JobRecord | undefined
  isLoading: boolean
  backoff: { type?: 'fixed' | 'exponential'; delay?: number } | undefined
}) {
  const failed = job?.status === 'failed'
  const delayed = job?.status === 'delayed'
  const duration =
    job?.processedOn && job.finishedOn && job.finishedOn >= job.processedOn
      ? formatDuration(job.finishedOn - job.processedOn)
      : DASH
  const wait =
    job?.processedOn && job.timestamp && job.processedOn >= job.timestamp
      ? formatDuration(job.processedOn - job.timestamp)
      : DASH
  const progress = readProgress(job?.progress)
  const attemptsHint = !job
    ? undefined
    : job.status === 'completed'
      ? job.stacktraceCount > 0
        ? `after ${plural(job.stacktraceCount, 'failure')}`
        : job.attemptsMade <= 1
          ? 'first try'
          : 'succeeded'
      : (retriesLeftLabel(job) ?? 'no retries configured')

  return (
    <MetricStrip>
      <Metric
        label="Attempts"
        tone={failed ? 'danger' : 'neutral'}
        emphasis={failed}
        loading={isLoading}
        value={
          <>
            {job?.attemptsMade ?? 0}
            {job && job.maxAttempts > 0 ? (
              <span className="text-faint"> / {job.maxAttempts}</span>
            ) : null}
          </>
        }
        hint={attemptsHint}
      />
      <Metric
        label="Duration"
        loading={isLoading}
        value={duration}
        hint={job?.status === 'active' ? 'still running' : 'last run'}
      />
      <Metric label="Wait" loading={isLoading} value={wait} hint="created → started" />
      {delayed ? (
        <Metric
          label="Runs in"
          tone="delayed"
          loading={isLoading}
          value={
            <RetryCountdown
              variant="value"
              fallback={DASH}
              processedOn={job?.processedOn}
              finishedOn={job?.finishedOn}
              attemptsMade={job?.attemptsMade ?? 0}
              maxAttempts={job?.maxAttempts ?? 1}
              backoff={backoff}
              status={job?.status}
              timestamp={job?.timestamp}
              delay={job?.delay}
            />
          }
          hint={
            (job?.attemptsMade ?? 0) > 0
              ? `retry ${(job?.attemptsMade ?? 0) + 1} of ${job?.maxAttempts ?? 1}`
              : job?.delay
                ? `${formatDuration(job.delay)} delay`
                : 'delayed'
          }
        />
      ) : (
        <Metric
          label="Delay"
          loading={isLoading}
          value={job?.delay ? formatDuration(job.delay) : DASH}
          hint={job?.delay ? 'before first run' : 'none'}
        />
      )}
      <Metric
        label="Priority"
        loading={isLoading}
        value={job?.priority ?? 0}
        hint={job?.priority ? 'lower runs first' : 'default'}
      />
      <Metric label="Progress" loading={isLoading} value={progress.value} hint={progress.hint} />
    </MetricStrip>
  )
}

function formatRelativeTime(timestamp: number, now: number): string {
  const diff = now - timestamp
  const abs = Math.abs(diff)
  const unit =
    abs < 5_000
      ? null
      : abs < 60_000
        ? `${Math.floor(abs / 1000)}s`
        : abs < 3_600_000
          ? `${Math.floor(abs / 60_000)}m`
          : abs < 86_400_000
            ? `${Math.floor(abs / 3_600_000)}h`
            : `${Math.floor(abs / 86_400_000)}d`
  if (!unit) return 'just now'
  return diff >= 0 ? `${unit} ago` : `in ${unit}`
}

/** Re-renders on an interval so relative times stay honest while the page is open. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(interval)
  }, [intervalMs])
  return now
}

interface TimelineEvent {
  key: string
  label: string
  at: number
  dot: string
  /** Time since the previous step, e.g. "waited 12ms". */
  note?: string
  upcoming?: boolean
}

function buildTimeline(job: JobRecord): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const neutral = 'bg-status-neutral'

  if (job.timestamp) {
    events.push({ key: 'created', label: 'Created', at: job.timestamp, dot: neutral })
  }
  if (job.status === 'delayed' && job.timestamp && job.delay && job.attemptsMade === 0) {
    events.push({
      key: 'scheduled',
      label: 'Scheduled to run',
      at: job.timestamp + job.delay,
      dot: 'bg-status-delayed',
      upcoming: true,
    })
  }
  if (job.processedOn) {
    events.push({
      key: 'started',
      label: job.attemptsMade > 1 ? `Started (attempt ${job.attemptsMade})` : 'Started',
      at: job.processedOn,
      dot: job.status === 'active' ? 'bg-status-active' : neutral,
      note:
        job.timestamp && job.processedOn >= job.timestamp
          ? `waited ${formatDuration(job.processedOn - job.timestamp)}`
          : undefined,
    })
  }
  if (job.finishedOn) {
    events.push({
      key: 'finished',
      label:
        job.status === 'failed' ? 'Failed' : job.status === 'completed' ? 'Completed' : 'Finished',
      at: job.finishedOn,
      dot:
        job.status === 'failed'
          ? 'bg-status-danger'
          : job.status === 'completed'
            ? 'bg-status-success'
            : neutral,
      note:
        job.processedOn && job.finishedOn >= job.processedOn
          ? `ran ${formatDuration(job.finishedOn - job.processedOn)}`
          : undefined,
    })
  }

  return events
}

function RailHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <PanelHeader>
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {children}
    </PanelHeader>
  )
}

/** Created → started → finished: relative for scanning, absolute (mono) for exactness. */
function JobTimeline({ job, isLoading }: { job: JobRecord | undefined; isLoading: boolean }) {
  const now = useNow(15_000)
  const events = job ? buildTimeline(job) : []

  return (
    <Panel>
      <RailHeader title="Timeline" />
      {isLoading ? (
        <div className="space-y-3 px-4 py-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : events.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          No timestamps recorded for this job.
        </p>
      ) : (
        <ol className="px-4 py-3">
          {events.map((event, index) => (
            <li key={event.key} className="relative flex gap-3 pb-3.5 last:pb-0">
              {index < events.length - 1 ? (
                <span
                  className="absolute bottom-0 left-[3.5px] top-3.5 w-px bg-border"
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  'relative mt-[5px] h-2 w-2 shrink-0 rounded-full',
                  event.upcoming ? 'bg-card ring-1 ring-inset ring-status-delayed' : event.dot
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium leading-[18px]">
                    {event.label}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatRelativeTime(event.at, now)}
                  </span>
                </div>
                <time
                  dateTime={new Date(event.at).toISOString()}
                  className="block font-mono text-xs leading-[18px] tabular-nums text-muted-foreground"
                >
                  {formatDateWithTimezone(event.at)}
                </time>
                {event.note ? (
                  <span className="block font-mono text-[11px] leading-[18px] text-faint">
                    {event.note}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

function formatOptionValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(
        ([key, entry]) =>
          `${key}: ${entry !== null && typeof entry === 'object' ? JSON.stringify(entry) : String(entry)}`
      )
      .join(', ')
  }
  return String(value)
}

function Fact({
  label,
  wide,
  children,
}: {
  label: string
  /** Option keys are longer than identity labels and set in mono. */
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'grid gap-3 text-xs leading-5',
        wide ? 'grid-cols-[124px_minmax(0,1fr)]' : 'grid-cols-[72px_minmax(0,1fr)]'
      )}
    >
      <dt className={cn('truncate text-muted-foreground', wide && 'font-mono')} title={label}>
        {label}
      </dt>
      <dd className="min-w-0 select-text font-mono text-foreground [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  )
}

/** Identity and options as a definition list: the facts you copy into a bug report. */
function JobDetails({
  job,
  jobId,
  queueName,
  orgSlug,
  connectionId,
  isLoading,
}: {
  job: JobRecord | undefined
  jobId: string
  queueName: string
  orgSlug: string
  connectionId: string
  isLoading: boolean
}) {
  // `jobId` repeats the identity row above.
  const options = Object.entries(job?.opts ?? {}).filter(
    ([key, value]) => key !== 'jobId' && value !== undefined
  )
  const schedulerKey = jobId.startsWith('repeat:') ? jobId.split(':').slice(1, -1).join(':') : null

  return (
    <Panel>
      <RailHeader title="Details" />
      {isLoading ? (
        <div className="space-y-2 px-4 py-3">
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <>
          <dl className="space-y-1.5 px-4 py-3">
            <Fact label="Name">{job?.name || <span className="text-faint">unnamed</span>}</Fact>
            <Fact label="ID">{jobId}</Fact>
            <Fact label="Queue">
              <Link
                to="/$orgSlug/c/$connectionId/queues/$queueName"
                params={{ orgSlug, connectionId, queueName }}
                search={{}}
                className="rounded-sm underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {queueName}
              </Link>
            </Fact>
            {schedulerKey ? <Fact label="Scheduler">{schedulerKey}</Fact> : null}
            {job?.parentKey ? <Fact label="Parent">{job.parentKey}</Fact> : null}
          </dl>
          <div className="flex items-center justify-between border-t bg-muted/50 py-1 pl-4 pr-1.5">
            <span className="eyebrow">Options</span>
            <CopyButton
              text={JSON.stringify(job?.opts ?? {}, null, 2)}
              label="Copy options as JSON"
            />
          </div>
          {options.length === 0 ? (
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
              No options set; queue defaults apply.
            </p>
          ) : (
            <dl className="space-y-1.5 border-t px-4 py-3">
              {options.map(([key, value]) => (
                <Fact key={key} label={key} wide>
                  {formatOptionValue(value)}
                </Fact>
              ))}
            </dl>
          )}
        </>
      )}
    </Panel>
  )
}

/** Quiet icon button that copies `text` and confirms with a check. */
function CopyButton({
  text,
  label,
  onCopied,
  disabled,
  className,
  tooltipSide,
}: {
  text: string | (() => string)
  label: string
  onCopied?: () => void
  disabled?: boolean
  className?: string
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(typeof text === 'function' ? text() : text)
      onCopied?.()
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7 shrink-0', className)}
            onClick={handleCopy}
            disabled={disabled}
            aria-label={label}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-status-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide}>{copied ? 'Copied!' : label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function CopyJobIdButton({ jobId }: { jobId: string }) {
  return (
    <CopyButton
      text={jobId}
      label="Copy job ID"
      tooltipSide="bottom"
      className="-ml-1 h-6 w-6"
      onCopied={() => trackEvent(AnalyticsEvents.JOB_DATA_COPIED, { job_id: jobId })}
    />
  )
}

// Log viewer component with infinite scrolling and virtualization
const KNOWN_LOG_LEVELS = new Set([
  'TRACE',
  'DEBUG',
  'INFO',
  'WARN',
  'WARNING',
  'ERROR',
  'FATAL',
  'SUCCESS',
  'CONTEXT',
])

/** Log levels map onto the status palette; only the level label carries colour. */
const LOG_LEVEL_STYLE: Record<string, string> = {
  TRACE: 'text-faint',
  DEBUG: 'text-muted-foreground',
  INFO: 'text-status-active',
  WARN: 'text-status-warning',
  WARNING: 'text-status-warning',
  ERROR: 'text-status-danger',
  FATAL: 'text-status-danger',
  SUCCESS: 'text-status-success',
  CONTEXT: 'text-status-priority',
}

const MAX_LOG_BODY_LENGTH = 220

interface ParsedLogLine {
  lineNumber: number
  raw: string
  timestamp?: string
  level?: string
  contextTags: string[]
  body: string
  bodyForDisplay: string
  isTruncated: boolean
}

function LogViewer({ queueName, jobId }: { queueName: string; jobId: string }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedLineNumbers, setExpandedLineNumbers] = useState<Set<number>>(new Set())
  const parentRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useJobLogs(
    queueName,
    jobId
  )

  // Flatten all pages into a single array
  const allLogs = data?.pages.flatMap((page) => page.logs) ?? []
  const totalLogs = data?.pages[0]?.count ?? 0
  const normalizedSearch = searchQuery.trim().toLowerCase()

  const parsedLogs = useMemo(
    () => allLogs.map((raw, index) => parseLogLine(raw, index + 1)),
    [allLogs]
  )

  const filteredLogs = useMemo(() => {
    if (!normalizedSearch) return parsedLogs
    return parsedLogs.filter((entry) => entry.raw.toLowerCase().includes(normalizedSearch))
  }, [parsedLogs, normalizedSearch])

  // Virtualizer for efficient rendering
  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 12,
  })

  // Re-measure rows when expansion changes because expanded rows have dynamic height.
  useEffect(() => {
    virtualizer.measure()
  }, [virtualizer])

  // Infinite scroll - load more when near bottom
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    )

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current)
    }

    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const updateSearchQuery = (nextSearch: string) => {
    setSearchQuery(nextSearch)
    parentRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }

  const docsLink = (
    <a
      href={LOG_FORMATTING_DOCS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      Log formatting docs
      <ExternalLink className="h-3 w-3" />
    </a>
  )

  if (isLoading) {
    return (
      <Panel>
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading logs...
        </div>
      </Panel>
    )
  }

  if (allLogs.length === 0) {
    return (
      <Panel>
        <EmptyState
          size="inline"
          icon={ScrollText}
          title="No logs available"
          description={
            <>
              Lines written with <code className="font-mono text-xs">job.log()</code> during
              processing appear here, newest last.
            </>
          }
          actions={docsLink}
        />
      </Panel>
    )
  }

  const countLabel = normalizedSearch
    ? `${filteredLogs.length.toLocaleString()} of ${allLogs.length.toLocaleString()} match`
    : totalLogs > allLogs.length
      ? `${allLogs.length.toLocaleString()} of ${totalLogs.toLocaleString()} loaded`
      : plural(allLogs.length, 'line')

  return (
    <Panel>
      <PanelHeader className="py-1.5">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={searchQuery}
            onChange={(event) => updateSearchQuery(event.target.value)}
            placeholder="Search log lines"
            className="h-7 pl-8 pr-8 font-mono text-xs"
            aria-label="Search job logs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => updateSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-faint transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="Clear log search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{countLabel}</span>
          <DeleteJobLogsButton
            queueName={queueName}
            jobId={jobId}
            logCount={totalLogs > 0 ? totalLogs : allLogs.length}
          />
          <CopyButton
            text={() => filteredLogs.map((entry) => entry.raw).join('\n')}
            label="Copy visible logs"
            disabled={filteredLogs.length === 0}
            onCopied={() => trackEvent(AnalyticsEvents.JOB_LOG_COPIED)}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <a
                    href={LOG_FORMATTING_DOCS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Log formatting docs"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Want better logs? Read log formatting docs</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </PanelHeader>

      <div ref={parentRef} className="max-h-[520px] overflow-auto py-1.5 font-mono text-xs">
        {filteredLogs.length > 0 ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const entry = filteredLogs[virtualRow.index]
              const isExpanded = expandedLineNumbers.has(entry.lineNumber)
              const bodyText = isExpanded ? entry.body : entry.bodyForDisplay

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={cn(
                    'flex min-h-7 gap-2 px-3 py-1 leading-5 hover:bg-muted/60',
                    isExpanded ? 'items-start bg-muted/40' : 'items-center'
                  )}
                  title={isExpanded ? undefined : entry.raw}
                >
                  <span className="w-7 shrink-0 select-none text-right tabular-nums text-faint">
                    {entry.lineNumber}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedLineNumbers((previous) => {
                        const next = new Set(previous)
                        if (next.has(entry.lineNumber)) {
                          next.delete(entry.lineNumber)
                        } else {
                          next.add(entry.lineNumber)
                        }
                        return next
                      })
                    }
                    className="flex h-5 shrink-0 items-center rounded-sm text-faint transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    aria-label={isExpanded ? 'Collapse log line' : 'Expand log line'}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <div
                    className={cn(
                      'flex min-w-0 gap-2.5',
                      isExpanded ? 'flex-wrap items-start' : 'items-center'
                    )}
                  >
                    {entry.timestamp && (
                      <span className="shrink-0 tabular-nums">
                        {renderTimestamp(entry.timestamp, normalizedSearch)}
                      </span>
                    )}

                    {entry.level && (
                      <span
                        className={cn(
                          'w-[38px] shrink-0 text-[11px] font-semibold tracking-wide',
                          LOG_LEVEL_STYLE[entry.level] ?? LOG_LEVEL_STYLE.CONTEXT
                        )}
                      >
                        {renderTextWithMatch(entry.level, normalizedSearch)}
                      </span>
                    )}

                    {entry.contextTags.map((tag) => (
                      <span
                        key={`${entry.lineNumber}-${tag}`}
                        className="shrink-0 text-muted-foreground"
                      >
                        [{renderTextWithMatch(tag, normalizedSearch)}]
                      </span>
                    ))}

                    <span
                      className={cn(
                        'min-w-0 select-text text-foreground',
                        isExpanded ? 'whitespace-pre-wrap break-all' : 'truncate'
                      )}
                    >
                      {renderLogBody(bodyText, normalizedSearch)}
                      {!isExpanded && entry.isTruncated && (
                        <span className="text-faint"> [truncated for readability]</span>
                      )}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState
            size="inline"
            icon={Search}
            title="No logs match your search."
            description="Try a different keyword or clear search."
            actions={
              <Button variant="outline" size="xs" onClick={() => updateSearchQuery('')}>
                Clear search
              </Button>
            }
          />
        )}

        {/* Load more trigger */}
        <div ref={loadMoreRef} className="h-px" />

        {/* Loading indicator */}
        {isFetchingNextPage && (
          <div className="flex items-center justify-center gap-2 py-2 font-sans text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Loading more logs...</span>
          </div>
        )}
      </div>
    </Panel>
  )
}

function parseLogLine(raw: string, lineNumber: number): ParsedLogLine {
  let remaining = raw.trim()
  let timestamp: string | undefined
  let level: string | undefined
  const contextTags: string[] = []

  const firstBracket = extractBracketToken(remaining)
  if (firstBracket && looksLikeTimestamp(firstBracket.token)) {
    timestamp = firstBracket.token
    remaining = firstBracket.rest.trimStart()
  } else {
    const isoPrefixMatch = remaining.match(/^(\d{4}-\d{2}-\d{2}[T ][^\s]+)\s*/)
    if (isoPrefixMatch) {
      timestamp = isoPrefixMatch[1]
      remaining = remaining.slice(isoPrefixMatch[0].length).trimStart()
    }
  }

  const secondBracket = extractBracketToken(remaining)
  if (secondBracket) {
    const maybeLevel = normalizeLogLevel(secondBracket.token)
    if (maybeLevel) {
      level = maybeLevel
      remaining = secondBracket.rest.trimStart()
    }
  }

  if (!level) {
    const plainLevelMatch = remaining.match(
      /^(trace|debug|info|warn|warning|error|fatal|success|context)\b[:\s-]*/i
    )
    if (plainLevelMatch) {
      level = normalizeLogLevel(plainLevelMatch[1])
      remaining = remaining.slice(plainLevelMatch[0].length).trimStart()
    }
  }

  for (let index = 0; index < 4; index++) {
    const token = extractBracketToken(remaining)
    if (!token) break

    const maybeLevel = normalizeLogLevel(token.token)
    if (!level && maybeLevel) {
      level = maybeLevel
      remaining = token.rest.trimStart()
      continue
    }

    if (!timestamp && looksLikeTimestamp(token.token)) {
      timestamp = token.token
      remaining = token.rest.trimStart()
      continue
    }

    contextTags.push(token.token)
    remaining = token.rest.trimStart()
  }

  const body = remaining.length > 0 ? remaining : raw
  const { text: bodyForDisplay, isTruncated } = truncateLine(body, MAX_LOG_BODY_LENGTH)

  return {
    lineNumber,
    raw,
    timestamp,
    level,
    contextTags,
    body,
    bodyForDisplay,
    isTruncated,
  }
}

function extractBracketToken(text: string): { token: string; rest: string } | null {
  const match = text.match(/^\[([^\]]+)\]\s*/)
  if (!match) return null
  return {
    token: match[1],
    rest: text.slice(match[0].length),
  }
}

function normalizeLogLevel(value: string): string | undefined {
  const upper = value.trim().toUpperCase()
  return KNOWN_LOG_LEVELS.has(upper) ? upper : undefined
}

function looksLikeTimestamp(value: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}[T ][\d:.+-]+Z?$/.test(value)) return true
  if (/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}/.test(value)) return true
  return !Number.isNaN(Date.parse(value))
}

function truncateLine(text: string, maxChars: number): { text: string; isTruncated: boolean } {
  if (text.length <= maxChars) {
    return { text, isTruncated: false }
  }

  return {
    text: `${text.slice(0, Math.max(0, maxChars - 1))}…`,
    isTruncated: true,
  }
}

function renderLogBody(text: string, searchQuery: string): React.ReactNode {
  const parts = text.split(/(\s+\|\s+)/)

  return parts.map((part, index) => {
    if (part.trim() === '|') {
      return (
        <span key={`sep-${index}`} className="text-faint">
          {part}
        </span>
      )
    }

    const keyValueMatch = part.match(/^([A-Za-z0-9_.-]+)(=)(.+)$/)
    if (keyValueMatch) {
      const [, key, separator, value] = keyValueMatch
      return (
        <span key={`kv-${index}`}>
          <span className="text-muted-foreground">{renderTextWithMatch(key, searchQuery)}</span>
          <span className="text-faint">{separator}</span>
          <span className="text-foreground">{renderTextWithMatch(value, searchQuery)}</span>
        </span>
      )
    }

    // A trailing JSON object is context for the message, so it recedes.
    const jsonStart = part.search(/\s[{[]/)
    if (jsonStart > 0 && /[}\]]\s*$/.test(part)) {
      return (
        <span key={`txt-${index}`}>
          {renderTextWithMatch(part.slice(0, jsonStart), searchQuery)}
          <span className="text-muted-foreground">
            {renderTextWithMatch(part.slice(jsonStart), searchQuery)}
          </span>
        </span>
      )
    }

    return <span key={`txt-${index}`}>{renderTextWithMatch(part, searchQuery)}</span>
  })
}

function renderTimestamp(timestamp: string, searchQuery: string): React.ReactNode {
  const parsedTimestamp = parseTimestampParts(timestamp)

  if (!parsedTimestamp) {
    return (
      <span className="text-muted-foreground">{renderTextWithMatch(timestamp, searchQuery)}</span>
    )
  }

  return (
    <>
      <span className="hidden text-faint lg:inline">
        {renderTextWithMatch(parsedTimestamp.date, searchQuery)}{' '}
      </span>
      <span className="text-muted-foreground">
        {renderTextWithMatch(parsedTimestamp.time, searchQuery)}
      </span>
      {parsedTimestamp.timezone && (
        <span className="text-faint">
          {renderTextWithMatch(parsedTimestamp.timezone, searchQuery)}
        </span>
      )}
    </>
  )
}

function parseTimestampParts(
  timestamp: string
): { date: string; time: string; timezone?: string } | null {
  const match = timestamp.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:?\d{2})?$/
  )

  if (!match) {
    return null
  }

  return {
    date: match[1],
    time: match[2],
    timezone: match[3],
  }
}

function renderTextWithMatch(text: string, searchQuery: string): React.ReactNode {
  if (!searchQuery) {
    return text
  }

  const search = searchQuery.toLowerCase()
  const source = text.toLowerCase()
  const pieces: React.ReactNode[] = []
  let cursor = 0

  while (cursor < text.length) {
    const matchIndex = source.indexOf(search, cursor)
    if (matchIndex === -1) {
      pieces.push(text.slice(cursor))
      break
    }

    if (matchIndex > cursor) {
      pieces.push(text.slice(cursor, matchIndex))
    }

    pieces.push(
      <mark
        key={`${matchIndex}-${cursor}`}
        className="rounded-[2px] bg-status-warning/25 text-foreground"
      >
        {text.slice(matchIndex, matchIndex + search.length)}
      </mark>
    )
    cursor = matchIndex + search.length
  }

  return pieces
}
