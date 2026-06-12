import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Rocket,
} from 'lucide-react'
import {
  type KeyboardEvent,
  type MouseEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useConnection } from '@/components/connection-provider'
import { QueueNameTag } from '@/components/queue-name-tag'
import { StatusIndicator } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePauseQueue, useResumeQueue } from '@/hooks/use-queues'
import { QUEUE_STATUS } from '@/lib/constants'
import { cn, formatNumber } from '@/lib/utils'

// Queue summary type - matches API response
interface QueueSummary {
  name: string
  status: 'active' | 'paused'
  discoveryState?: 'pending' | 'confirmed'
  jobCounts: {
    waiting: number
    active: number
    delayed: number
    completed: number
    failed: number
    paused: number
    prioritized: number
  }
  isPaused: boolean
}

interface QueueTableProps {
  queues: QueueSummary[]
  className?: string
  page?: number
  totalPages?: number
  total?: number
  isPlaceholderData?: boolean
  onPageChange?: (page: number) => void
}

/**
 * Calculate total jobs across all states for a queue
 */
function getTotalJobs(queue: QueueSummary): number {
  const { jobCounts } = queue
  return (
    jobCounts.waiting +
    jobCounts.prioritized +
    jobCounts.active +
    jobCounts.delayed +
    jobCounts.completed +
    jobCounts.failed
  )
}

export function QueueTable({
  queues,
  className,
  page = 1,
  totalPages = 1,
  total = 0,
  isPlaceholderData,
  onPageChange,
}: QueueTableProps) {
  const [hideEmpty, setHideEmpty] = useState(false)
  const hasPagination = totalPages > 1

  useEffect(() => {
    setHideEmpty(false)
  }, [page])

  // Memoize filtered queues to avoid recalculating on unrelated re-renders
  const { filteredQueues, emptyCount } = useMemo(() => {
    const empty = queues.filter((q) => getTotalJobs(q) === 0).length
    const filtered = hideEmpty ? queues.filter((q) => getTotalJobs(q) > 0) : queues
    return { filteredQueues: filtered, emptyCount: empty }
  }, [queues, hideEmpty])

  const toggleHideEmpty = useCallback(() => {
    setHideEmpty((prev) => {
      const newValue = !prev
      trackEvent(AnalyticsEvents.QUEUE_EMPTY_TOGGLE, {
        action: newValue ? 'hide' : 'show',
      })
      return newValue
    })
  }, [])

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          'rounded-lg border bg-card overflow-hidden flex flex-col h-[calc(100vh-18rem)]',
          className
        )}
      >
        <div className="flex-1 overflow-auto min-h-0 [&>div]:overflow-visible">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead>Queue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Waiting</TableHead>
                <TableHead className="text-right">Prioritized</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Delayed</TableHead>
                <TableHead className="text-right">Completed</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQueues.map((queue) => (
                <QueueTableRow key={queue.name} queue={queue} />
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Footer: empty toggle + pagination */}
        {(emptyCount > 0 || hasPagination) && (
          <div className="border-t px-4 py-3 flex items-center justify-between">
            <div>
              {emptyCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleHideEmpty}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {hideEmpty ? (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      Show empty
                    </>
                  ) : (
                    <>
                      <EyeOff className="mr-2 h-4 w-4" />
                      Hide empty
                    </>
                  )}
                </Button>
              )}
            </div>

            {hasPagination && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                  <span className="hidden sm:inline"> ({total} queues)</span>
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page <= 1 || isPlaceholderData}
                    onClick={() => onPageChange?.(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="sr-only">Previous page</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= totalPages || isPlaceholderData}
                    onClick={() => onPageChange?.(page + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                    <span className="sr-only">Next page</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

interface QueueTableRowProps {
  queue: QueueSummary
}

function shouldSkipRowNavigation(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.closest(
      'a,button,input,select,textarea,[role="menuitem"],[role="checkbox"],[data-row-nav-ignore="true"]'
    )
  )
}

/**
 * Memoized table row for a single queue
 * Prevents unnecessary re-renders when other queues change
 */
const QueueTableRow = memo(function QueueTableRow({ queue }: QueueTableRowProps) {
  const { currentConnection } = useConnection()
  const connectionId = currentConnection?.id ?? ''
  const navigate = useNavigate()
  // Get orgSlug from route params for org-scoped navigation
  const params = useParams({ strict: false })
  const orgSlug = (params as { orgSlug?: string }).orgSlug ?? ''
  const pauseMutation = usePauseQueue()
  const resumeMutation = useResumeQueue()
  const isToggling = pauseMutation.isPending || resumeMutation.isPending

  const handleTogglePause = useCallback(() => {
    if (queue.isPaused) {
      resumeMutation.mutate(queue.name)
    } else {
      pauseMutation.mutate(queue.name)
    }
  }, [queue.isPaused, queue.name, pauseMutation, resumeMutation])

  const navigateToQueue = useCallback(() => {
    void navigate({
      to: '/$orgSlug/c/$connectionId/queues/$queueName',
      params: { orgSlug, connectionId, queueName: queue.name },
      search: {},
    })
  }, [connectionId, navigate, orgSlug, queue.name])

  const handleRowClick = useCallback(
    (event: MouseEvent<HTMLTableRowElement>) => {
      if (shouldSkipRowNavigation(event.target)) {
        return
      }

      navigateToQueue()
    },
    [navigateToQueue]
  )

  const handleRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key !== 'Enter' || shouldSkipRowNavigation(event.target)) {
        return
      }

      event.preventDefault()
      navigateToQueue()
    },
    [navigateToQueue]
  )

  const status = queue.isPaused ? QUEUE_STATUS.PAUSED : QUEUE_STATUS.ACTIVE
  const isPendingDiscovery = queue.discoveryState === 'pending'

  return (
    <TableRow
      className={cn(
        'group cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none',
        isPendingDiscovery && 'opacity-60'
      )}
      aria-label={`Open queue ${queue.name}`}
      data-testid={`queue-row-${queue.name}`}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      role="link"
      tabIndex={0}
    >
      {/* Queue Name */}
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <QueueNameTag name={queue.name} asLink size="sm" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="font-mono">
            {queue.name}
          </TooltipContent>
        </Tooltip>
      </TableCell>

      {/* Status */}
      <TableCell>
        <div className="flex items-center gap-2">
          <StatusIndicator status={status} />
          {isPendingDiscovery && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Discovering
            </span>
          )}
        </div>
      </TableCell>

      {/* Waiting */}
      <TableCell className="text-right font-mono text-[13px] tabular-nums text-muted-foreground">
        {formatNumber(queue.jobCounts.waiting)}
      </TableCell>

      {/* Prioritized */}
      <TableCell className="text-right">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 font-mono text-[13px] tabular-nums',
            queue.jobCounts.prioritized > 0
              ? 'text-status-priority font-medium'
              : 'text-muted-foreground'
          )}
        >
          {queue.jobCounts.prioritized > 0 && <Rocket className="h-3.5 w-3.5" />}
          {formatNumber(queue.jobCounts.prioritized)}
        </span>
      </TableCell>

      {/* Active */}
      <TableCell className="text-right">
        <span
          className={cn(
            'font-mono text-[13px] tabular-nums',
            queue.jobCounts.active > 0 ? 'text-status-active font-medium' : 'text-muted-foreground'
          )}
        >
          {formatNumber(queue.jobCounts.active)}
        </span>
      </TableCell>

      {/* Delayed */}
      <TableCell className="text-right">
        <span
          className={cn(
            'font-mono text-[13px] tabular-nums',
            queue.jobCounts.delayed > 0 ? 'text-status-delayed' : 'text-muted-foreground'
          )}
        >
          {formatNumber(queue.jobCounts.delayed)}
        </span>
      </TableCell>

      {/* Completed */}
      <TableCell className="text-right">
        <span
          className={cn(
            'font-mono text-[13px] tabular-nums',
            queue.jobCounts.completed > 0 ? 'text-status-success' : 'text-muted-foreground'
          )}
        >
          {formatNumber(queue.jobCounts.completed)}
        </span>
      </TableCell>

      {/* Failed */}
      <TableCell className="text-right">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 font-mono text-[13px] tabular-nums',
            queue.jobCounts.failed > 0 ? 'text-status-danger font-medium' : 'text-muted-foreground'
          )}
        >
          {queue.jobCounts.failed > 0 && <AlertCircle className="h-3.5 w-3.5" />}
          {formatNumber(queue.jobCounts.failed)}
        </span>
      </TableCell>

      {/* Actions */}
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Queue actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link
                to="/$orgSlug/c/$connectionId/queues/$queueName"
                params={{ orgSlug, connectionId, queueName: queue.name }}
                search={{}}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleTogglePause}
              disabled={isToggling}
              className={queue.isPaused ? 'text-status-success' : 'text-status-warning'}
            >
              {queue.isPaused ? (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Resume Queue
                </>
              ) : (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  Pause Queue
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
})

