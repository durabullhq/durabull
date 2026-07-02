import { BellRing, GaugeCircle, Moon, Siren, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type {
  AlertEventRecord,
  AlertEventStatus,
  AlertRuleState,
  AlertRuleType,
} from '@/hooks/use-alerts'
import { cn, formatDateWithTimezone, formatNumber } from '@/lib/utils'

const ALERT_TYPE_META: Record<
  AlertRuleType,
  {
    label: string
    shortLabel: string
    icon: React.ComponentType<{ className?: string }>
    description: string
  }
> = {
  failure_threshold: {
    label: 'Failure Threshold',
    shortLabel: 'Threshold',
    icon: TriangleAlert,
    description: 'Fires when new failures cross a configured count inside a time window.',
  },
  failure_rate: {
    label: 'Failure Rate',
    shortLabel: 'Rate',
    icon: GaugeCircle,
    description: 'Fires when the queue failure percentage rises above an acceptable limit.',
  },
  queue_stalled: {
    label: 'Queue Stalled',
    shortLabel: 'Stalled',
    icon: Siren,
    description: 'Fires when work is backing up and the queue stops completing jobs.',
  },
  job_failed: {
    label: 'Job Failed',
    shortLabel: 'Job',
    icon: BellRing,
    description: 'Creates a deduplicated incident for each failed job id.',
  },
}

export function getAlertTypeMeta(type: AlertRuleType) {
  return ALERT_TYPE_META[type]
}

export function AlertTypeBadge({
  type,
  compact = false,
}: {
  type: AlertRuleType
  compact?: boolean
}) {
  const meta = getAlertTypeMeta(type)
  const Icon = meta.icon

  return (
    <Badge variant="outline" className="gap-1.5 border-border/70 bg-background/70">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {compact ? meta.shortLabel : meta.label}
    </Badge>
  )
}

export type AlertEventDisplayStatus = 'firing' | 'acknowledged' | 'resolved' | 'suppressed'

/** Acknowledged is derived, not a stored status: a firing event with ack provenance. */
export function getAlertEventDisplayStatus(
  event: Pick<AlertEventRecord, 'status' | 'acknowledgedAt'>
): AlertEventDisplayStatus {
  if (event.status === 'firing' && event.acknowledgedAt) return 'acknowledged'
  return event.status
}

export function AlertStatusBadge({
  status,
  acknowledged = false,
  emphasize = false,
}: {
  status: AlertEventStatus
  acknowledged?: boolean
  emphasize?: boolean
}) {
  const isAcknowledged = status === 'firing' && acknowledged
  const variant = isAcknowledged
    ? 'warning'
    : status === 'firing'
      ? 'destructive'
      : status === 'resolved'
        ? 'success'
        : 'outline'

  return (
    <Badge
      variant={variant}
      className={cn(
        'capitalize',
        status === 'suppressed' && 'text-muted-foreground',
        emphasize &&
          status === 'firing' &&
          !isAcknowledged &&
          'shadow-[0_0_0_4px_rgba(239,68,68,0.12)]'
      )}
    >
      {isAcknowledged ? 'Acknowledged' : status}
    </Badge>
  )
}

export function RuleStateBadge({
  state,
  mutedUntil,
}: {
  state: AlertRuleState
  mutedUntil?: Date | string | null
}) {
  if (state === 'snoozed') {
    const remaining = formatAlertTimeRemaining(mutedUntil)

    return (
      <Badge variant="warning" className="gap-1">
        <Moon className="h-3 w-3" />
        Snoozed{remaining ? ` · ${remaining} left` : ''}
      </Badge>
    )
  }

  if (state === 'disabled') {
    return <Badge variant="secondary">Muted</Badge>
  }

  return <Badge variant="success">Enabled</Badge>
}

export function AlertSeverityChip({
  count,
  label = 'Open Alerts',
}: {
  count: number
  label?: string
}) {
  const variant = count > 0 ? 'destructive' : 'success'

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
        count > 0
          ? 'border-destructive/25 bg-destructive/10 text-destructive'
          : 'border-status-success/25 bg-status-success/10 text-status-success'
      )}
    >
      <BellRing className="h-3.5 w-3.5" />
      <Badge variant={variant} className="px-1.5 py-0 text-[10px]">
        {formatNumber(count)}
      </Badge>
      <span>{label}</span>
    </div>
  )
}

export function formatAlertDate(value: Date | string | number | null | undefined) {
  const timestamp = toTimestamp(value)
  if (!timestamp) return '—'
  return formatDateWithTimezone(timestamp)
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function formatCompactDuration(ms: number): string {
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / MINUTE_MS))}m`
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)}h`
  return `${Math.round(ms / DAY_MS)}d`
}

/** Compact "5m ago" style relative timestamp for table rows. */
export function formatRelativeAlertTime(value: Date | string | number | null | undefined): string {
  const timestamp = toTimestamp(value)
  if (!timestamp) return '—'
  const elapsed = Date.now() - timestamp
  if (elapsed < MINUTE_MS) return 'just now'
  return `${formatCompactDuration(elapsed)} ago`
}

/** Compact "3h" style duration until a future timestamp, or null when passed/absent. */
export function formatAlertTimeRemaining(
  value: Date | string | number | null | undefined
): string | null {
  const timestamp = toTimestamp(value)
  if (!timestamp) return null
  const remaining = timestamp - Date.now()
  if (remaining <= 0) return null
  return formatCompactDuration(remaining)
}

export function toTimestamp(value: Date | string | number | null | undefined): number | undefined {
  if (!value) return undefined
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function getAlertEventResolvedLabel(event: AlertEventRecord) {
  if (event.status === 'resolved' && event.resolvedAt) {
    return `Resolved ${formatAlertDate(event.resolvedAt)}`
  }
  if (event.status === 'suppressed') {
    return 'Suppressed during cooldown'
  }
  return 'Still firing'
}
