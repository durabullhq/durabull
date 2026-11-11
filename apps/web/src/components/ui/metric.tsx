import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type MetricTone =
  | 'neutral'
  | 'success'
  | 'active'
  | 'warning'
  | 'danger'
  | 'delayed'
  | 'priority'

const TONE_TEXT: Record<MetricTone, string> = {
  neutral: 'text-foreground',
  success: 'text-status-success',
  active: 'text-status-active',
  warning: 'text-status-warning',
  danger: 'text-status-danger',
  delayed: 'text-status-delayed',
  priority: 'text-status-priority',
}

const TONE_DOT: Record<MetricTone, string> = {
  neutral: 'bg-status-neutral',
  success: 'bg-status-success',
  active: 'bg-status-active',
  warning: 'bg-status-warning',
  danger: 'bg-status-danger',
  delayed: 'bg-status-delayed',
  priority: 'bg-status-priority',
}

/**
 * One bordered row of metrics. Cells share hairline dividers instead of each
 * metric owning a card, so a page spends ~64px on its headline numbers.
 */
export function MetricStrip({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="shrink-0 overflow-hidden rounded-lg border bg-card">
      <div
        className={cn(
          // Cells draw their own right and bottom hairlines and the grid is pulled 1px
          // past the frame, which clips the outer ones. A grid gap over a
          // border-coloured background would instead paint any unfilled trailing
          // cell as a solid block.
          '-mb-px -mr-px grid auto-cols-fr grid-cols-2 sm:grid-cols-3 lg:grid-flow-col lg:grid-cols-none',
          className
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  )
}

export interface MetricProps {
  label: string
  value: React.ReactNode
  /** Colours the status dot always, and the value only when `emphasis` is set. */
  tone?: MetricTone
  /** Paint the value in the tone colour. Use when the number itself is the alarm (failed > 0). */
  emphasis?: boolean
  /** Secondary line under the value: unit, delta, or context. */
  hint?: React.ReactNode
  icon?: LucideIcon
  /** Show a live pulse on the dot (work in flight). */
  pulse?: boolean
  loading?: boolean
  /** Makes the cell a button (e.g. filter by this status). */
  onClick?: () => void
  /** Pressed/selected state when the cell acts as a filter. */
  active?: boolean
  title?: string
  className?: string
  'data-testid'?: string
}

export function Metric({
  label,
  value,
  tone = 'neutral',
  emphasis = false,
  hint,
  icon: Icon,
  pulse = false,
  loading = false,
  onClick,
  active = false,
  title,
  className,
  ...rest
}: MetricProps) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {tone !== 'neutral' || pulse ? (
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            {pulse ? (
              <span
                className={cn(
                  'absolute inline-flex h-full w-full animate-ping rounded-full opacity-70',
                  TONE_DOT[tone]
                )}
              />
            ) : null}
            <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} />
          </span>
        ) : null}
        <span className="truncate">{label}</span>
        {Icon ? <Icon className="ml-auto h-3.5 w-3.5 shrink-0 text-faint" aria-hidden /> : null}
      </span>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-16" />
      ) : (
        <span
          className={cn(
            'mt-1 block truncate font-mono text-xl font-medium leading-7 tracking-tight tabular-nums',
            emphasis ? TONE_TEXT[tone] : 'text-foreground'
          )}
        >
          {value}
        </span>
      )}
      {hint ? (
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </>
  )

  const cellClass = cn(
    // Explicit column layout so button and div cells align when only some have hints.
    'flex min-w-0 flex-col justify-start border-b border-r bg-card px-4 py-3 text-left',
    onClick &&
      'transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40',
    active && 'bg-muted/70 shadow-[inset_0_-2px_0_0_var(--color-foreground)]',
    className
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        title={title}
        className={cellClass}
        {...rest}
      >
        {body}
      </button>
    )
  }

  return (
    <div title={title} className={cellClass} {...rest}>
      {body}
    </div>
  )
}
