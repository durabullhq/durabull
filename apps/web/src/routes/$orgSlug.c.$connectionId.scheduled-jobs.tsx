import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  ExternalLink,
  Globe,
  Layers,
  MapPin,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { QueueNameTag } from '@/components/queue-name-tag'
import { StatusIndicator } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { type ListScheduledJobsResponse, useScheduledJobs } from '@/hooks/use-queues'
import { getCronDescription, getScheduleExpression, getScheduleSummary } from '@/lib/scheduled-jobs'
import { cn, formatDate, getTimezoneAbbreviation } from '@/lib/utils'

type ScheduledJob = ListScheduledJobsResponse['scheduledJobs'][number]

function getLocalTimeFromUTC(pattern: string): string {
  try {
    // Get the UTC offset in hours
    const offsetMinutes = new Date().getTimezoneOffset()
    const offsetHours = -offsetMinutes / 60
    const sign = offsetHours >= 0 ? '+' : ''

    // Parse basic time patterns to show local equivalent
    const parts = pattern.trim().split(/\s+/)

    // Handle 5-field (minute hour day month weekday) or 6-field (second minute hour day month weekday)
    const hasSeconds = parts.length === 6
    const minuteIndex = hasSeconds ? 1 : 0
    const hourIndex = hasSeconds ? 2 : 1

    const minute = parts[minuteIndex]
    const hour = parts[hourIndex]

    // Only convert if we have specific hour/minute values (not wildcards or ranges)
    if (
      hour &&
      hour !== '*' &&
      !hour.includes('/') &&
      !hour.includes('-') &&
      !hour.includes(',') &&
      minute &&
      !minute.includes('/') &&
      !minute.includes('-')
    ) {
      const utcHour = parseInt(hour, 10)
      const minuteVal = minute === '*' ? 0 : parseInt(minute.split(',')[0], 10)

      if (!Number.isNaN(utcHour) && !Number.isNaN(minuteVal)) {
        // Create a date in UTC and convert to local
        const now = new Date()
        const utcDate = new Date(
          Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), utcHour, minuteVal)
        )

        const localHour = utcDate.getHours()
        const localMinute = utcDate.getMinutes()
        const period = localHour >= 12 ? 'PM' : 'AM'
        const displayHour = localHour % 12 || 12

        return `${displayHour}:${localMinute.toString().padStart(2, '0')} ${period} ${getTimezoneAbbreviation()}`
      }
    }

    return `UTC${sign}${offsetHours}`
  } catch {
    return getTimezoneAbbreviation()
  }
}

