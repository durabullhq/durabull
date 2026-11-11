import { Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface BackoffConfig {
  type?: 'fixed' | 'exponential'
  delay?: number
}

interface RetryCountdownProps {
  /** Timestamp when the job was last processed (ms) - used for retry calculation */
  processedOn?: number
  /** Timestamp when the job finished (ms) - fallback for retry calculation */
  finishedOn?: number
  /** Number of attempts made so far */
  attemptsMade: number
  /** Maximum number of attempts allowed */
  maxAttempts: number
  /** Backoff configuration */
  backoff?: BackoffConfig
  /** Job status */
  status?: string
  /** Additional CSS classes */
  className?: string
  /** Compact display mode */
  compact?: boolean
  /**
   * `value` renders only the remaining time ("4m 12s") for use inside a metric cell,
   * falling back to `fallback` when no countdown applies.
   */
  variant?: 'banner' | 'value'
  /** Shown by the `value` variant when there is nothing to count down to. */
  fallback?: React.ReactNode
  /** Job creation timestamp (ms) - used for delayed job countdown */
  timestamp?: number
  /** Job delay in milliseconds - used for delayed job countdown */
  delay?: number
}

/**
 * Calculate the next retry time based on backoff configuration
 */
function calculateNextRetryTime(
  finishedOn: number,
  attemptsMade: number,
  backoff?: BackoffConfig
): number {
  const type = backoff?.type ?? 'exponential'
  const baseDelay = backoff?.delay ?? 1000

  // Calculate delay based on backoff type
  // For exponential: delay * 2^(attemptsMade - 1)
  // For fixed: just the base delay
  const delay = type === 'exponential' ? baseDelay * 2 ** (attemptsMade - 1) : baseDelay

  return finishedOn + delay
}

/**
 * Format remaining time into a human-readable string
 */
function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'now'

  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)

  return parts.join(' ')
}

/**
 * RetryCountdown component displays a countdown timer until the next job execution.
 * Supports two modes:
 * 1. Retry mode: Shows countdown for failed jobs waiting for retry (uses backoff config)
 * 2. Delayed mode: Shows countdown for standard delayed jobs (uses timestamp + delay)
 */
export function RetryCountdown({
  processedOn,
  finishedOn,
  attemptsMade,
  maxAttempts,
  backoff,
  status,
  className,
  compact = false,
  variant = 'banner',
  fallback = null,
  timestamp,
  delay,
}: RetryCountdownProps) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)

  // Use processedOn (when the job was last run) as primary, fallback to finishedOn
  // For delayed retry jobs, finishedOn is null but processedOn has the last attempt time
  const lastAttemptTime = processedOn ?? finishedOn

  // Determine countdown mode
  // Retry mode: Job has failed at least once and is waiting for retry
  const isRetryMode =
    status === 'delayed' &&
    attemptsMade > 0 &&
    attemptsMade < maxAttempts &&
    lastAttemptTime != null &&
    backoff?.delay != null

  // Delayed mode: Job is delayed and hasn't been processed yet (standard delayed job)
  const isDelayedMode =
    status === 'delayed' && attemptsMade === 0 && timestamp != null && delay != null && delay > 0

  const shouldShowCountdown = isRetryMode || isDelayedMode

  useEffect(() => {
    if (!shouldShowCountdown) {
      setTimeRemaining(null)
      return
    }

    let targetTime: number

    if (isRetryMode && lastAttemptTime) {
      // Calculate next retry time based on backoff
      targetTime = calculateNextRetryTime(lastAttemptTime, attemptsMade, backoff)
    } else if (isDelayedMode && timestamp && delay) {
      // Calculate when the delayed job will run
      targetTime = timestamp + delay
    } else {
      setTimeRemaining(null)
      return
    }

    const updateTimer = () => {
      const remaining = targetTime - Date.now()
      setTimeRemaining(remaining > 0 ? remaining : 0)
    }

    // Initial update
    updateTimer()

    // Update every second
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [
    shouldShowCountdown,
    isRetryMode,
    isDelayedMode,
    lastAttemptTime,
    attemptsMade,
    backoff,
    timestamp,
    delay,
  ])

  if (!shouldShowCountdown || timeRemaining === null) {
    return variant === 'value' ? fallback : null
  }

  if (variant === 'value') {
    return (
      <span
        className={className}
        title={isRetryMode ? 'Until the next retry' : 'Until this job runs'}
      >
        {formatTimeRemaining(timeRemaining)}
      </span>
    )
  }

  // Determine display text based on mode
  const getDisplayText = () => {
    if (timeRemaining === 0) {
      return isRetryMode ? 'Retrying now...' : 'Running now...'
    }
    return isRetryMode
      ? `Next retry in ${formatTimeRemaining(timeRemaining)}`
      : `Runs in ${formatTimeRemaining(timeRemaining)}`
  }

  const getCompactText = () => {
    if (timeRemaining === 0) {
      return isRetryMode ? 'Retrying now...' : 'Running now...'
    }
    return isRetryMode
      ? `Retry in ${formatTimeRemaining(timeRemaining)}`
      : `Runs in ${formatTimeRemaining(timeRemaining)}`
  }

  if (compact) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 font-mono text-xs font-medium tabular-nums',
          timeRemaining === 0 ? 'text-status-success' : 'text-status-delayed',
          className
        )}
      >
        <Timer className="h-3 w-3" aria-hidden />
        <span>{getCompactText()}</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2',
        timeRemaining === 0
          ? 'border-status-success/30 bg-status-success/10 text-status-success'
          : 'border-status-delayed/30 bg-status-delayed/10 text-status-delayed',
        className
      )}
    >
      <Timer className="h-4 w-4 shrink-0" aria-hidden />
      <div className="text-[13px] tabular-nums">
        {timeRemaining === 0 ? (
          <span className="font-medium">{isRetryMode ? 'Retrying now...' : 'Running now...'}</span>
        ) : (
          <>
            <span className="font-medium">{getDisplayText()}</span>
            {isRetryMode && (
              <span className="ml-2 text-muted-foreground">
                attempt {attemptsMade + 1} of {maxAttempts}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
