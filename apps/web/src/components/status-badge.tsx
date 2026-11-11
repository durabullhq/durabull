import { cn } from '@/lib/utils'

type StatusType =
  | 'active'
  | 'running'
  | 'paused'
  | 'idle'
  | 'waiting'
  | 'waiting-children'
  | 'prioritized'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'enabled'
  | 'disabled'

interface StatusBadgeProps {
  status: StatusType
  showPulse?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** Overrides the default label for the status (e.g. an active *job* reads "Active", not "Running"). */
  label?: string
  className?: string
}

type StatusTone = 'success' | 'active' | 'warning' | 'danger' | 'delayed' | 'priority' | 'neutral'

/** Tone classes are spelled out in full so Tailwind can see them. */
const TONE: Record<StatusTone, { pill: string; text: string; dot: string }> = {
  success: {
    pill: 'border-status-success/30 bg-status-success/10 text-status-success',
    text: 'text-status-success',
    dot: 'bg-status-success',
  },
  active: {
    pill: 'border-status-active/30 bg-status-active/10 text-status-active',
    text: 'text-status-active',
    dot: 'bg-status-active',
  },
  warning: {
    pill: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
    text: 'text-status-warning',
    dot: 'bg-status-warning',
  },
  danger: {
    pill: 'border-status-danger/30 bg-status-danger/10 text-status-danger',
    text: 'text-status-danger',
    dot: 'bg-status-danger',
  },
  delayed: {
    pill: 'border-status-delayed/30 bg-status-delayed/10 text-status-delayed',
    text: 'text-status-delayed',
    dot: 'bg-status-delayed',
  },
  priority: {
    pill: 'border-status-priority/30 bg-status-priority/10 text-status-priority',
    text: 'text-status-priority',
    dot: 'bg-status-priority',
  },
  neutral: {
    pill: 'border-border bg-muted text-muted-foreground',
    text: 'text-muted-foreground',
    dot: 'bg-status-neutral',
  },
}

/** Status vocabulary — see the table in docs/design-system.md. */
const statusConfig: Record<StatusType, { label: string; tone: StatusTone }> = {
  active: { label: 'Active', tone: 'success' },
  running: { label: 'Running', tone: 'active' },
  paused: { label: 'Paused', tone: 'warning' },
  idle: { label: 'Idle', tone: 'neutral' },
  waiting: { label: 'Waiting', tone: 'neutral' },
  'waiting-children': { label: 'Waiting on children', tone: 'warning' },
  prioritized: { label: 'Prioritized', tone: 'priority' },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  delayed: { label: 'Delayed', tone: 'delayed' },
  enabled: { label: 'Enabled', tone: 'success' },
  disabled: { label: 'Disabled', tone: 'neutral' },
}

const sizeConfig = {
  sm: { badge: 'gap-1 px-1.5 text-[11px] leading-[16px]', dot: 'h-1.5 w-1.5' },
  md: { badge: 'gap-1.5 px-1.5 text-[11px] leading-[18px]', dot: 'h-1.5 w-1.5' },
  lg: { badge: 'gap-1.5 px-2 text-xs leading-[22px]', dot: 'h-2 w-2' },
}

function isLive(status: StatusType): boolean {
  return status === 'active' || status === 'running'
}

function Dot({
  tone,
  pulse,
  sizeClass,
  className,
}: {
  tone: StatusTone
  pulse: boolean
  sizeClass: string
  className?: string
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', sizeClass, className)} aria-hidden>
      {pulse ? (
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-70',
            TONE[tone].dot
          )}
        />
      ) : null}
      <span className={cn('relative inline-flex rounded-full', sizeClass, TONE[tone].dot)} />
    </span>
  )
}

/** Compact dot + label pill. The one status pill for jobs, queues, workers and schedules. */
export function StatusBadge({
  status,
  showPulse = true,
  size = 'md',
  label,
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status]
  const sizeStyles = sizeConfig[size]

  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-[5px] border py-px font-medium',
        TONE[config.tone].pill,
        sizeStyles.badge,
        className
      )}
    >
      <Dot tone={config.tone} pulse={showPulse && isLive(status)} sizeClass={sizeStyles.dot} />
      {label ?? config.label}
    </span>
  )
}

/** Bare state dot for inline use next to a name or number. */
export function StatusDot({
  status,
  showPulse = true,
  size = 'md',
  className,
}: Omit<StatusBadgeProps, 'label'>) {
  const config = statusConfig[status]

  return (
    <Dot
      tone={config.tone}
      pulse={showPulse && isLive(status)}
      sizeClass={sizeConfig[size].dot}
      className={className}
    />
  )
}

// Inline status indicator (dot + text) for table cells.
interface StatusIndicatorProps {
  status: StatusType
  showPulse?: boolean
  className?: string
}

export function StatusIndicator({ status, showPulse = true, className }: StatusIndicatorProps) {
  const config = statusConfig[status]

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Dot tone={config.tone} pulse={showPulse && isLive(status)} sizeClass="h-2 w-2" />
      <span className={cn('text-xs font-medium leading-none', TONE[config.tone].text)}>
        {config.label}
      </span>
    </div>
  )
}
