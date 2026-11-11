import type * as React from 'react'
import { cn } from '@/lib/utils'

/** Keyboard hint. Use sparingly: only for shortcuts that actually work. */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border bg-muted px-1 font-mono text-[10px] font-medium leading-none text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}
