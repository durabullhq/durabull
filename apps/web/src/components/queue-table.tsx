import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Search,
  SearchX,
  X,
} from 'lucide-react'
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useConnection } from '@/components/connection-provider'
import { StatusIndicator } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Panel, PanelHeader } from '@/components/ui/section'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  type QueueSortField,
  type QueueSortOrder,
  type QueueStatusFilter,
  usePauseQueue,
  useResumeQueue,
} from '@/hooks/use-queues'
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
  sortBy?: QueueSortField
  sortOrder?: QueueSortOrder
  onSortChange?: (sortBy: QueueSortField, sortOrder: QueueSortOrder) => void
  search?: string
  onSearchChange?: (search: string) => void
  statusFilter?: QueueStatusFilter | ''
  onStatusFilterChange?: (status: QueueStatusFilter | '') => void
  /** When provided, renders a "Save as default" action for the current view */
  onSaveDefaultView?: () => void
}

const SEARCH_DEBOUNCE_MS = 300

const STATUS_FILTER_OPTIONS: Array<{ value: QueueStatusFilter | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
]

/** Sticky header cells need an opaque fill that still reads as the standard muted table header. */
/** Columns that only earn their width on wide screens, so Failed never scrolls out of view. */
const NARROW_HIDDEN_CLASS = 'hidden xl:table-cell'

const STICKY_HEAD_CLASS =
  'sticky top-0 z-10 [background:color-mix(in_srgb,var(--color-muted)_40%,var(--color-card))] shadow-[inset_0_-1px_0_0_var(--color-border)]'

interface SortableColumn {
  field: QueueSortField
  label: string
  align?: 'right'
  /** Numeric columns sort descending on first click (largest values first) */
  defaultOrder: QueueSortOrder
}

const SORTABLE_COLUMNS: SortableColumn[] = [
  { field: 'name', label: 'Queue', defaultOrder: 'asc' },
  { field: 'status', label: 'Status', defaultOrder: 'asc' },
  { field: 'waiting', label: 'Waiting', align: 'right', defaultOrder: 'desc' },
  { field: 'prioritized', label: 'Prioritized', align: 'right', defaultOrder: 'desc' },
  { field: 'active', label: 'Active', align: 'right', defaultOrder: 'desc' },
  { field: 'delayed', label: 'Delayed', align: 'right', defaultOrder: 'desc' },
  { field: 'completed', label: 'Completed', align: 'right', defaultOrder: 'desc' },
  { field: 'failed', label: 'Failed', align: 'right', defaultOrder: 'desc' },
]

interface SortableHeadProps {
  column: SortableColumn
  sortBy: QueueSortField
  sortOrder: QueueSortOrder
  onSortChange?: (sortBy: QueueSortField, sortOrder: QueueSortOrder) => void
}

