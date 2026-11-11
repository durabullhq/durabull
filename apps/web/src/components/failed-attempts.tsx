import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
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
import { Label } from '@/components/ui/label'
import { Panel, PanelHeader } from '@/components/ui/section'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useClearJobStacktraces, useJobStacktraces } from '@/hooks/use-queues'
import { cn, formatDateWithTimezone } from '@/lib/utils'

// Stacktrace item type - matches API response
interface StacktraceItem {
  attemptNumber: number
  stacktrace: string
  isLatest: boolean
}

type DisplayAttempt = StacktraceItem & { timestamp?: number; isEstimated: boolean }

interface BackoffConfig {
  type?: 'fixed' | 'exponential'
  delay?: number
}

interface FailedAttemptsProps {
  queueName: string
  jobId: string
  attemptsMade: number
  maxAttempts: number
  stacktraceCount: number
  failedReason?: string
  processedOn?: number
  finishedOn?: number
  backoff?: BackoffConfig
  status?: string
  className?: string
}

/**
 * Why a job failed. The latest failure leads — error type, message, stack —
 * and earlier attempts fold underneath. Danger colour is spent once, on the
 * latest failure of a job that is currently failed.
 */
export function FailedAttempts({
  queueName,
  jobId,
  attemptsMade,
  stacktraceCount,
  failedReason,
  finishedOn,
  backoff,
  status,
  className,
}: FailedAttemptsProps) {
  const clearStacktracesMutation = useClearJobStacktraces()
  const [expandedAttempt, setExpandedAttempt] = useState<number | null>(null)
  const [customKeepInput, setCustomKeepInput] = useState('25')
  const parentRef = useRef<HTMLDivElement>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useJobStacktraces(queueName, jobId, stacktraceCount > 0)

  // Flatten all pages into a single array
  const allItems = data?.pages.flatMap((page) => page.items) ?? []
  const totalItems = data?.pages[0]?.total ?? stacktraceCount

  const isFailed = status === 'failed'
  // `finishedOn` is the failure time only while the job is failed; once it has moved on
  // (retrying, completed) there is no honest timestamp to show for past attempts.
  const failedAt = isFailed ? finishedOn : undefined

  // If we have a failedReason but no stacktraces from API, create a synthetic one
  const hasApiItems = allItems.length > 0
  const displayItems: DisplayAttempt[] = hasApiItems
    ? allItems.map((item, index) => ({
        ...item,
        timestamp: calculateTimestamp(index, allItems.length, failedAt, backoff),
        isEstimated: index > 0,
      }))
    : failedReason
      ? [
          {
            attemptNumber: attemptsMade,
            stacktrace: failedReason,
            isLatest: true,
            timestamp: failedAt,
            isEstimated: false,
          },
        ]
      : []

  // A job that went on to complete shows its failures as history, not as a headline.
  const showLatest = status !== 'completed' && displayItems.length > 0
  const latest = showLatest ? displayItems[0] : undefined
  const listItems = showLatest ? displayItems.slice(1) : displayItems

  // Virtualizer for efficient rendering
  const virtualizer = useVirtualizer({
    count: listItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (expandedAttempt === index ? 220 : 37),
    overscan: 5,
  })

  // Infinite scroll - load more when near bottom
  const loadMoreRef = useRef<HTMLDivElement>(null)

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

  // Re-measure when expanded state changes
  useEffect(() => {
    virtualizer.measure()
  }, [virtualizer])

  if (displayItems.length === 0) {
    if (isLoading) {
      return (
        <Panel className={className}>
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading failed attempts...
          </div>
        </Panel>
      )
    }

    if (isError) {
      return (
        <Panel className={className}>
          <EmptyState
            size="inline"
            tone="danger"
            icon={AlertTriangle}
            title="Failed to load stacktraces"
            description="The stack traces for this job could not be read from Redis."
          />
        </Panel>
      )
    }

    return (
      <Panel className={className}>
        <EmptyState
          size="inline"
          icon={RefreshCw}
          title="No failed attempts recorded"
          description="This job has not experienced any failures yet."
        />
      </Panel>
    )
  }

  // Attempt counts live in the page's metrics; the header only adds what they lack.
  const summary =
    !isFailed || totalItems > 1
      ? `${totalItems.toLocaleString()} ${totalItems === 1 ? 'stack trace' : 'stack traces'} recorded`
      : null

  const clearStacktraces = (keep: number) =>
    clearStacktracesMutation.mutate(
      { queueName, jobId, keepMostRecent: keep },
      {
        onSuccess: ({ removed }) =>
          toast.success(keep > 0 ? 'Stacktraces trimmed' : 'Stacktraces cleared', {
            description:
              keep > 0
                ? `Deleted ${removed.toLocaleString()} stacktrace${removed === 1 ? '' : 's'} and kept ${keep.toLocaleString()}.`
                : `Deleted ${removed.toLocaleString()} stacktrace${removed === 1 ? '' : 's'}.`,
          }),
        onError: (error) =>
          toast.error('Failed to clear stacktraces', {
            description: error.message,
          }),
      }
    )

  return (
    <Panel className={className}>
      <PanelHeader>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <h2 className="text-sm font-semibold tracking-tight">
            {isFailed ? 'Failure' : 'Failed attempts'}
          </h2>
          {summary ? (
            <span className="font-mono text-xs text-muted-foreground">{summary}</span>
          ) : null}
        </div>
        {totalItems > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="xs" disabled={clearStacktracesMutation.isPending}>
                Clear Stacktraces
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => clearStacktraces(0)}>
                Delete all stacktraces
              </DropdownMenuItem>
              {[10, 50, 100].map((keep) => (
                <DropdownMenuItem key={keep} onClick={() => clearStacktraces(keep)}>
                  Keep latest {keep.toLocaleString()}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <div className="px-2 pb-1 pt-1">
                <Label htmlFor="custom-stacktrace-keep" className="text-xs text-muted-foreground">
                  Keep most recent X stacktraces
                </Label>
                <Input
                  id="custom-stacktrace-keep"
                  value={customKeepInput}
                  onChange={(event) => setCustomKeepInput(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  inputMode="numeric"
                  className="mt-1 h-7 font-mono text-xs"
                />
              </div>
              <DropdownMenuItem
                onClick={() => {
                  const parsed = Number.parseInt(customKeepInput, 10)
                  clearStacktraces(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0)
                }}
              >
                Apply custom keep value
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PanelHeader>

      {latest ? (
        <LatestFailure
          attempt={latest}
          emphasis={isFailed}
          isLoadingStack={isLoading && stacktraceCount > 0}
          stackUnavailable={isError}
        />
      ) : null}

      {listItems.length > 0 || hasNextPage ? (
        <>
          {latest ? (
            <div className="flex items-center justify-between border-t bg-muted/50 px-4 py-1.5">
              <span className="eyebrow">Earlier attempts</span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {Math.max(totalItems - 1, listItems.length).toLocaleString()}
              </span>
            </div>
          ) : null}
          <div ref={parentRef} className={cn('max-h-[22rem] overflow-auto', latest && 'border-t')}>
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = listItems[virtualRow.index]
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
                  >
                    <AttemptRow
                      attempt={item}
                      isFirst={virtualRow.index === 0}
                      isExpanded={expandedAttempt === virtualRow.index}
                      onToggle={() =>
                        setExpandedAttempt(
                          expandedAttempt === virtualRow.index ? null : virtualRow.index
                        )
                      }
                    />
                  </div>
                )
              })}
            </div>

            {/* Load more trigger */}
            <div ref={loadMoreRef} className="h-px" />

            {isFetchingNextPage && (
              <div className="flex items-center justify-center gap-2 border-t py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading more attempts...
              </div>
            )}

            {!hasNextPage && displayItems.length > 10 && (
              <div className="border-t py-2 text-center text-xs text-muted-foreground">
                All {totalItems.toLocaleString()} attempts loaded
              </div>
            )}
          </div>
        </>
      ) : null}
    </Panel>
  )
}

function CopyStackButton({
  text,
  label,
  onCopied,
}: {
  text: string
  label: string
  onCopied?: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
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
            className="h-7 w-7 shrink-0"
            onClick={handleCopy}
            aria-label={label}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-status-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied!' : label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function AttemptTimestamp({ attempt, className }: { attempt: DisplayAttempt; className?: string }) {
  if (!attempt.timestamp) return null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('shrink-0 font-mono text-[11px] tabular-nums', className)}>
            {attempt.isEstimated && '~'}
            {formatDateWithTimezone(attempt.timestamp)}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {attempt.isEstimated ? 'Estimated time based on retry backoff' : 'Actual failure time'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** The headline failure: error type, message, then the stack with the first app frame emphasised. */
function LatestFailure({
  attempt,
  emphasis,
  isLoadingStack,
  stackUnavailable,
}: {
  attempt: DisplayAttempt
  emphasis: boolean
  isLoadingStack: boolean
  stackUnavailable: boolean
}) {
  const parsed = parseStacktrace(attempt.stacktrace)

  return (
    <div>
      <div
        className={cn(
          'flex items-start gap-2 py-3 pl-4 pr-2.5',
          emphasis && 'bg-status-danger/[0.07]'
        )}
      >
        <div className="min-w-0 flex-1 select-text">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            {parsed.errorType ? (
              <span
                className={cn(
                  'break-all font-mono text-[13px] font-semibold leading-5',
                  emphasis ? 'text-status-danger' : 'text-foreground'
                )}
              >
                {parsed.errorType}
              </span>
            ) : null}
            <span className="font-mono text-[11px] text-muted-foreground">
              attempt #{attempt.attemptNumber}
            </span>
            <AttemptTimestamp attempt={attempt} className="text-muted-foreground" />
          </div>
          <p
            className={cn(
              'mt-1 whitespace-pre-wrap font-mono text-[13px] font-medium leading-5 [overflow-wrap:anywhere]',
              !parsed.errorType && emphasis ? 'text-status-danger' : 'text-foreground'
            )}
          >
            {parsed.message || 'Unknown error'}
          </p>
        </div>
        <CopyStackButton
          text={attempt.stacktrace}
          label="Copy error"
          onCopied={() => trackEvent(AnalyticsEvents.JOB_ERROR_COPIED)}
        />
      </div>

      {parsed.frames.length > 0 ? (
        <StackFrames frames={parsed.frames} className="max-h-64 border-t" />
      ) : isLoadingStack ? (
        <div className="flex items-center gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading stack trace...
        </div>
      ) : stackUnavailable ? (
        <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          Failed to load stacktraces
        </div>
      ) : null}
    </div>
  )
}

function AttemptRow({
  attempt,
  isFirst,
  isExpanded,
  onToggle,
}: {
  attempt: DisplayAttempt
  isFirst: boolean
  isExpanded: boolean
  onToggle: () => void
}) {
  const parsed = parseStacktrace(attempt.stacktrace)

  return (
    <div className={cn(!isFirst && 'border-t')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex h-9 w-full items-center gap-2 px-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />
        )}
        <span className="w-7 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          #{attempt.attemptNumber}
        </span>
        {parsed.errorType ? (
          <span className="hidden max-w-[40%] shrink-0 truncate font-mono text-xs font-medium text-foreground sm:inline">
            {parsed.errorType}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {parsed.message || 'Unknown error'}
        </span>
        <AttemptTimestamp attempt={attempt} className="hidden text-faint md:inline" />
      </button>

      {isExpanded ? (
        <div className="border-t bg-muted/30">
          <div className="flex items-start gap-2 py-2 pl-4 pr-2.5">
            <p className="min-w-0 flex-1 select-text whitespace-pre-wrap pt-1 font-mono text-xs leading-5 text-foreground [overflow-wrap:anywhere]">
              {parsed.errorType ? `${parsed.errorType}: ` : ''}
              {parsed.message || 'Unknown error'}
            </p>
            <CopyStackButton text={attempt.stacktrace} label="Copy stack trace" />
          </div>
          {parsed.frames.length > 0 ? (
            <StackFrames frames={parsed.frames} className="max-h-56 pt-0" />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface ParsedStacktrace {
  errorType?: string
  message: string
  frames: string[]
}

// Split a stack trace into its error type, message, and frame lines.
function parseStacktrace(stacktrace: string): ParsedStacktrace {
  const lines = stacktrace.split('\n')
  const firstFrame = lines.findIndex((line) => line.trim().startsWith('at '))
  const head = (firstFrame === -1 ? lines : lines.slice(0, firstFrame)).join('\n').trim()
  const frames = firstFrame === -1 ? [] : lines.slice(firstFrame).filter((line) => line.trim())

  // Format: "ErrorType: Message"
  const errorMatch = head.match(/^([A-Za-z_$][\w$.]*(?:Error|Exception))(?::\s*|\s*$)([\s\S]*)$/)
  if (errorMatch) {
    return { errorType: errorMatch[1], message: errorMatch[2].trim(), frames }
  }

  return { message: head, frames }
}

// Stack frames: the first frame from application code carries the weight,
// dependency and runtime frames recede.
function StackFrames({ frames, className }: { frames: string[]; className?: string }) {
  let emphasised = false

  return (
    <pre
      className={cn(
        'select-text overflow-auto px-4 py-2.5 font-mono text-xs leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]',
        className
      )}
    >
      {frames.map((line, index) => {
        const frameMatch = line.match(/^\s*at\s+(.+?)(?:\s+\((.+)\))?$/)
        if (!frameMatch) {
          return (
            <div key={index} className="text-muted-foreground">
              {line.trim()}
            </div>
          )
        }

        const [, target, location] = frameMatch
        const isDependency = (location ?? target).includes('node_modules')
        const isRuntime =
          !isDependency &&
          (/^(node:|native|internal\/)/.test(location ?? target) ||
            (!location && target.includes('<anonymous>')))
        const isApp = !isDependency && !isRuntime
        const isTop = isApp && !emphasised
        if (isTop) emphasised = true

        return (
          <div
            key={index}
            className={cn(
              'pl-4 -indent-4',
              isTop ? 'font-medium text-foreground' : isApp ? 'text-muted-foreground' : 'text-faint'
            )}
          >
            <span className="text-faint">at </span>
            {target}
            {location ? (
              <>
                {' '}
                {/* Break before the path rather than inside it when a frame has to wrap. */}
                <span
                  className={cn(
                    'inline-block max-w-full indent-0 align-top',
                    isTop && 'font-normal text-muted-foreground'
                  )}
                >
                  ({location})
                </span>
              </>
            ) : null}
          </div>
        )
      })}
    </pre>
  )
}

// Calculate estimated timestamps for attempts based on backoff
function calculateTimestamp(
  index: number,
  totalItems: number,
  finishedOn?: number,
  backoff?: BackoffConfig
): number | undefined {
  if (!finishedOn || totalItems === 0) return undefined

  // First item (most recent) has the actual finishedOn timestamp
  if (index === 0) return finishedOn

  // Estimate previous attempt times based on backoff
  const type = backoff?.type ?? 'exponential'
  const baseDelay = backoff?.delay ?? 1000

  let accumulatedDelay = 0
  for (let i = 0; i < index; i++) {
    const attemptDelay = type === 'fixed' ? baseDelay : baseDelay * 2 ** i
    accumulatedDelay += attemptDelay
  }

  return finishedOn - accumulatedDelay
}
