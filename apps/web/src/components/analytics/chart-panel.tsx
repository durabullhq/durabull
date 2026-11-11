import { Info, type LucideIcon } from 'lucide-react'
import type * as React from 'react'
import { EmptyState, type EmptyStateTone } from '@/components/ui/empty-state'
import { Panel, PanelHeader } from '@/components/ui/section'
import { cn } from '@/lib/utils'

/** Every analytics plot shares one height so rows of panels line up. */
export const CHART_HEIGHT_CLASS = 'h-[220px] w-full'

/**
 * Colours for series that represent a job state. They use the status tokens, so a
 * failed series is the same red as a failed badge. Series that are categories
 * rather than states (queues, Redis metrics) use the `chart-1…5` tokens in order.
 */
export const SERIES_COLOR = {
  completed: 'var(--color-status-success)',
  active: 'var(--color-status-active)',
  delayed: 'var(--color-status-delayed)',
  priority: 'var(--color-status-priority)',
  failed: 'var(--color-status-danger)',
  waiting: 'var(--color-status-neutral)',
} as const

/**
 * One chart in a bordered panel: a compact header (title, optional explanation
 * behind an info mark, unit/context on the right) over a fixed-height plot.
 */
export function ChartPanel({
  title,
  meta,
  hint,
  className,
  children,
}: {
  title: string
  /** Unit or context, shown small and muted on the right of the header. */
  meta?: React.ReactNode
  /** Longer explanation, kept out of the layout and shown as a tooltip. */
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Panel className={cn('min-w-0', className)}>
      <PanelHeader className="min-h-10 flex-nowrap py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-[13px] font-semibold tracking-tight">{title}</h3>
          {hint ? (
            <span role="img" aria-label={hint} title={hint} className="shrink-0 text-faint">
              <Info className="h-3 w-3" aria-hidden />
            </span>
          ) : null}
        </div>
        {meta ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </PanelHeader>
      <div className="px-3 pb-2 pt-3">{children}</div>
    </Panel>
  )
}

/** Empty / insufficient-data state that keeps the plot's height so the grid does not jump. */
export function ChartEmptyState({
  icon,
  title,
  description,
  tone,
}: {
  icon?: LucideIcon
  title: string
  description?: React.ReactNode
  tone?: EmptyStateTone
}) {
  return (
    <EmptyState
      size="inline"
      icon={icon}
      title={title}
      description={description}
      tone={tone}
      className={cn(CHART_HEIGHT_CLASS, 'py-0')}
    />
  )
}