function CronPatternTooltip({ pattern, timezone }: { pattern: string; timezone?: string }) {
  const description = getCronDescription(pattern)
  const localTime = !timezone || timezone === 'UTC' ? getLocalTimeFromUTC(pattern) : null
  const hasLocalPreview = localTime !== null && !localTime.startsWith('UTC')

  return (
    <div className="space-y-3 py-1">
      <div className="flex items-start gap-2">
        <Globe className="h-4 w-4 text-status-active mt-0.5 shrink-0" />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-status-active font-medium">
            Configured Schedule
          </div>
          <div className="text-sm font-medium text-primary-foreground">{description}</div>
          <div className="text-xs text-primary-foreground/70 mt-1">{timezone ?? 'UTC'}</div>
        </div>
      </div>

      {hasLocalPreview && (
        <>
          <div className="border-t border-primary-foreground/20" />
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-status-success font-medium">
                Your Local Time
              </div>
              <div className="text-sm font-medium text-primary-foreground">{localTime}</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface QueueGroup {
  queueName: string
  jobs: ScheduledJob[]
  hasFailures: boolean
  totalFailures: number
}

export const Route = createFileRoute('/$orgSlug/c/$connectionId/scheduled-jobs')({
  component: ScheduledJobsPage,
})

function ScheduledJobsPage() {
  const { orgSlug, connectionId } = Route.useParams()
  const { data, isLoading, error } = useScheduledJobs()
  const [expandedQueues, setExpandedQueues] = useState<Set<string>>(new Set())
  const hasInitializedExpansion = useRef(false)
  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Calendar className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Scheduled Jobs</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">
            View and manage scheduled cron jobs across queues
          </span>
        </div>
      ),
    }),
    []
  )

  useAppTopBar(topBarConfig)

  useEffect(() => {
    trackEvent(AnalyticsEvents.SCHEDULED_JOBS_VIEWED)
  }, [])

  // Group jobs by queue
  const groupedQueues = useMemo<QueueGroup[]>(() => {
    if (!data?.scheduledJobs) return []

    const groups = new Map<string, ScheduledJob[]>()

    for (const job of data.scheduledJobs) {
      const existing = groups.get(job.queueName) ?? []
      existing.push(job)
      groups.set(job.queueName, existing)
    }

    return Array.from(groups.entries())
      .map(([queueName, jobs]) => ({
        queueName,
        jobs: jobs.sort((a, b) => a.jobName.localeCompare(b.jobName)),
        hasFailures: jobs.some((j) => (j.recentFailedCount ?? 0) > 0),
        totalFailures: jobs.reduce((sum, j) => sum + (j.recentFailedCount ?? 0), 0),
      }))
      .sort((a, b) => a.queueName.localeCompare(b.queueName))
  }, [data?.scheduledJobs])

  // Initialize all queues as expanded on first load only.
  useEffect(() => {
    if (hasInitializedExpansion.current) return
    if (groupedQueues.length === 0) return
    setExpandedQueues(new Set(groupedQueues.map((g) => g.queueName)))
    hasInitializedExpansion.current = true
  }, [groupedQueues])

  const toggleQueue = (queueName: string) => {
    setExpandedQueues((prev) => {
      const next = new Set(prev)
      if (next.has(queueName)) {
        next.delete(queueName)
        trackEvent(AnalyticsEvents.SCHEDULED_JOBS_COLLAPSED, { queue_name: queueName })
      } else {
        next.add(queueName)
        trackEvent(AnalyticsEvents.SCHEDULED_JOBS_EXPANDED, { queue_name: queueName })
      }
      return next
    })
  }

  const expandAll = () => {
    trackEvent(AnalyticsEvents.SCHEDULED_JOBS_EXPANDED, { action: 'expand_all' })
    setExpandedQueues(new Set(groupedQueues.map((g) => g.queueName)))
  }

  const collapseAll = () => {
    trackEvent(AnalyticsEvents.SCHEDULED_JOBS_COLLAPSED, { action: 'collapse_all' })
    setExpandedQueues(new Set())
  }

  const allExpanded = expandedQueues.size === groupedQueues.length
  const allCollapsed = expandedQueues.size === 0

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load scheduled jobs</h2>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Scheduled Jobs"
          value={data?.total ?? 0}
          icon={Clock}
          loading={isLoading}
          variant="default"
        />
        <StatCard
          title="Queues with Schedules"
          value={groupedQueues.length}
          icon={Layers}
          loading={isLoading}
          variant="green"
        />
        <StatCard
          title="Jobs with Recent Failures"
          value={
            data?.scheduledJobs.filter(
              (j: ListScheduledJobsResponse['scheduledJobs'][number]) =>
                (j.recentFailedCount ?? 0) > 0
            ).length ?? 0
          }
          icon={AlertTriangle}
          loading={isLoading}
          variant="red"
        />
      </div>

      {/* Scheduled jobs tree view */}
      <Card>
        <CardHeader className="border-b bg-muted/30 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Scheduled Jobs by Queue
            </CardTitle>
            {groupedQueues.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={allExpanded ? collapseAll : expandAll}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronsUpDown className="h-3.5 w-3.5 mr-1.5" />
                {allExpanded ? 'Collapse All' : allCollapsed ? 'Expand All' : 'Toggle All'}
              </Button>
            )}
          </div>
        </CardHeader>

        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <div className="pl-8 space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : !groupedQueues.length ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No scheduled jobs found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Open any queue to create one from the web UI, or keep discovering schedulers your
                workers already define.
              </p>
            </div>
          ) : (
            groupedQueues.map((group, groupIndex) => (
              <QueueJobGroup
                key={group.queueName}
                group={group}
                isExpanded={expandedQueues.has(group.queueName)}
                onToggle={() => toggleQueue(group.queueName)}
                isLast={groupIndex === groupedQueues.length - 1}
                orgSlug={orgSlug}
                connectionId={connectionId}
              />
            ))
          )}
        </div>
      </Card>

      {/* Pattern reference */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Schedule Reference</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 text-sm">
          <div>
            <code className="bg-muted px-2 py-1 rounded text-xs font-mono">* * * * *</code>
            <p className="text-muted-foreground mt-1">Every minute</p>
          </div>
          <div>
            <code className="bg-muted px-2 py-1 rounded text-xs font-mono">*/5 * * * *</code>
            <p className="text-muted-foreground mt-1">Every 5 minutes</p>
          </div>
          <div>
            <code className="bg-muted px-2 py-1 rounded text-xs font-mono">0 * * * *</code>
            <p className="text-muted-foreground mt-1">Every hour</p>
          </div>
          <div>
            <code className="bg-muted px-2 py-1 rounded text-xs font-mono">0 0 * * *</code>
            <p className="text-muted-foreground mt-1">Every day at midnight</p>
          </div>
          <div>
            <code className="bg-muted px-2 py-1 rounded text-xs font-mono">0 9 * * 1-5</code>
            <p className="text-muted-foreground mt-1">Weekdays at 9 AM</p>
          </div>
          <div>
            <code className="bg-muted px-2 py-1 rounded text-xs font-mono">0 0 1 * *</code>
            <p className="text-muted-foreground mt-1">First of each month</p>
          </div>
          <div>
            <code className="bg-muted px-2 py-1 rounded text-xs font-mono">every 5 minutes</code>
            <p className="text-muted-foreground mt-1">Fixed interval scheduler</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Cron format: minute hour day-of-month month day-of-week (5-field) or second minute hour
          day-of-month month day-of-week (6-field). Interval schedules are shown as “every X”.
        </p>
      </Card>
    </div>
  )
}

