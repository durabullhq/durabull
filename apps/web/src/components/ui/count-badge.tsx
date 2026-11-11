import { cn } from '@/lib/utils'

/**
 * Round count pill for navigation and tabs. `danger` is the one solid status
 * fill the design system allows: the number of open incidents.
 */
export function CountBadge({
  value,
  tone = 'neutral',
  className,
}: {
  value: number
  tone?: 'neutral' | 'danger'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold tabular-nums',
        tone === 'danger'
          ? 'bg-status-danger text-status-danger-foreground'
          : 'bg-muted font-medium text-muted-foreground',
        className
      )}
    >
      {value}
    </span>
  )
}