// Compact metrics bar for mobile/summary views
export function QueueMetricsBar({ queue }: { queue: QueueSummary }) {
  const total =
    queue.jobCounts.waiting +
    queue.jobCounts.active +
    queue.jobCounts.delayed +
    queue.jobCounts.completed +
    queue.jobCounts.failed

  if (total === 0) return null

  const getWidth = (count: number) => `${(count / total) * 100}%`

  return (
    <TooltipProvider>
      <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-muted">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="bg-status-success transition-all duration-500"
              style={{ width: getWidth(queue.jobCounts.completed) }}
            />
          </TooltipTrigger>
          <TooltipContent>{formatNumber(queue.jobCounts.completed)} completed</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="bg-status-active transition-all duration-500"
              style={{ width: getWidth(queue.jobCounts.active) }}
            />
          </TooltipTrigger>
          <TooltipContent>{formatNumber(queue.jobCounts.active)} active</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="bg-status-neutral transition-all duration-500"
              style={{ width: getWidth(queue.jobCounts.waiting) }}
            />
          </TooltipTrigger>
          <TooltipContent>{formatNumber(queue.jobCounts.waiting)} waiting</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="bg-status-delayed transition-all duration-500"
              style={{ width: getWidth(queue.jobCounts.delayed) }}
            />
          </TooltipTrigger>
          <TooltipContent>{formatNumber(queue.jobCounts.delayed)} delayed</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="bg-status-danger transition-all duration-500"
              style={{ width: getWidth(queue.jobCounts.failed) }}
            />
          </TooltipTrigger>
          <TooltipContent>{formatNumber(queue.jobCounts.failed)} failed</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
