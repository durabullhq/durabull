import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export type EmptyStateTone = 'neutral' | 'success' | 'danger' | 'warning'

const TONE_ICON: Record<EmptyStateTone, string> = {
  neutral: 'text-muted-foreground',
  success: 'text-status-success',
  danger: 'text-status-danger',
  warning: 'text-status-warning',
}

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: React.ReactNode
  /** Primary and secondary actions; keep to two. */
  actions?: React.ReactNode
  tone?: EmptyStateTone
  /** `page` fills its container with a blueprint backdrop; `inline` sits inside a panel. */
  size?: 'page' | 'inline'
  className?: string
  children?: React.ReactNode
}

/**
 * The one empty/error/zero-result treatment. Says what is true, why, and the
 * next action — never decoration.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  tone = 'neutral',
  size = 'page',
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative isolate flex flex-col items-center justify-center overflow-hidden text-center',
        size === 'page' ? 'rounded-lg border border-dashed px-6 py-16' : 'px-4 py-10',
        className
      )}
    >
      {size === 'page' ? (
        <div className="bg-grid mask-radial-fade absolute inset-0 -z-10" aria-hidden />
      ) : null}
      {Icon ? (
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border bg-card shadow-xs">
          <Icon className={cn('h-5 w-5', TONE_ICON[tone])} aria-hidden />
        </div>
      ) : null}
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-[13px] leading-5 text-muted-foreground">{description}</p>
      ) : null}
      {actions ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{actions}</div>
      ) : null}
      {children}
    </div>
  )
}
