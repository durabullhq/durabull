import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { zodValidator } from '@tanstack/zod-adapter'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  CopyPlus,
  ExternalLink,
  FileJson2,
  History,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  ScrollText,
  Search,
  Settings2,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { useAppTopBar } from '@/components/app-top-bar'
import { DeleteJobLogsButton } from '@/components/delete-job-logs-button'
import { DuplicateJobDialog } from '@/components/duplicate-job-dialog'
import { FailedAttempts } from '@/components/failed-attempts'
import { InvokeJobDialog } from '@/components/invoke-job-dialog'
import { JobRemoveButton } from '@/components/job-remove-button'
import { JsonViewer } from '@/components/json-viewer'
import { QueueNameTag } from '@/components/queue-name-tag'
import { RetryCountdown } from '@/components/retry-countdown'
import { RetryJobDialog, type RetryJobPhase } from '@/components/retry-job-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useConnectionAlertEvents } from '@/hooks/use-alerts'
import { useJob, useJobLogs, useRemoveJobs, useRetryJobs } from '@/hooks/use-queues'
import { cn, formatDate, formatDuration, getTimezoneAbbreviation } from '@/lib/utils'

const jobSearchSchema = z.object({
  tab: z.enum(['attempts', 'data', 'logs', 'options']).catch('data'),
})

const LOG_FORMATTING_DOCS_URL =
  'https://durabull.io/documentation/workflows/log-formatting-and-highlighting'

