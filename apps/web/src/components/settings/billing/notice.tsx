import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** One explained billing state, with an optional next step. */
export function Notice({
  tone,
  icon: Icon,
  title,
  children,
  action,
  spin,
  testId,
}: {
  tone: 'info' | 'warning' | 'neutral' | 'success'
  icon: ComponentType<{ className?: string }>
  title: string
  children: ReactNode
  action?: ReactNode
  spin?: boolean
  testId?: string
}) {
  return (
    <div
      aria-live="polite"
      data-testid={testId}
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3 text-[13px]',
        tone === 'warning' && 'border-status-warning/30 bg-status-warning/10',
        tone === 'info' && 'border-status-active/30 bg-status-active/10',
        tone === 'neutral' && 'bg-muted/40',
        tone === 'success' && 'border-status-success/30 bg-status-success/10'
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          tone === 'warning' && 'text-status-warning',
          tone === 'info' && 'text-status-active',
          tone === 'neutral' && 'text-muted-foreground',
          tone === 'success' && 'text-status-success',
          spin && 'animate-spin'
        )}
      />
      <div className="min-w-0 flex-1 basis-64 space-y-0.5">
        <div className="font-medium">{title}</div>
        <div className="leading-5 text-muted-foreground">{children}</div>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  )
}
