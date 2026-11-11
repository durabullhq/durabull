import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarClock,
  Plus,
  Search,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { PageTitle } from '@/components/page-title'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Metric, MetricStrip } from '@/components/ui/metric'
import { Panel, PanelHeader } from '@/components/ui/section'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  type ListScheduledJobsResponse,
  type UseQueuesOptions,
  useQueues,
  useScheduledJobs,
} from '@/hooks/use-queues'
import {
  formatScheduleTimeZone,
  getScheduleExpression,
  getScheduleSummary,
} from '@/lib/scheduled-jobs'
import { cn, formatDateWithTimezone, getTimezoneAbbreviation } from '@/lib/utils'

type ScheduledJob = ListScheduledJobsResponse['scheduledJobs'][number]
type SortKey = 'queue' | 'job' | 'nextRun'
type SortDirection = 'asc' | 'desc'
type StateFilter = 'all' | 'overdue' | 'failing'

const QUEUE_PICKER_OPTIONS: UseQueuesOptions = { pageSize: 100 }

/** Button cells centre their content; pin it to the top so values align with plain cells. */
const METRIC_BUTTON = 'flex flex-col justify-start'

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

/**
 * Local-time equivalent of a UTC cron with a fixed hour, or null when there is none to show.
 * Only for schedules explicitly stored as UTC: one with no stored timezone runs on the
 * worker host's time, which this page cannot know, so converting it would be a guess.
 */
function getLocalTimeHint(job: ScheduledJob): string | null {
  if (!job.pattern || job.timezone !== 'UTC') return null
  const localTime = getLocalTimeFromUTC(job.pattern)
  return localTime.startsWith('UTC') ? null : localTime
}

/** Re-renders on an interval so relative times stay honest without refetching. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function formatSpan(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`
}

/** A next run this far in the past was missed, not merely about to fire. */
const OVERDUE_AFTER_MS = 5 * 60_000

function isOverdue(timestamp: number | undefined, now: number): boolean {
  return typeof timestamp === 'number' && timestamp > 0 && now - timestamp > OVERDUE_AFTER_MS
}

function formatUntil(timestamp: number, now: number): string {
  if (timestamp > now) return `in ${formatSpan(timestamp - now)}`
  if (!isOverdue(timestamp, now)) return 'due now'
  // Coarse on purpose: "131d overdue" reads better than a full breakdown.
  return `${formatSpan(now - timestamp).split(' ')[0]} overdue`
}

function formatAgo(timestamp: number, now: number): string {
  return `${formatSpan(Math.max(0, now - timestamp))} ago`
}

function formatShortDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const Route = createFileRoute('/$orgSlug/c/$connectionId/scheduled-jobs')({
  component: ScheduledJobsPage,
})