const JOB_STATUS_CONFIG: Record<string, { variant: string; color: string }> = {
  waiting: { variant: 'secondary', color: 'text-muted-foreground' },
  active: { variant: 'default', color: 'text-status-active' },
  delayed: { variant: 'warning', color: 'text-status-delayed' },
  completed: { variant: 'success', color: 'text-status-success' },
  failed: { variant: 'destructive', color: 'text-status-danger' },
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
  const [retryDialogOpen, setRetryDialogOpen] = useState(false)
  const [retryPhase, setRetryPhase] = useState<RetryJobPhase>('retrying')
  const [retryErrorMessage, setRetryErrorMessage] = useState<string | null>(null)

  const { data: job, isLoading, error } = useJob(queueName, jobId)
  const { data: logsData } = useJobLogs(queueName, jobId)
  const alertEventsQuery = useConnectionAlertEvents(connectionId, {
    queueName,
    jobId,
    limit: 20,
  })

  const removeMutation = useRemoveJobs()
  const { mutateAsync: retryJobs } = useRetryJobs()

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

  // Truncate long job IDs intelligently - show meaningful parts (must be before early returns)
  const truncatedJobId = useMemo(() => {
    const id = job?.id ?? ''
    if (id.length <= 36) return id
    // Show first 16 + … + last 16 chars for long IDs
    return `${id.slice(0, 16)}…${id.slice(-16)}`
  }, [job?.id])

  const isIdTruncated = (job?.id?.length ?? 0) > 36

  const hasFailedAttempts = (job?.stacktraceCount ?? 0) > 0
  const hasFailed = job?.status === 'failed'

  const runJobRetry = useCallback(async () => {
    setRetryPhase('retrying')
    setRetryErrorMessage(null)

    try {
      const result = await retryJobs({
        queueName,
        jobIds: [jobId],
      })

      if (result.success > 0 && result.failed === 0) {
        setRetryPhase('success')
        return
      }

      const apiError =
        result.errors.find((entry) => entry.jobId === jobId)?.error ??
        (result.failed > 0
          ? 'The job could not be retried.'
          : 'The job was not in a failed state and could not be retried.')

      setRetryErrorMessage(apiError)
      setRetryPhase('error')
    } catch (error) {
      setRetryErrorMessage(
        error instanceof Error ? error.message : 'An unexpected error occurred while retrying.'
      )
      setRetryPhase('error')
    }
  }, [jobId, queueName, retryJobs])

  const handleOpenRetryDialog = useCallback(() => {
    setRetryDialogOpen(true)
    void runJobRetry()
  }, [runJobRetry])

  const handleRetryDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setRetryPhase('retrying')
      setRetryErrorMessage(null)
    }
    setRetryDialogOpen(open)
  }, [])

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

  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Layers className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex items-center gap-1.5">
            <Link
              to="/$orgSlug/c/$connectionId"
              params={{ orgSlug, connectionId }}
              className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Queues
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            <Link
              to="/$orgSlug/c/$connectionId/queues/$queueName"
              params={{ orgSlug, connectionId, queueName }}
              search={{}}
              className="max-w-40 truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {queueName}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            {isLoading ? (
              <Skeleton className="h-6 w-44" />
            ) : (
              <>
                <h1 className="truncate text-base font-semibold md:text-lg">
                  {job?.name || 'Job'}
                </h1>
                {!isLoading && job?.status && (
                  <Badge
                    variant={(JOB_STATUS_CONFIG[job.status]?.variant as 'default') || 'secondary'}
                    className="h-6 px-2.5 text-xs capitalize"
                  >
                    {job.status}
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
      ),
      actions: (
        <>
          {job?.status === 'failed' && (
            <Button
              variant="outline"
              size="xs"
              onClick={handleOpenRetryDialog}
              className="border-status-success/30 text-status-success hover:bg-status-success/10 hover:text-status-success"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry Job
            </Button>
          )}
          {job?.status === 'delayed' && (
            <Button variant="outline" size="xs" onClick={() => setInvokeDialogOpen(true)}>
              <Zap className="mr-2 h-4 w-4" />
              Invoke
            </Button>
          )}
          <Button
            variant="outline"
            size="xs"
            onClick={() => setDuplicateDialogOpen(true)}
            disabled={!job}
          >
            <CopyPlus className="mr-2 h-4 w-4" />
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
          {job?.status === 'failed' && (
            <DropdownMenuItem onClick={handleOpenRetryDialog}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry Job
            </DropdownMenuItem>
          )}
          {job?.status === 'delayed' && (
            <DropdownMenuItem onClick={() => setInvokeDialogOpen(true)}>
              <Zap className="mr-2 h-4 w-4" />
              Invoke Job
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDuplicateDialogOpen(true)} disabled={!job}>
            <CopyPlus className="mr-2 h-4 w-4" />
            Duplicate Job
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {isScheduledJob ? (
            <DropdownMenuItem
              onClick={() => handleRemove(true)}
              disabled={removeMutation.isPending}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove Job & Stop Scheduler
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => handleRemove(false)}
              disabled={removeMutation.isPending}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove Job
            </DropdownMenuItem>
          )}
        </>
      ),
    }),
    [
      connectionId,
      handleRemove,
      handleOpenRetryDialog,
      isLoading,
      job,
      orgSlug,
      queueName,
      removeMutation.isPending,
      isScheduledJob,
    ]
  )

  useAppTopBar(topBarConfig)

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Job not found</h2>
        <p className="text-muted-foreground mb-4">{error.message}</p>
        <Button
          variant="outline"
          onClick={() =>
            navigate({
              to: '/$orgSlug/c/$connectionId/queues/$queueName',
              params: { orgSlug, connectionId, queueName },
              search: {},
            })
          }
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Queue
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <QueueNameTag name={queueName} asLink size="sm" />
        <span>/</span>
        <span className="truncate">{job?.name}</span>
        <span className="text-border">•</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <code className="max-w-[18rem] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {truncatedJobId}
              </code>
            </TooltipTrigger>
            {isIdTruncated && (
              <TooltipContent side="bottom" className="max-w-lg break-all p-3 font-mono text-xs">
                {job?.id}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        <CopyJobIdButton jobId={job?.id ?? ''} />
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label={`Created (${getTimezoneAbbreviation()})`}
          value={formatDate(job?.timestamp)}
          icon={<Clock className="h-4 w-4" />}
          isLoading={isLoading}
        />
        <StatCard
          label={`Processed (${getTimezoneAbbreviation()})`}
          value={formatDate(job?.processedOn)}
          isLoading={isLoading}
        />
        <StatCard
          label={`Finished (${getTimezoneAbbreviation()})`}
          value={formatDate(job?.finishedOn)}
          isLoading={isLoading}
        />
        <StatCard
          label="Duration"
          value={
            job?.processedOn && job?.finishedOn
              ? formatDuration(job.finishedOn - job.processedOn)
              : '-'
          }
          isLoading={isLoading}
        />
        <StatCard
          label="Attempts"
          value={
            <div className="flex items-center gap-2">
              <span className={hasFailed ? 'text-destructive' : ''}>{job?.attemptsMade}</span>
              <span className="text-muted-foreground font-normal">/ {job?.maxAttempts}</span>
            </div>
          }
          isLoading={isLoading}
          highlight={hasFailed}
        />
      </div>

      {/* Countdown - shows when job is waiting for retry or is delayed */}
      <RetryCountdown
        processedOn={job?.processedOn}
        finishedOn={job?.finishedOn}
        attemptsMade={job?.attemptsMade ?? 0}
        maxAttempts={job?.maxAttempts ?? 1}
        backoff={
          job?.opts?.backoff as { type?: 'fixed' | 'exponential'; delay?: number } | undefined
        }
        status={job?.status}
        timestamp={job?.timestamp}
        delay={job?.delay}
      />

      {/* Failed reason alert - prominent for failed jobs */}
      {job?.failedReason && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Error Message
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorDisplay error={job.failedReason} />
          </CardContent>
        </Card>
      )}

      {linearIssueLinks.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ExternalLink className="h-4 w-4" />
              Linked Linear issues
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {linearIssueLinks.map((issue) => (
              <Button key={issue.id} asChild variant="outline" size="sm">
                <a href={issue.url} target="_blank" rel="noreferrer">
                  {issue.label}
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(newTab) => {
          handleTabChange(newTab)
          navigate({
            to: '.',
            search: { tab: newTab as typeof tab },
            replace: true,
          })
        }}
      >
        <TabsList className="w-full justify-start">
          {(hasFailedAttempts || hasFailed) && (
            <TabsTrigger value="attempts" className="gap-2">
              <History className="h-4 w-4" />
              Failed Attempts
              {hasFailedAttempts && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                  {(job?.stacktraceCount ?? 0).toLocaleString()}
                </Badge>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="data" className="gap-2">
            <FileJson2 className="h-4 w-4" />
            Job Data
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <ScrollText className="h-4 w-4" />
            Logs
            {logsData?.pages?.[0]?.count ? (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {logsData.pages[0].count.toLocaleString()}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="options" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Options
          </TabsTrigger>
        </TabsList>

        {/* Failed Attempts Tab */}
        {(hasFailedAttempts || hasFailed) && (
          <TabsContent value="attempts" className="mt-6">
            <FailedAttempts
              queueName={queueName}
              jobId={jobId}
              attemptsMade={job?.attemptsMade ?? 0}
              maxAttempts={job?.maxAttempts ?? 1}
              stacktraceCount={job?.stacktraceCount ?? 0}
              failedReason={job?.failedReason}
              processedOn={job?.processedOn}
              finishedOn={job?.finishedOn}
              backoff={
                job?.opts?.backoff as { type?: 'fixed' | 'exponential'; delay?: number } | undefined
              }
              status={job?.status}
            />
          </TabsContent>
        )}

        {/* Job Data Tab */}
        <TabsContent value="data" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileJson2 className="h-4 w-4" />
                Job Payload
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48" />
              ) : (
                <JsonViewer data={job?.data} maxInitialDepth={3} />
              )}
            </CardContent>
          </Card>

          {/* Return value if completed */}
          {job?.returnvalue != null && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-status-success">
                  <Check className="h-4 w-4" />
                  Return Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <JsonViewer data={job.returnvalue} maxInitialDepth={3} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ScrollText className="h-4 w-4" />
                Job Logs
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs">
                <a href={LOG_FORMATTING_DOCS_URL} target="_blank" rel="noopener noreferrer">
                  <Info className="h-3.5 w-3.5 mr-1.5" />
                  Want better logs? Read log formatting docs
                </a>
              </Button>
            </CardHeader>
            <CardContent>
              <LogViewer queueName={queueName} jobId={jobId} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Options Tab */}
        <TabsContent value="options" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Job Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48" />
              ) : (
                <JsonViewer data={job?.opts} maxInitialDepth={2} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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

      {/* Retry Job Dialog */}
      {job && job.status === 'failed' && (
        <RetryJobDialog
          open={retryDialogOpen}
          onOpenChange={handleRetryDialogOpenChange}
          queueName={queueName}
          jobId={job.id}
          jobName={job.name}
          phase={retryPhase}
          errorMessage={retryErrorMessage}
          onRetry={() => void runJobRetry()}
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
    </div>
  )
}

// Stat card component
function StatCard({
  label,
  value,
  icon,
  isLoading,
  highlight,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  isLoading?: boolean
  highlight?: boolean
}) {
  return (
    <Card className={highlight ? 'border-destructive/30' : ''}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-5 w-24" />
        ) : (
          <div className="text-sm font-semibold">{value}</div>
        )}
      </CardContent>
    </Card>
  )
}

// Error display component with copy functionality
function ErrorDisplay({ error }: { error: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(error)
      trackEvent(AnalyticsEvents.JOB_ERROR_COPIED)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="relative group">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-status-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? 'Copied!' : 'Copy error'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <pre className="text-sm text-destructive bg-destructive/10 p-4 rounded-lg overflow-auto max-h-48 font-mono whitespace-pre-wrap wrap-break-word">
        {error}
      </pre>
    </div>
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

const LOG_LEVEL_STYLE: Record<string, { badge: string; accent: string }> = {
  TRACE: {
    badge: 'border-[#8b949e]/40 bg-[#8b949e]/10 text-[#8b949e]',
    accent: 'border-l-[#8b949e]/30',
  },
  DEBUG: {
    badge: 'border-[#79c0ff]/40 bg-[#79c0ff]/10 text-[#79c0ff]',
    accent: 'border-l-[#79c0ff]/40',
  },
  INFO: {
    badge: 'border-[#7ee787]/40 bg-[#7ee787]/10 text-[#7ee787]',
    accent: 'border-l-[#7ee787]/40',
  },
  WARN: {
    badge: 'border-[#d29922]/40 bg-[#d29922]/10 text-[#d29922]',
    accent: 'border-l-[#d29922]/40',
  },
  WARNING: {
    badge: 'border-[#d29922]/40 bg-[#d29922]/10 text-[#d29922]',
    accent: 'border-l-[#d29922]/40',
  },
  ERROR: {
    badge: 'border-[#ff7b72]/40 bg-[#ff7b72]/10 text-[#ff7b72]',
    accent: 'border-l-[#ff7b72]/40',
  },
  FATAL: {
    badge: 'border-[#ffa198]/40 bg-[#ffa198]/10 text-[#ffa198]',
    accent: 'border-l-[#ffa198]/40',
  },
  SUCCESS: {
    badge: 'border-[#56d364]/40 bg-[#56d364]/10 text-[#56d364]',
    accent: 'border-l-[#56d364]/40',
  },
  CONTEXT: {
    badge: 'border-[#d2a8ff]/40 bg-[#d2a8ff]/10 text-[#d2a8ff]',
    accent: 'border-l-[#d2a8ff]/40',
  },
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
  const [copied, setCopied] = useState(false)
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
    estimateSize: () => 36,
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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(filteredLogs.map((entry) => entry.raw).join('\n'))
      trackEvent(AnalyticsEvents.JOB_LOG_COPIED)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading logs...</p>
      </div>
    )
  }

  if (allLogs.length === 0) {
    return (
      <div className="py-12 text-center">
        <ScrollText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground">No logs available</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Logs can be added using job.log() during processing
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[#8b949e]" />
          <Input
            value={searchQuery}
            onChange={(event) => updateSearchQuery(event.target.value)}
            placeholder="Search log lines"
            className="h-9 border-[#30363d] bg-[#0d1117] pl-8 pr-8 font-mono text-xs text-[#c9d1d9] placeholder:text-[#8b949e] focus-visible:ring-[#1f6feb]"
            aria-label="Search job logs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => updateSearchQuery('')}
              className="absolute right-2 top-2 rounded p-0.5 text-[#8b949e] hover:text-[#c9d1d9]"
              aria-label="Clear log search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-xs text-muted-foreground">
            {normalizedSearch
              ? `${filteredLogs.length.toLocaleString()} of ${allLogs.length.toLocaleString()} matching logs`
              : `${allLogs.length.toLocaleString()} loaded logs`}
          </span>
          <DeleteJobLogsButton
            queueName={queueName}
            jobId={jobId}
            logCount={totalLogs > 0 ? totalLogs : allLogs.length}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleCopy}
                  disabled={filteredLogs.length === 0}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-status-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copied ? 'Copied!' : 'Copy visible logs'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="rounded-lg bg-[#0d1117] border border-[#30363d] overflow-hidden">
        <div ref={parentRef} className="p-4 overflow-auto max-h-[500px] font-mono text-sm">
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
                const levelStyle = entry.level
                  ? (LOG_LEVEL_STYLE[entry.level] ?? LOG_LEVEL_STYLE.CONTEXT)
                  : undefined
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
                      'min-h-8 rounded px-2 py-1 hover:bg-[#161b22] flex gap-3',
                      isExpanded ? 'items-start' : 'items-center'
                    )}
                    title={isExpanded ? undefined : entry.raw}
                  >
                    <span className="text-[#8b949e] select-none w-8 text-right shrink-0 text-xs">
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
                      className={cn(
                        'shrink-0 mt-0.5 rounded text-[#8b949e] hover:text-[#c9d1d9] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1f6feb]'
                      )}
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
                        'min-w-0 flex gap-2 text-xs leading-relaxed',
                        isExpanded ? 'items-start' : 'items-center'
                      )}
                    >
                      {entry.timestamp && (
                        <span className="shrink-0">
                          {renderTimestampBadge(entry.timestamp, normalizedSearch)}
                        </span>
                      )}

                      {entry.level && (
                        <span
                          className={cn(
                            'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide',
                            levelStyle?.badge ??
                              'border-[#d2a8ff]/40 bg-[#d2a8ff]/10 text-[#d2a8ff]'
                          )}
                        >
                          {renderTextWithMatch(entry.level, normalizedSearch)}
                        </span>
                      )}

                      {entry.contextTags.map((tag) => (
                        <span
                          key={`${entry.lineNumber}-${tag}`}
                          className="text-[#d2a8ff] shrink-0"
                        >
                          [{renderTextWithMatch(tag, normalizedSearch)}]
                        </span>
                      ))}

                      <span
                        className={cn(
                          'min-w-0 text-[#c9d1d9]',
                          isExpanded ? 'whitespace-pre-wrap break-all' : 'truncate'
                        )}
                      >
                        {renderLogBody(bodyText, normalizedSearch)}
                        {!isExpanded && entry.isTruncated && (
                          <span className="text-[#8b949e]"> [truncated for readability]</span>
                        )}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-md border border-[#30363d] bg-[#0f1520] px-4 py-6 text-center">
              <p className="text-sm text-[#c9d1d9]">No logs match your search.</p>
              <p className="mt-1 text-xs text-[#8b949e]">
                Try a different keyword or clear search.
              </p>
            </div>
          )}

          {/* Load more trigger */}
          <div ref={loadMoreRef} className="h-4" />

          {/* Loading indicator */}
          {isFetchingNextPage && (
            <div className="flex items-center justify-center py-2 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Loading more logs...</span>
            </div>
          )}
        </div>
      </div>

      {/* Total count indicator */}
      {totalLogs > 0 && (
        <div className="flex justify-end mt-2">
          <span className="text-xs text-muted-foreground">
            Showing {allLogs.length.toLocaleString()} of {totalLogs.toLocaleString()} logs loaded
          </span>
        </div>
      )}
    </div>
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
        <span key={`sep-${index}`} className="text-[#8b949e]">
          {part}
        </span>
      )
    }

    const keyValueMatch = part.match(/^([A-Za-z0-9_.-]+)(=)(.+)$/)
    if (keyValueMatch) {
      const [, key, separator, value] = keyValueMatch
      return (
        <span key={`kv-${index}`}>
          <span className="text-[#7ee787]">{renderTextWithMatch(key, searchQuery)}</span>
          <span className="text-[#8b949e]">{separator}</span>
          <span className="text-[#79c0ff]">{renderTextWithMatch(value, searchQuery)}</span>
        </span>
      )
    }

    const trimmed = part.trim()
    const isJsonLike =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    const isErrorText = /(error|exception|failed|timeout)/i.test(part)

    return (
      <span
        key={`txt-${index}`}
        className={cn(
          isJsonLike && 'text-[#a5d6ff]',
          isErrorText && !isJsonLike && 'text-[#ff7b72]',
          !isJsonLike && !isErrorText && 'text-[#c9d1d9]'
        )}
      >
        {renderTextWithMatch(part, searchQuery)}
      </span>
    )
  })
}