function SortableHead({ column, sortBy, sortOrder, onSortChange }: SortableHeadProps) {
  const isActive = sortBy === column.field
  const ariaSort = isActive ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'

  const handleClick = () => {
    const nextOrder: QueueSortOrder = isActive
      ? sortOrder === 'asc'
        ? 'desc'
        : 'asc'
      : column.defaultOrder
    trackEvent(AnalyticsEvents.QUEUE_LIST_SORTED, {
      sort_by: column.field,
      sort_order: nextOrder,
    })
    onSortChange?.(column.field, nextOrder)
  }

  return (
    <TableHead
      aria-sort={ariaSort}
      className={cn(
        STICKY_HEAD_CLASS,
        'px-3 xl:px-4',
        column.align === 'right' && 'text-right',
        // The name column takes the slack; every other column hugs its content.
        column.field === 'name' && 'w-full min-w-48',
        column.field === 'prioritized' && NARROW_HIDDEN_CLASS
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'group/sort -mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 uppercase tracking-[0.12em] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          column.align === 'right' && 'flex-row-reverse',
          isActive ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {column.label}
        {isActive ? (
          sortOrder === 'asc' ? (
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
          )
        ) : (
          <ChevronsUpDown
            className="h-3 w-3 opacity-0 transition-opacity group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60"
            aria-hidden="true"
          />
        )}
      </button>
    </TableHead>
  )
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
  sortBy = 'name',
  sortOrder = 'asc',
  onSortChange,
  search = '',
  onSearchChange,
  statusFilter = '',
  onStatusFilterChange,
  onSaveDefaultView,
}: QueueTableProps) {
  const [hideEmpty, setHideEmpty] = useState(false)
  const [searchInput, setSearchInput] = useState(search)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hasPagination = totalPages > 1
  const hasServerFilters = search !== '' || statusFilter !== ''

  useEffect(() => {
    setHideEmpty(false)
  }, [page])

  // Keep the input in sync when search is changed externally (e.g. URL navigation)
  useEffect(() => {
    setSearchInput(search)
  }, [search])

  useEffect(() => {
    return () => clearTimeout(searchDebounceRef.current)
  }, [])

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

  const handleSearchInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setSearchInput(value)
      clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = setTimeout(() => {
        trackEvent(AnalyticsEvents.QUEUE_LIST_FILTERED, { filter: 'search' })
        onSearchChange?.(value)
      }, SEARCH_DEBOUNCE_MS)
    },
    [onSearchChange]
  )

  const handleClearSearch = useCallback(() => {
    clearTimeout(searchDebounceRef.current)
    setSearchInput('')
    onSearchChange?.('')
  }, [onSearchChange])

  const handleStatusFilterChange = useCallback(
    (value: QueueStatusFilter | '') => {
      trackEvent(AnalyticsEvents.QUEUE_LIST_FILTERED, {
        filter: 'status',
        status: value || 'all',
      })
      onStatusFilterChange?.(value)
    },
    [onStatusFilterChange]
  )

  const handleClearFilters = useCallback(() => {
    handleClearSearch()
    onStatusFilterChange?.('')
  }, [handleClearSearch, onStatusFilterChange])

  return (
    <TooltipProvider delayDuration={200}>
      <Panel className={cn('flex min-h-0 flex-col', className)}>
        {/* Toolbar: search + status filter on the left, view controls on the right */}
        <PanelHeader className="shrink-0 gap-x-3 px-3">
          <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-2 sm:basis-0">
            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchInput}
                onChange={handleSearchInput}
                placeholder="Filter queues…"
                aria-label="Filter queues by name"
                className="pl-8 pr-8 font-mono [&::-webkit-search-cancel-button]:hidden"
              />
              {searchInput !== '' && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
            <Tabs
              value={statusFilter || 'all'}
              onValueChange={(value) => {
                const next = value === 'all' ? '' : (value as QueueStatusFilter)
                if (next !== statusFilter) handleStatusFilterChange(next)
              }}
            >
              <TabsList role="group" aria-label="Filter queues by status">
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <TabsTrigger
                    key={option.label}
                    value={option.value || 'all'}
                    aria-pressed={statusFilter === option.value}
                  >
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {hasServerFilters && (
              <Button variant="ghost" size="xs" onClick={handleClearFilters}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Clear filters
              </Button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {emptyCount > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={toggleHideEmpty}
                aria-pressed={hideEmpty}
                className={cn(hideEmpty && 'bg-accent text-accent-foreground')}
              >
                {hideEmpty ? (
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {hideEmpty ? 'Show empty' : 'Hide empty'}
                <span className="font-mono tabular-nums text-faint">{emptyCount}</span>
              </Button>
            )}
            {onSaveDefaultView && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="xs" onClick={onSaveDefaultView}>
                    <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                    Save as default
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Use the current sorting and filters as your default view
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </PanelHeader>

        <div className="min-h-0 flex-1 overflow-auto [&>div]:overflow-visible">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="border-b-0 bg-transparent">
              <TableRow className="hover:bg-transparent">
                {SORTABLE_COLUMNS.map((column) => (
                  <SortableHead
                    key={column.field}
                    column={column}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortChange={onSortChange}
                  />
                ))}
                <TableHead className={cn(STICKY_HEAD_CLASS, NARROW_HIDDEN_CLASS, 'w-12')}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y-0 [&>tr:not(:last-child)>td]:border-b">
              {filteredQueues.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="p-0">
                    {hasServerFilters ? (
                      <EmptyState
                        size="inline"
                        icon={SearchX}
                        title="No queues match the current filters."
                        actions={
                          <Button variant="outline" size="sm" onClick={handleClearFilters}>
                            Clear filters
                          </Button>
                        }
                      />
                    ) : (
                      <EmptyState
                        size="inline"
                        title="No queues to display."
                        description={hideEmpty ? 'Every queue on this page is empty.' : undefined}
                        actions={
                          hideEmpty ? (
                            <Button variant="outline" size="sm" onClick={toggleHideEmpty}>
                              Show empty
                            </Button>
                          ) : undefined
                        }
                      />
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredQueues.map((queue) => <QueueTableRow key={queue.name} queue={queue} />)
              )}
            </TableBody>
          </Table>
        </div>

        {hasPagination && (
          <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-t px-3">
            <span className="text-xs text-muted-foreground">
              Page <span className="font-mono tabular-nums text-foreground">{page}</span> of{' '}
              <span className="font-mono tabular-nums text-foreground">{totalPages}</span>
              <span className="hidden sm:inline">
                {' · '}
                <span className="font-mono tabular-nums">{formatNumber(total)}</span> queues
              </span>
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page <= 1 || isPlaceholderData}
                onClick={() => onPageChange?.(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Previous page</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page >= totalPages || isPlaceholderData}
                onClick={() => onPageChange?.(page + 1)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Next page</span>
              </Button>
            </div>
          </div>
        )}
      </Panel>
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
        'group cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none',
        isPendingDiscovery && 'opacity-60'
      )}
      aria-label={`Open queue ${queue.name}`}
      data-testid={`queue-row-${queue.name}`}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      role="link"
      tabIndex={0}
    >
      {/* Queue name: the real link, so it can be opened in a new tab */}
      <TableCell className="h-10 w-full max-w-0 px-3 py-0 xl:px-4">
        <Link
          to="/$orgSlug/c/$connectionId/queues/$queueName"
          params={{ orgSlug, connectionId, queueName: queue.name }}
          search={{}}
          title={queue.name}
          tabIndex={-1}
          className="block truncate font-mono text-[13px] font-medium text-foreground underline-offset-4 group-hover:underline"
        >
          {queue.name}
        </Link>
      </TableCell>

      {/* Status */}
      <TableCell className="h-10 px-3 py-0 xl:px-4">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <StatusIndicator status={status} showPulse={false} />
          {isPendingDiscovery && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Discovering
            </span>
          )}
        </div>
      </TableCell>

      <CountCell value={queue.jobCounts.waiting} />
      <CountCell value={queue.jobCounts.prioritized} className={NARROW_HIDDEN_CLASS} />
      <CountCell value={queue.jobCounts.active} />
      <CountCell value={queue.jobCounts.delayed} />
      <CountCell value={queue.jobCounts.completed} />
      <CountCell value={queue.jobCounts.failed} danger />

      {/* Actions */}
      <TableCell className={cn(NARROW_HIDDEN_CLASS, 'h-10 py-0 pl-0 pr-2 text-right')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 border-0 text-faint group-hover:text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Queue actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem asChild>
              <Link
                to="/$orgSlug/c/$connectionId/queues/$queueName"
                params={{ orgSlug, connectionId, queueName: queue.name }}
                search={{}}
              >
                <ExternalLink />
                View details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleTogglePause} disabled={isToggling}>
              {queue.isPaused ? (
                <>
                  <Play />
                  Resume queue
                </>
              ) : (
                <>
                  <Pause />
                  Pause queue
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
})

/** A job count: zero recedes to the faint token so non-zero values are what the eye lands on. */
function CountCell({
  value,
  danger = false,
  className,
}: {
  value: number
  danger?: boolean
  className?: string
}) {
  return (
    <TableCell
      className={cn(
        'h-10 px-3 py-0 text-right font-mono text-[13px] tabular-nums xl:px-4',
        value === 0 ? 'text-faint' : danger ? 'font-medium text-status-danger' : 'text-foreground',
        className
      )}
    >
      {formatNumber(value)}
    </TableCell>
  )
}

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