function ScheduledJobsPage() {
  const { orgSlug, connectionId } = Route.useParams()
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useScheduledJobs()
  const now = useNow()
  const [search, setSearch] = useState('')
  const [queueFilter, setQueueFilter] = useState('')
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'queue',
    direction: 'asc',
  })
  const [pickerOpen, setPickerOpen] = useState(false)

  const topBarConfig = useMemo(
    () => ({
      left: <PageTitle title="Scheduled Jobs" />,
      actions: (
        <Button size="xs" onClick={() => setPickerOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          New schedule
        </Button>
      ),
      mobileActions: (
        <DropdownMenuItem onSelect={() => setPickerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New schedule
        </DropdownMenuItem>
      ),
    }),
    []
  )

  useAppTopBar(topBarConfig)

  useEffect(() => {
    trackEvent(AnalyticsEvents.SCHEDULED_JOBS_VIEWED)
  }, [])

  const jobs = useMemo(() => data?.scheduledJobs ?? [], [data?.scheduledJobs])

  const queueCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const job of jobs) {
      counts.set(job.queueName, (counts.get(job.queueName) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [jobs])

  const failingCount = useMemo(
    () => jobs.filter((job) => (job.recentFailedCount ?? 0) > 0).length,
    [jobs]
  )

  const overdueCount = useMemo(
    () => jobs.filter((job) => isOverdue(job.nextRun, now)).length,
    [jobs, now]
  )

  // The soonest run that is still ahead of us; missed runs are counted as overdue instead.
  const nextUp = useMemo(() => {
    let soonest: ScheduledJob | null = null
    for (const job of jobs) {
      if (!job.nextRun || isOverdue(job.nextRun, now)) continue
      if (!soonest?.nextRun || job.nextRun < soonest.nextRun) soonest = job
    }
    return soonest
  }, [jobs, now])

  const visibleJobs = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = jobs.filter((job) => {
      if (queueFilter && job.queueName !== queueFilter) return false
      if (stateFilter === 'failing' && (job.recentFailedCount ?? 0) === 0) return false
      if (stateFilter === 'overdue' && !isOverdue(job.nextRun, now)) return false
      if (!term) return true
      return [job.jobName, job.schedulerId, job.queueName, getScheduleExpression(job)].some(
        (value) => value.toLowerCase().includes(term)
      )
    })

    const direction = sort.direction === 'asc' ? 1 : -1
    return filtered.sort((a, b) => {
      const byQueue = a.queueName.localeCompare(b.queueName)
      const byJob = a.jobName.localeCompare(b.jobName) || a.schedulerId.localeCompare(b.schedulerId)
      if (sort.key === 'nextRun') {
        // Schedules with no upcoming run always sink to the bottom.
        if (!a.nextRun || !b.nextRun) return a.nextRun ? -1 : b.nextRun ? 1 : byQueue || byJob
        return (a.nextRun - b.nextRun) * direction || byQueue || byJob
      }
      if (sort.key === 'job') return byJob * direction || byQueue
      return byQueue * direction || byJob
    })
  }, [jobs, now, queueFilter, search, sort, stateFilter])

  const filtersActive = search.trim().length > 0 || queueFilter !== '' || stateFilter !== 'all'

  const clearFilters = () => {
    setSearch('')
    setQueueFilter('')
    setStateFilter('all')
  }

  const toggleStateFilter = (next: StateFilter) => {
    setStateFilter((current) => (current === next ? 'all' : next))
  }

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    )
  }

  const openScheduler = (job: ScheduledJob) => {
    navigate({
      to: '/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/$schedulerId',
      params: {
        orgSlug,
        connectionId,
        queueName: job.queueName,
        schedulerId: job.schedulerId,
      },
    })
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        tone="danger"
        title="Failed to load scheduled jobs"
        description={error.message}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        }
      />
    )
  }

  const sortHeader = (key: SortKey, label: string, className?: string) => {
    const isSorted = sort.key === key
    const Icon = isSorted && sort.direction === 'desc' ? ArrowDown : ArrowUp
    return (
      <TableHead
        className={className}
        aria-sort={isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={cn(
            'group inline-flex items-center gap-1 rounded-sm uppercase tracking-[0.12em] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            isSorted && 'text-foreground'
          )}
        >
          {label}
          <Icon
            className={cn('h-3 w-3', isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-50')}
            aria-hidden
          />
        </button>
      </TableHead>
    )
  }

  return (
    <div className="space-y-4">
      <MetricStrip>
        <Metric
          label="Schedules"
          value={data?.total ?? 0}
          loading={isLoading}
          className="col-span-2 sm:col-span-1"
        />
        <Metric label="Queues covered" value={queueCounts.length} loading={isLoading} />
        <Metric
          label="Next run"
          value={nextUp?.nextRun ? formatUntil(nextUp.nextRun, now) : '—'}
          hint={
            nextUp ? (
              <span className="font-mono">
                {nextUp.jobName} · {nextUp.queueName}
              </span>
            ) : undefined
          }
          loading={isLoading}
          title={nextUp?.nextRun ? formatDateWithTimezone(nextUp.nextRun) : undefined}
        />
        <Metric
          label="Overdue"
          value={overdueCount}
          tone={overdueCount > 0 ? 'warning' : 'neutral'}
          emphasis={overdueCount > 0}
          hint="next run was missed"
          loading={isLoading}
          onClick={() => toggleStateFilter('overdue')}
          active={stateFilter === 'overdue'}
          title="Show only schedules whose next run is in the past"
          className={METRIC_BUTTON}
        />
        <Metric
          label="Failing"
          value={failingCount}
          tone={failingCount > 0 ? 'danger' : 'neutral'}
          emphasis={failingCount > 0}
          hint="recent failed runs"
          loading={isLoading}
          onClick={() => toggleStateFilter('failing')}
          active={stateFilter === 'failing'}
          title="Show only schedules with recent failed runs"
          className={cn(METRIC_BUTTON, 'sm:max-lg:col-span-2')}
        />
      </MetricStrip>

      {isLoading ? (
        <Panel>
          <PanelHeader>
            <Skeleton className="h-8 w-64" />
          </PanelHeader>
          <div className="divide-y">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center gap-6 px-4 py-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="ml-auto h-4 w-20" />
              </div>
            ))}
          </div>
        </Panel>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No scheduled jobs"
          description={
            <>
              A schedule adds a job to a queue on a cron pattern or a fixed interval. Create one
              here, or define it in code with{' '}
              <code className="font-mono">queue.upsertJobScheduler()</code> and it shows up
              automatically.
            </>
          }
          actions={
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4" />
              New schedule
            </Button>
          }
        />
      ) : (
        <Panel>
          <PanelHeader>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search job, scheduler ID, or cron"
                  aria-label="Search scheduled jobs"
                  className="pl-8"
                />
              </div>
              <div className="w-full sm:w-56">
                <Select
                  value={queueFilter}
                  onChange={(event) => setQueueFilter(event.target.value)}
                  aria-label="Filter by queue"
                  className={cn('font-mono text-xs', !queueFilter && 'text-muted-foreground')}
                >
                  <option value="">All queues</option>
                  {queueCounts.map(([queueName, count]) => (
                    <option key={queueName} value={queueName}>
                      {queueName} ({count})
                    </option>
                  ))}
                </Select>
              </div>
              {filtersActive ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear
                </Button>
              ) : null}
            </div>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {filtersActive
                ? `${visibleJobs.length} of ${jobs.length}`
                : `${jobs.length} ${jobs.length === 1 ? 'schedule' : 'schedules'}`}
            </span>
          </PanelHeader>

          {visibleJobs.length === 0 ? (
            <EmptyState
              size="inline"
              icon={Search}
              title="No schedules match"
              description="Nothing matches the current search and filters."
              actions={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <TooltipProvider delayDuration={200}>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {sortHeader('job', 'Job')}
                    {sortHeader('queue', 'Queue')}
                    <TableHead>Schedule</TableHead>
                    {sortHeader('nextRun', 'Next run')}
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="w-0">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleJobs.map((job) => {
                    const failed = job.recentFailedCount ?? 0
                    const localTime = getLocalTimeHint(job)
                    const nextRunJobId = job.nextRun
                      ? `repeat:${job.schedulerId}:${job.nextRun}`
                      : null

                    return (
                      <TableRow
                        key={`${job.queueName}-${job.schedulerId}`}
                        className="cursor-pointer"
                        onClick={() => openScheduler(job)}
                      >
                        <TableCell className="max-w-[280px]">
                          <div className="flex items-center gap-2">
                            <Link
                              to="/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/$schedulerId"
                              params={{
                                orgSlug,
                                connectionId,
                                queueName: job.queueName,
                                schedulerId: job.schedulerId,
                              }}
                              onClick={(event) => event.stopPropagation()}
                              className="truncate rounded-sm font-mono font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                            >
                              {job.jobName}
                            </Link>
                            {job.enabled ? null : <Badge variant="neutral">Disabled</Badge>}
                          </div>
                          <div
                            className="truncate font-mono text-xs text-faint"
                            title={`Scheduler ID: ${job.schedulerId}`}
                          >
                            {job.schedulerId}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Link
                            to="/$orgSlug/c/$connectionId/queues/$queueName"
                            params={{ orgSlug, connectionId, queueName: job.queueName }}
                            search={{}}
                            onClick={(event) => event.stopPropagation()}
                            className="whitespace-nowrap rounded-sm font-mono text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          >
                            {job.queueName}
                          </Link>
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          <div>{getScheduleSummary(job)}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {getScheduleExpression(job)}
                            {job.pattern ? (
                              <span className="text-faint">
                                {' · '}
                                {formatScheduleTimeZone(job.timezone)}
                                {localTime ? ` · ${localTime} local` : ''}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          {job.nextRun ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="w-fit">
                                  <div
                                    className={cn(
                                      'font-mono tabular-nums',
                                      isOverdue(job.nextRun, now) && 'text-status-warning'
                                    )}
                                  >
                                    {formatUntil(job.nextRun, now)}
                                  </div>
                                  <div className="font-mono text-xs tabular-nums text-muted-foreground">
                                    {formatShortDateTime(job.nextRun)}
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="font-mono">
                                {formatDateWithTimezone(job.nextRun)}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {typeof job.iterationCount === 'number' ? (
                            job.iterationCount.toLocaleString()
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right font-mono tabular-nums">
                          {failed > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-status-danger">{failed}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {failed} recent failed {failed === 1 ? 'run' : 'runs'}
                                {job.lastFailedAt
                                  ? ` · last ${formatAgo(job.lastFailedAt, now)}`
                                  : ''}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </TableCell>

                        <TableCell className="py-0 pl-0">
                          <div className="flex items-center justify-end">
                            {nextRunJobId ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                    <Link
                                      to="/$orgSlug/c/$connectionId/queues/$queueName/jobs/$jobId"
                                      params={{
                                        orgSlug,
                                        connectionId,
                                        queueName: job.queueName,
                                        jobId: nextRunJobId,
                                      }}
                                      search={{ tab: 'data' }}
                                      onClick={(event) => event.stopPropagation()}
                                      aria-label={`Inspect next queued run of ${job.jobName}`}
                                    >
                                      <ArrowUpRight className="h-4 w-4" />
                                    </Link>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left">Inspect next queued run</TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </Panel>
      )}

      {pickerOpen ? (
        <NewScheduleDialog
          orgSlug={orgSlug}
          connectionId={connectionId}
          scheduleCounts={queueCounts}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  )
}

/**
 * A schedule belongs to a queue, so creating one from the connection-wide list
 * starts by choosing the queue; the form itself lives on the queue's route.
 */
function NewScheduleDialog({
  orgSlug,
  connectionId,
  scheduleCounts,
  onClose,
}: {
  orgSlug: string
  connectionId: string
  scheduleCounts: Array<[string, number]>
  onClose: () => void
}) {
  const { data, isLoading } = useQueues(QUEUE_PICKER_OPTIONS)
  const [term, setTerm] = useState('')

  const counts = useMemo(() => new Map(scheduleCounts), [scheduleCounts])
  const queueNames = useMemo(() => {
    const names = new Set<string>(scheduleCounts.map(([queueName]) => queueName))
    for (const queue of data?.queues ?? []) names.add(queue.name)
    const needle = term.trim().toLowerCase()
    return Array.from(names)
      .filter((queueName) => !needle || queueName.toLowerCase().includes(needle))
      .sort((a, b) => a.localeCompare(b))
  }, [data?.queues, scheduleCounts, term])

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle>New schedule</DialogTitle>
          <DialogDescription>Choose the queue this schedule adds jobs to.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Find a queue"
            aria-label="Find a queue"
            className="pl-8"
          />
        </div>
        <div className="-mx-1 max-h-72 overflow-y-auto">
          {queueNames.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              {isLoading ? 'Loading queues…' : 'No queue matches.'}
            </p>
          ) : (
            <ul>
              {queueNames.map((queueName) => {
                const count = counts.get(queueName) ?? 0
                return (
                  <li key={queueName}>
                    <Link
                      to="/$orgSlug/c/$connectionId/queues/$queueName/scheduled-jobs/new"
                      params={{ orgSlug, connectionId, queueName }}
                      className="flex h-8 items-center justify-between gap-3 rounded-md px-3 text-[13px] transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      <span className="truncate font-mono">{queueName}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                        {count > 0 ? `${count} ${count === 1 ? 'schedule' : 'schedules'}` : ''}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
