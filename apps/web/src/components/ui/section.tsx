import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Heading row for a block of content inside a page: title, optional count,
 * supporting line, and right-aligned controls.
 */
export function SectionHeader({
  title,
  count,
  description,
  actions,
  className,
}: {
  title: string
  count?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          {title}
          {count !== undefined && count !== null ? (
            <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
              {count}
            </span>
          ) : null}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Bordered surface with an optional header row; the default container for tables and lists. */
export function Panel({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('overflow-hidden rounded-lg border bg-card', className)} {...props}>
      {children}
    </div>
  )
}

export function PanelHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex min-h-11 flex-wrap items-center justify-between gap-2 border-b px-4 py-2',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