function renderTimestampBadge(timestamp: string, searchQuery: string): React.ReactNode {
  const parsedTimestamp = parseTimestampParts(timestamp)

  if (!parsedTimestamp) {
    return (
      <span className="inline-flex items-center rounded-md border border-[#2b3442] bg-[#0f1724] px-1.5 py-0.5 text-[10px] text-[#8b949e]">
        {renderTextWithMatch(timestamp, searchQuery)}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#2b3442] bg-[#0f1724] px-1.5 py-0.5 text-[10px] leading-none">
      <span className="text-[#8b949e]">
        {renderTextWithMatch(parsedTimestamp.date, searchQuery)}
      </span>
      <span className="text-[#79c0ff]">
        {renderTextWithMatch(parsedTimestamp.time, searchQuery)}
      </span>
      {parsedTimestamp.timezone && (
        <span className="text-[#d2a8ff]">
          {renderTextWithMatch(parsedTimestamp.timezone, searchQuery)}
        </span>
      )}
    </span>
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
        className="rounded bg-[#e3b341]/25 px-0.5 text-[#f2cc60]"
      >
        {text.slice(matchIndex, matchIndex + search.length)}
      </mark>
    )
    cursor = matchIndex + search.length
  }

  return pieces
}

// Copy Job ID button with animated feedback
function CopyJobIdButton({ jobId }: { jobId: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jobId)
      trackEvent(AnalyticsEvents.JOB_DATA_COPIED, { job_id: jobId })
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
            className="h-7 w-7 opacity-50 hover:opacity-100 transition-all shrink-0"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-status-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{copied ? 'Copied!' : 'Copy job ID'}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
