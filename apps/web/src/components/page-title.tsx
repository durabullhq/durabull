import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export interface PageCrumb {
  label: string
  /** Absolute app path. Omit for a non-link crumb. */
  to?: string
}

/**
 * Top-bar identity for a page: optional parent crumbs, the page title, and an
 * inline meta slot (status, counts). Pass it as `left` to `useAppTopBar`.
 *
 * The bar says where you are and what state it is in — descriptions of what a
 * page is for belong in empty states, not here.
 */
export function PageTitle({
  title,
  crumbs,
  meta,
  mono = false,
  className,
}: {
  title: string
  crumbs?: PageCrumb[]
  /** Status badge, count, or freshness shown right after the title. */
  meta?: React.ReactNode
  /** Render the title in mono (queue names, job ids, keys). */
  mono?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      {crumbs?.map((crumb, index) => (
        <span
          key={crumb.label}
          className={cn(
            'hidden shrink-0 items-center gap-2',
            // Keep the immediate parent longest; drop earlier ancestors first so a
            // long title (a job id) keeps its room on narrow windows.
            index === crumbs.length - 1 ? 'sm:flex' : 'lg:flex'
          )}
        >
          {crumb.to ? (
            <Link
              to={crumb.to}
              className="rounded-sm text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="text-[13px] text-muted-foreground">{crumb.label}</span>
          )}
          <ChevronRight className="h-3.5 w-3.5 text-faint" aria-hidden />
        </span>
      ))}
      <h1
        className={cn(
          'truncate text-sm font-semibold tracking-tight',
          mono && 'font-mono text-[13px]'
        )}
      >
        {title}
      </h1>
      {meta ? <div className="flex shrink-0 items-center gap-2">{meta}</div> : null}
    </div>
  )
}
