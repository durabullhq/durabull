import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Kept for call-site compatibility. The header now renders a single,
 * consistent treatment regardless of variant — color is reserved for
 * status, not page identity.
 */
export type PageHeaderVariant =
  | 'default'
  | 'green'
  | 'rose'
  | 'indigo'
  | 'violet'
  | 'blue'
  | 'amber'
  | 'purple'

export interface PageHeaderProps {
  /**
   * The title of the page
   */
  title: string
  /**
   * Optional description below the title
   */
  description?: string
  /**
   * Icon to display in the header
   */
  icon: LucideIcon
  /**
   * Accepted for compatibility; no longer changes the rendering.
   */
  variant?: PageHeaderVariant
  /**
   * Optional action buttons to display on the right
   */
  actions?: React.ReactNode
  /**
   * Additional className for the container
   */
  className?: string
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-card shadow-xs">
          <Icon className="h-[18px] w-[18px] text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="truncate text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
