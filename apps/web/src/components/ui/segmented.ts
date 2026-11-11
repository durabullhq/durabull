import { cn } from '@/lib/utils'

/** Container for a row of segments: `TabsList`, or any one-of-n button group. */
export const SEGMENTED_GROUP_CLASS =
  'inline-flex h-8 items-center gap-0.5 rounded-md border bg-muted p-0.5 text-muted-foreground'

/**
 * Classes for one segment in a segmented control. Use it for any one-of-n
 * choice rendered as buttons (filters, modes, intervals) so the selected state
 * looks the same everywhere. Pass size overrides through `className`.
 */
export function segmentedItemClass(selected: boolean, className?: string) {
  return cn(
    'inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50',
    selected && 'bg-card text-foreground shadow-sm ring-1 ring-border',
    className
  )
}
