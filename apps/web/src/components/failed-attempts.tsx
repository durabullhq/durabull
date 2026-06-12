import { useVirtualizer } from '@tanstack/react-virtual'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Loader2,
  RefreshCw,
  Terminal,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { RetryCountdown } from '@/components/retry-countdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useClearJobStacktraces, useJobStacktraces } from '@/hooks/use-queues'
import { cn, formatDateWithTimezone } from '@/lib/utils'

// Stacktrace item type - matches API response
interface StacktraceItem {
  attemptNumber: number
  stacktrace: string
  isLatest: boolean
}

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

export function FailedAttempts({
  queueName,
  jobId,
  attemptsMade,
  maxAttempts,
  stacktraceCount,
  failedReason,
  processedOn,
  finishedOn,
  backoff,
  status,
  className,
}: FailedAttemptsProps) {
  const clearStacktracesMutation = useClearJobStacktraces()
  const [expandedAttempt, setExpandedAttempt] = useState<number | null>(0)
  const [customKeepInput, setCustomKeepInput] = useState('25')
  const parentRef = useRef<HTMLDivElement>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useJobStacktraces(queueName, jobId, stacktraceCount > 0)

  // Flatten all pages into a single array
  const allItems = data?.pages.flatMap((page) => page.items) ?? []
  const totalItems = data?.pages[0]?.total ?? stacktraceCount

  // If we have a failedReason but no stacktraces from API, create a synthetic one
  const hasApiItems = allItems.length > 0
  const displayItems: Array<StacktraceItem & { timestamp?: number; isEstimated?: boolean }> =
    hasApiItems
      ? allItems.map((item, index) => ({
          ...item,
          timestamp: calculateTimestamp(index, allItems.length, finishedOn, backoff),
          isEstimated: index > 0,
        }))
      : failedReason
        ? [
            {
              attemptNumber: attemptsMade,
              stacktrace: failedReason,
              isLatest: true,
              timestamp: finishedOn,
              isEstimated: false,
            },
          ]
        : []

  // Virtualizer for efficient rendering
  const virtualizer = useVirtualizer({
    count: displayItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // Expanded items are larger
      return expandedAttempt === index ? 400 : 88
    },
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

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border bg-card p-8 text-center', className)}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading failed attempts...</p>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div
        className={cn(
          'rounded-lg border border-destructive/50 bg-destructive/5 p-8 text-center',
          className
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">Failed to load stacktraces</p>
        </div>
      </div>
    )
  }

  if (displayItems.length === 0 && !failedReason) {
    return (
      <div className={cn('rounded-lg border bg-card p-8 text-center', className)}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <RefreshCw className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No failed attempts recorded</p>
            <p className="text-sm text-muted-foreground">
              This job has not experienced any failures yet.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Summary header */}
      <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <XCircle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <div className="font-semibold text-foreground">
              {attemptsMade} of {maxAttempts} attempts failed
            </div>
            <div className="text-sm text-muted-foreground">
              {attemptsMade >= maxAttempts
                ? 'Maximum retry attempts reached'
                : `${maxAttempts - attemptsMade} attempts remaining`}
              {totalItems > 0 &&
                ` • ${totalItems.toLocaleString()} stacktrace${totalItems !== 1 ? 's' : ''} recorded`}
            </div>
            {/* Compact retry countdown in summary */}
            <RetryCountdown
              processedOn={processedOn}
              finishedOn={finishedOn}
              attemptsMade={attemptsMade}
              maxAttempts={maxAttempts}
              backoff={backoff}
              status={status}
              compact
              className="mt-1.5"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalItems > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={clearStacktracesMutation.isPending}
                >
                  <Terminal className="mr-1.5 h-3.5 w-3.5" />
                  Clear Stacktraces
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    clearStacktracesMutation.mutate(
                      { queueName, jobId, keepMostRecent: 0 },
                      {
                        onSuccess: ({ removed }) =>
                          toast.success('Stacktraces cleared', {
                            description: `Deleted ${removed.toLocaleString()} stacktrace${removed === 1 ? '' : 's'}.`,
                          }),
                        onError: (error) =>
                          toast.error('Failed to clear stacktraces', {
                            description: error.message,
                          }),
                      }
                    )
                  }
                >
                  Delete all stacktraces
                </DropdownMenuItem>
                {[10, 50, 100].map((keep) => (
                  <DropdownMenuItem
                    key={keep}
                    onClick={() =>
                      clearStacktracesMutation.mutate(
                        { queueName, jobId, keepMostRecent: keep },
                        {
                          onSuccess: ({ removed }) =>
                            toast.success('Stacktraces trimmed', {
                              description: `Deleted ${removed.toLocaleString()} stacktrace${removed === 1 ? '' : 's'} and kept ${keep.toLocaleString()}.`,
                            }),
                          onError: (error) =>
                            toast.error('Failed to clear stacktraces', {
                              description: error.message,
                            }),
                        }
                      )
                    }
                  >
                    Keep latest {keep.toLocaleString()}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onClick={() => {
                    const parsed = Number.parseInt(customKeepInput, 10)
                    const keep = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
                    clearStacktracesMutation.mutate(
                      { queueName, jobId, keepMostRecent: keep },
                      {
                        onSuccess: ({ removed }) =>
                          toast.success('Stacktraces trimmed', {
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
                  }}
                >
                  Apply custom keep value
                </DropdownMenuItem>
                <div className="px-2 pb-1.5 pt-1">
                  <Label htmlFor="custom-stacktrace-keep" className="text-xs text-muted-foreground">
                    Keep most recent X stacktraces
                  </Label>
                  <Input
                    id="custom-stacktrace-keep"
                    value={customKeepInput}
                    onChange={(event) => setCustomKeepInput(event.target.value)}
                    inputMode="numeric"
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Badge variant="destructive" className="font-mono">
            {((attemptsMade / maxAttempts) * 100).toFixed(0)}% exhausted
          </Badge>
        </div>
      </div>

      {/* Virtualized attempts timeline */}
      <div
        ref={parentRef}
        className="relative pl-6 min-h-[200px] max-h-[calc(100vh-500px)] overflow-auto"
      >
        {/* Timeline line */}
        <div className="absolute left-[11px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-destructive via-destructive/50 to-destructive/20" />

        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = displayItems[virtualRow.index]
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
                className="pb-3"
              >
                <AttemptCard
                  attempt={{
                    attemptNumber: item.attemptNumber,
                    stacktrace: item.stacktrace,
                    isLatest: item.isLatest,
                    timestamp: item.timestamp,
                    isEstimated: item.isEstimated ?? false,
                  }}
                  index={virtualRow.index}
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
        <div ref={loadMoreRef} className="h-4" />

        {/* Loading indicator */}
        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading more attempts...</span>
          </div>
        )}

        {/* End of list indicator */}
        {!hasNextPage && displayItems.length > 10 && (
          <div className="flex items-center justify-center py-4">
            <span className="text-xs text-muted-foreground">
              All {totalItems.toLocaleString()} attempts loaded
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

interface AttemptCardProps {
  attempt: {
    attemptNumber: number
    stacktrace: string
    isLatest: boolean
    timestamp?: number
    isEstimated: boolean
  }
  index: number
  isExpanded: boolean
  onToggle: () => void
}

function AttemptCard({ attempt, isExpanded, onToggle }: AttemptCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(attempt.stacktrace)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Parse the stacktrace to extract error info
  const errorInfo = parseStacktrace(attempt.stacktrace)

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div
        className={cn(
          'relative rounded-lg border transition-all duration-200',
          isExpanded
            ? 'border-destructive/50 bg-card shadow-lg shadow-destructive/5'
            : 'border-border bg-card/50 hover:bg-card hover:border-border',
          attempt.isLatest && !isExpanded && 'ring-1 ring-destructive/20'
        )}
      >
        {/* Timeline dot */}
        <div
          className={cn(
            'absolute -left-6 top-4 h-[22px] w-[22px] rounded-full border-2 flex items-center justify-center transition-all',
            attempt.isLatest
              ? 'border-destructive bg-destructive text-destructive-foreground'
              : 'border-muted-foreground/30 bg-background text-muted-foreground'
          )}
        >
          {attempt.isLatest ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <span className="text-[10px] font-bold">{attempt.attemptNumber}</span>
          )}
        </div>

        <CollapsibleTrigger asChild>
          <div className="cursor-pointer p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-muted-foreground">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      Attempt #{attempt.attemptNumber}
                    </span>
                    {attempt.isLatest && (
                      <Badge variant="destructive" className="text-xs">
                        Latest
                      </Badge>
                    )}
                    {attempt.timestamp && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                'flex items-center gap-1 text-xs',
                                attempt.isEstimated
                                  ? 'text-muted-foreground/70 italic'
                                  : 'text-muted-foreground'
                              )}
                            >
                              <Clock className="h-3 w-3" />
                              {attempt.isEstimated && '~'}
                              {formatDateWithTimezone(attempt.timestamp)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {attempt.isEstimated
                              ? 'Estimated time based on retry backoff'
                              : 'Actual failure time'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5 max-w-md font-mono">
                    {errorInfo.message || 'Unknown error'}
                  </p>
                </div>
              </div>
              {errorInfo.errorType && (
                <Badge variant="outline" className="font-mono text-xs shrink-0">
                  {errorInfo.errorType}
                </Badge>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 pb-4 pt-3">
            {/* Error message */}
            {errorInfo.message && (
              <div className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive font-medium break-all">
                    {errorInfo.message}
                  </p>
                </div>
              </div>
            )}

            {/* Stack trace */}
            <div className="relative group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Terminal className="h-4 w-4" />
                  <span>Stack Trace</span>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-status-success" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{copied ? 'Copied!' : 'Copy stack trace'}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="rounded-lg bg-[#0d1117] border border-[#30363d] overflow-hidden">
                <pre className="p-4 text-xs font-mono overflow-auto max-h-[400px] leading-relaxed">
                  {formatStacktrace(attempt.stacktrace)}
                </pre>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// Parse stacktrace to extract error type and message
function parseStacktrace(stacktrace: string): { errorType?: string; message?: string } {
  const lines = stacktrace.split('\n')
  const firstLine = lines[0] || ''

  // Try to match common error formats
  // Format: "ErrorType: Message"
  const errorMatch = firstLine.match(/^(\w+Error|\w+Exception):?\s*(.*)/)
  if (errorMatch) {
    return {
      errorType: errorMatch[1],
      message: errorMatch[2] || firstLine,
    }
  }

  // Format: Just a message
  return {
    message: firstLine.slice(0, 200) + (firstLine.length > 200 ? '…' : ''),
  }
}

// Format stacktrace with syntax highlighting
function formatStacktrace(stacktrace: string): React.ReactNode {
  const lines = stacktrace.split('\n')

  return lines.map((line, index) => {
    const trimmedLine = line.trim()

    // First line (error message) - red
    if (index === 0) {
      return (
        <div key={index} className="text-[#ff7b72]">
          {line}
        </div>
      )
    }

    // Stack frame lines (starting with "at ")
    if (trimmedLine.startsWith('at ')) {
      // Parse the stack frame
      const frameMatch = line.match(/^(\s*at\s+)(.+?)(?:\s+\((.+)\))?$/)
      if (frameMatch) {
        const [, atPart, functionName, location] = frameMatch

        // Check if it's from node_modules (dimmed)
        const isNodeModules =
          location?.includes('node_modules') || functionName.includes('node_modules')

        // Check if it's an internal/built-in (very dimmed)
        const isInternal =
          location?.startsWith('node:') || (!location && functionName.includes('<anonymous>'))

        return (
          <div
            key={index}
            className={cn(isInternal && 'opacity-40', isNodeModules && !isInternal && 'opacity-60')}
          >
            <span className="text-[#8b949e]">{atPart}</span>
            <span className={cn(isNodeModules ? 'text-[#8b949e]' : 'text-[#d2a8ff]')}>
              {functionName}
            </span>
            {location && (
              <>
                <span className="text-[#8b949e]"> (</span>
                <span className={cn(isNodeModules ? 'text-[#8b949e]' : 'text-[#a5d6ff]')}>
                  {location}
                </span>
                <span className="text-[#8b949e]">)</span>
              </>
            )}
          </div>
        )
      }
    }

    // Other lines
    return (
      <div key={index} className="text-[#c9d1d9]">
        {line}
      </div>
    )
  })
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
