import { cn } from '@/lib/utils'

type StatusType =
  | 'active'
  | 'running'
  | 'paused'
  | 'idle'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'enabled'
  | 'disabled'

interface StatusBadgeProps {
  status: StatusType
  showPulse?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const statusConfig: Record<
  StatusType,
  {
    label: string
    bgColor: string
    borderColor: string
    textColor: string
    dotColor: string
    pulseColor: string
  }
> = {
  active: {
    label: 'Active',
    bgColor: 'bg-signal/10',
    borderColor: 'border-signal/25',
    textColor: 'text-signal',
    dotColor: 'bg-signal',
    pulseColor: 'bg-signal',
  },
  running: {
    label: 'Running',
    bgColor: 'bg-status-active/10',
    borderColor: 'border-status-active/25',
    textColor: 'text-status-active',
    dotColor: 'bg-status-active',
    pulseColor: 'bg-status-active',
  },
  paused: {
    label: 'Paused',
    bgColor: 'bg-status-warning/10',
    borderColor: 'border-status-warning/25',
    textColor: 'text-status-warning',
    dotColor: 'bg-status-warning',
    pulseColor: 'bg-status-warning',
  },
  idle: {
    label: 'Idle',
    bgColor: 'bg-status-neutral/10',
    borderColor: 'border-status-neutral/25',
    textColor: 'text-status-neutral',
    dotColor: 'bg-status-neutral',
    pulseColor: 'bg-status-neutral',
  },
  waiting: {
    label: 'Waiting',
    bgColor: 'bg-status-neutral/10',
    borderColor: 'border-status-neutral/25',
    textColor: 'text-status-neutral',
    dotColor: 'bg-status-neutral',
    pulseColor: 'bg-status-neutral',
  },
  completed: {
    label: 'Completed',
    bgColor: 'bg-status-success/10',
    borderColor: 'border-status-success/25',
    textColor: 'text-status-success',
    dotColor: 'bg-status-success',
    pulseColor: 'bg-status-success',
  },
  failed: {
    label: 'Failed',
    bgColor: 'bg-status-danger/10',
    borderColor: 'border-status-danger/25',
    textColor: 'text-status-danger',
    dotColor: 'bg-status-danger',
    pulseColor: 'bg-status-danger',
  },
  delayed: {
    label: 'Delayed',
    bgColor: 'bg-status-delayed/10',
    borderColor: 'border-status-delayed/25',
    textColor: 'text-status-delayed',
    dotColor: 'bg-status-delayed',
    pulseColor: 'bg-status-delayed',
  },
  enabled: {
    label: 'Enabled',
    bgColor: 'bg-signal/10',
    borderColor: 'border-signal/25',
    textColor: 'text-signal',
    dotColor: 'bg-signal',
    pulseColor: 'bg-signal',
  },
  disabled: {
    label: 'Disabled',
    bgColor: 'bg-status-neutral/10',
    borderColor: 'border-status-neutral/25',
    textColor: 'text-status-neutral',
    dotColor: 'bg-status-neutral',
    pulseColor: 'bg-status-neutral',
  },
}

const sizeConfig = {
  sm: {
    badge: 'px-2 py-0.5 text-xs gap-1.5',
    dot: 'h-1.5 w-1.5',
  },
  md: {
    badge: 'px-2.5 py-1 text-xs gap-2',
    dot: 'h-2 w-2',
  },
  lg: {
    badge: 'px-3 py-1.5 text-sm gap-2',
    dot: 'h-2.5 w-2.5',
  },
}

export function StatusBadge({
  status,
  showPulse = true,
  size = 'md',
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status]
  const sizeStyles = sizeConfig[size]
  const shouldPulse = showPulse && (status === 'active' || status === 'running')

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border font-medium transition-all',
        config.bgColor,
        config.borderColor,
        config.textColor,
        sizeStyles.badge,
        className
      )}
    >
      <span className="relative flex">
        <span className={cn('rounded-full', config.dotColor, sizeStyles.dot)} />
        {shouldPulse && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
              config.pulseColor
            )}
          />
        )}
      </span>
      {config.label}
    </span>
  )
}

// Simple animated dot for inline use
export function StatusDot({
  status,
  showPulse = true,
  size = 'md',
  className,
}: Omit<StatusBadgeProps, 'showLabel'>) {
  const config = statusConfig[status]
  const sizeStyles = sizeConfig[size]
  const shouldPulse = showPulse && (status === 'active' || status === 'running')

  return (
    <span className={cn('relative inline-flex', className)}>
      <span className={cn('rounded-full', config.dotColor, sizeStyles.dot)} />
      {shouldPulse && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
            config.pulseColor
          )}
        />
      )}
    </span>
  )
}

// Inline status indicator (dot + text) - matches Worker Details table style
interface StatusIndicatorProps {
  status: StatusType
  showPulse?: boolean
  className?: string
}

export function StatusIndicator({ status, showPulse = true, className }: StatusIndicatorProps) {
  const config = statusConfig[status]
  const shouldPulse = showPulse && (status === 'active' || status === 'running')

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {shouldPulse ? (
        <span className="relative flex h-2.5 w-2.5">
          <span
            className={cn(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              config.pulseColor
            )}
          />
          <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', config.dotColor)} />
        </span>
      ) : (
        <span className={cn('flex h-2.5 w-2.5 rounded-full', config.dotColor)} />
      )}
      <span className={cn('text-xs font-medium leading-none', config.textColor)}>
        {config.label}
      </span>
    </div>
  )
}