interface QueueJobGroupProps {
  group: QueueGroup
  isExpanded: boolean
  onToggle: () => void
  isLast: boolean
  orgSlug: string
  connectionId: string
}

function QueueJobGroup({
  group,
  isExpanded,
  onToggle,
  isLast,
  orgSlug,
  connectionId,
}: QueueJobGroupProps) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      {/* Queue header */}
      <CollapsibleTrigger className="w-full">
        <div
          className={cn(
            'flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer group',
            isExpanded && 'bg-muted/30'
          )}
        >
          {/* Expand/collapse indicator */}
          <div className="text-muted-foreground group-hover:text-foreground transition-colors">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>

          {/* Queue name */}
          <div className="flex-1 flex items-center gap-3">
            <QueueNameTag name={group.queueName} asLink size="sm" />
            <span className="text-xs text-muted-foreground">
              {group.jobs.length} job{group.jobs.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Failure indicator */}
          {group.hasFailures && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-status-danger">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {group.totalFailures} failure{group.totalFailures !== 1 ? 's' : ''}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>Recent failed jobs in this queue</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CollapsibleTrigger>

      {/* Jobs list with tree connectors */}
      <CollapsibleContent>
        <div className={cn('bg-muted/20', !isLast && 'border-b border-border')}>
          {group.jobs.map((job, index) => (
            <JobRow
              key={`${job.queueName}-${job.schedulerId}`}
              job={job}
              isLast={index === group.jobs.length - 1}
              orgSlug={orgSlug}
              connectionId={connectionId}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

interface JobRowProps {
  job: ScheduledJob
  isLast: boolean
  orgSlug: string
  connectionId: string
}

function JobRow({ job, isLast, orgSlug, connectionId }: JobRowProps) {
  const nextRunJobId = job.nextRun ? `repeat:${job.schedulerId}:${job.nextRun}` : null

  return (
    <div className="flex items-center gap-4 pl-6 pr-4 py-2.5 hover:bg-muted/40 transition-colors group">
      {/* Tree branch connector */}
      <div className="relative flex items-center justify-center w-8 h-full">
        {/* Vertical line running through */}
        <div
          className={cn(
            'absolute left-3 w-[2px] bg-status-success/30',
            isLast ? '-top-2.5 h-[calc(50%+0.625rem)]' : '-top-2.5 -bottom-2.5'
          )}
        />
        {/* Horizontal branch line */}
        <div className="absolute left-3 w-4 h-[2px] bg-status-success/30" />
        {/* Branch node dot */}
        <div className="absolute left-[calc(0.75rem+1rem-0.25rem)] w-2 h-2 rounded-full bg-status-success ring-2 ring-background shadow-sm shadow-emerald-500/50" />
      </div>

      {/* Job name - clickable link to scheduler editor */}
      <div className="min-w-[200px] shrink-0">
        <Link
          to="/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/$schedulerId"
          params={{
            orgSlug,
            connectionId,
            queueName: job.queueName,
            schedulerId: job.schedulerId,
          }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/90 hover:text-primary hover:underline underline-offset-2 transition-colors"
        >
          {job.jobName}
          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
        </Link>
        {nextRunJobId ? (
          <Link
            to="/$orgSlug/c/$connectionId/queues/$queueName/jobs/$jobId"
            params={{
              orgSlug,
              connectionId,
              queueName: job.queueName,
              jobId: nextRunJobId,
            }}
            search={{ tab: 'data' }}
            className="mt-1 inline-flex text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Inspect next queued run
          </Link>
        ) : null}
      </div>

      {/* Schedule */}
      <div className="min-w-[140px]">
        <div className="space-y-1">
          {job.pattern ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <code className="text-xs bg-muted/80 px-2 py-1 rounded font-mono cursor-help text-muted-foreground hover:text-foreground transition-colors">
                    {job.pattern}
                  </code>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <CronPatternTooltip pattern={job.pattern} timezone={job.timezone} />
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <code className="text-xs bg-muted/80 px-2 py-1 rounded font-mono text-muted-foreground">
              {getScheduleExpression(job)}
            </code>
          )}
          <div className="text-xs text-muted-foreground">{getScheduleSummary(job)}</div>
          {job.timezone ? (
            <div className="text-xs text-muted-foreground">{job.timezone}</div>
          ) : null}
        </div>
      </div>

      {/* Next run */}
      <div className="flex-1 text-sm text-muted-foreground">
        {job.nextRun ? formatDate(job.nextRun) : '—'}
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 min-w-[120px] justify-end">
        <StatusIndicator status={job.enabled ? 'enabled' : 'disabled'} showPulse={false} />
        {(job.recentFailedCount ?? 0) > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-status-danger">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {job.recentFailedCount}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div className="space-y-1">
                  <p className="font-medium">Recent Failures</p>
                  <p className="text-sm">{job.recentFailedCount} failed job(s) in queue</p>
                  {job.lastFailedAt && (
                    <p className="text-xs text-muted-foreground">
                      Last failure: {formatDate(job.lastFailedAt)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Click the queue name to investigate
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}

// Stats Card Component
type StatVariant = 'default' | 'green' | 'red'

interface StatCardProps {
  title: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  loading?: boolean
  variant?: StatVariant
}

const variantStyles: Record<
  StatVariant,
  {
    icon: string
    accent: string
  }
> = {
  default: {
    icon: 'text-primary',
    accent: 'bg-status-neutral/40',
  },
  green: {
    icon: 'text-status-success',
    accent: 'bg-status-success',
  },
  red: {
    icon: 'text-destructive',
    accent: 'bg-status-neutral/40',
  },
}

function StatCard({ title, value, icon: Icon, loading, variant = 'default' }: StatCardProps) {
  const styles = variantStyles[variant]

  return (
    <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
      <span className={cn('absolute inset-x-0 top-0 h-0.5', styles.accent)} aria-hidden="true" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="eyebrow">{title}</CardTitle>
        <Icon className={cn('h-4 w-4', styles.icon)} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        )}
      </CardContent>
    </Card>
  )
}
