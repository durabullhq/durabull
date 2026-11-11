import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] border px-1.5 py-px text-[11px] font-medium leading-[18px] tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-1',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
        outline: 'border-border-strong text-muted-foreground',
        success: 'border-status-success/30 bg-status-success/10 text-status-success',
        warning: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
        info: 'border-status-active/30 bg-status-active/10 text-status-active',
        priority: 'border-status-priority/30 bg-status-priority/10 text-status-priority',
        neutral: 'border-border bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
