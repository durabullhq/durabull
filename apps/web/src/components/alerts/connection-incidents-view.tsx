import { Link } from '@tanstack/react-router'
import { BellRing, CircleCheck, ShieldCheck, Siren, UserCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertEventsTable } from '@/components/alerts/alert-events-table'
import { AlertsViewSwitcher } from '@/components/alerts/alerts-view-switcher'
import { useAppTopBar } from '@/components/app-top-bar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type AlertEventFilterOptions,
  useAcknowledgeAlertEvent,
  useAlertSummary,
  useConnectionAlertEvents,
  useConnectionAlertRules,
  useResolveAlertEvent,
} from '@/hooks/use-alerts'
import { cn, formatNumber } from '@/lib/utils'

export type IncidentStatusFilter =
  | 'open'
  | 'firing'
  | 'acknowledged'
  | 'resolved'
  | 'suppressed'
  | 'all'

export const STATUS_FILTER_OPTIONS: Array<{ value: IncidentStatusFilter; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'firing', label: 'Firing (unacknowledged)' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'suppressed', label: 'Suppressed' },
  { value: 'all', label: 'All statuses' },
]

/** Map the UI status filter to alert event query filters. "Open" means firing incl. acknowledged. */
export function eventFiltersForStatus(status: IncidentStatusFilter): AlertEventFilterOptions {
  switch (status) {
    case 'open':
      return { status: 'firing' }
    case 'firing':
      return { status: 'firing', acknowledged: false }
    case 'acknowledged':
      return { status: 'firing', acknowledged: true }
    case 'resolved':
      return { status: 'resolved' }
    case 'suppressed':
      return { status: 'suppressed' }
    case 'all':
      return {}
  }
}

export function ConnectionIncidentsView({
  orgSlug,
  connectionId,
  status,
  queue,
  onStatusChange,
}: {
  orgSlug: string
  connectionId: string
  status: IncidentStatusFilter
  queue?: string
  onStatusChange: (status: IncidentStatusFilter) => void
}) {
  const [resolvingEventId, setResolvingEventId] = useState<string | null>(null)
  const [acknowledgingEventId, setAcknowledgingEventId] = useState<string | null>(null)

  const summaryQuery = useAlertSummary({ refetchInterval: 15_000 })
  const rulesQuery = useConnectionAlertRules(connectionId)
  const eventsQuery = useConnectionAlertEvents(connectionId, {
    ...eventFiltersForStatus(status),
    queueName: queue,
    limit: 100,
  })
  const resolvedEventsQuery = useConnectionAlertEvents(connectionId, {
    status: 'resolved',
    limit: 100,
  })
  const resolveEventMutation = useResolveAlertEvent()
  const acknowledgeEventMutation = useAcknowledgeAlertEvent(connectionId)

  const ruleNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const rule of rulesQuery.data?.rules ?? []) {
      map.set(rule.id, rule.name)
    }
    return map
  }, [rulesQuery.data?.rules])

  const summaryEntry = summaryQuery.data?.connections.find(
    (entry) => entry.connectionId === connectionId
  )
  const openCount = summaryEntry?.open ?? summaryEntry?.count ?? 0
  const acknowledgedCount = summaryEntry?.acknowledged ?? 0
  const resolvedLastDayCount = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    return (resolvedEventsQuery.data?.events ?? []).filter((event) => {
      const resolvedAt = event.resolvedAt ? new Date(event.resolvedAt).getTime() : Number.NaN
      return Number.isFinite(resolvedAt) && resolvedAt >= cutoff
    }).length
  }, [resolvedEventsQuery.data?.events])

  const events = eventsQuery.data?.events ?? []

  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <BellRing className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Alerts</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">
            Background queue incidents, routing policy, and operator response
          </span>
        </div>
      ),
      actions: (
        <Button asChild size="xs" className="gap-2">
          <Link to="/$orgSlug/c/$connectionId/alerts/new" params={{ orgSlug, connectionId }}>
            <BellRing className="h-4 w-4" />
            Create rule
          </Link>
        </Button>
      ),
    }),
    [connectionId, orgSlug]
  )

  useAppTopBar(topBarConfig)

  async function handleResolveEvent(eventId: string) {
    try {
      setResolvingEventId(eventId)
      await resolveEventMutation.mutateAsync({ connectionId, eventId })
      toast.success('Incident resolved', {
        description: 'The alert event was marked resolved for this connection.',
      })
    } catch (error) {
      toast.error('Failed to resolve incident', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      })
    } finally {
      setResolvingEventId(null)
    }
  }

  async function handleAcknowledgeEvent(eventId: string) {
    try {
      setAcknowledgingEventId(eventId)
      await acknowledgeEventMutation.mutateAsync(eventId)
      toast.success('Incident acknowledged', {
        description: 'The alert event is now marked as being handled.',
      })
    } catch (error) {
      toast.error('Failed to acknowledge incident', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      })
    } finally {
      setAcknowledgingEventId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AlertsViewSwitcher orgSlug={orgSlug} connectionId={connectionId} />
        <Select
          value={status}
          onChange={(event) => onStatusChange(event.target.value as IncidentStatusFilter)}
          className="h-9 w-[220px]"
          aria-label="Filter incidents by status"
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <IncidentMetricCard
          icon={Siren}
          label="Open"
          value={openCount}
          tone={openCount > 0 ? 'critical' : 'good'}
        />
        <IncidentMetricCard
          icon={UserCheck}
          label="Acknowledged"
          value={acknowledgedCount}
          tone={acknowledgedCount > 0 ? 'warn' : 'neutral'}
        />
        <IncidentMetricCard
          icon={CircleCheck}
          label="Resolved · 24h"
          value={resolvedLastDayCount}
          tone={resolvedLastDayCount > 0 ? 'good' : 'neutral'}
        />
      </div>

      {eventsQuery.isError ? (
        <IncidentsErrorCard
          message="Failed to load alert events. Retry, or refresh the page."
          onRetry={() => void eventsQuery.refetch()}
        />
      ) : eventsQuery.isLoading ? (
        <IncidentsLoadingState />
      ) : status === 'open' && events.length === 0 ? (
        <NoOpenIncidentsState orgSlug={orgSlug} connectionId={connectionId} />
      ) : (
        <AlertEventsTable
          orgSlug={orgSlug}
          events={events}
          emptyTitle="No incidents match this filter"
          emptyCopy="As alert rules evaluate in the background, firing and resolved incidents will appear here with queue-level context."
          getRuleName={(event) => ruleNameById.get(event.alertRuleId)}
          onResolve={(event) => handleResolveEvent(event.id)}
          resolvingEventId={resolvingEventId}
          onAcknowledge={(eventId) => handleAcknowledgeEvent(eventId)}
          acknowledgingEventId={acknowledgingEventId}
        />
      )}
    </div>
  )
}

function NoOpenIncidentsState({
  orgSlug,
  connectionId,
}: {
  orgSlug: string
  connectionId: string
}) {
  return (
    <Card className="border-border/70 bg-muted/15">
      <CardContent className="flex flex-col items-center justify-center py-14 text-center">
        <div className="rounded-full border border-status-success/25 bg-status-success/10 p-4 text-status-success">
          <CircleCheck className="h-8 w-8" />
        </div>
        <h3 className="mt-5 text-xl font-semibold">No open incidents</h3>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Nothing is firing on this connection right now. As alert rules evaluate in the background,
          new incidents will appear here with queue-level context.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/$orgSlug/c/$connectionId/alerts/rules" params={{ orgSlug, connectionId }}>
              View rules
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/$orgSlug/c/$connectionId/alerts/new" params={{ orgSlug, connectionId }}>
              Create rule
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function IncidentMetricCard({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  tone?: 'neutral' | 'good' | 'warn' | 'critical'
}) {
  const toneClasses: Record<typeof tone, string> = {
    neutral: 'bg-background/75 border-border/70',
    good: 'bg-status-success/[0.08] border-status-success/30',
    warn: 'bg-status-warning/[0.1] border-status-warning/35',
    critical: 'bg-destructive/10 border-destructive/30',
  }

  return (
    <Card className={cn('border shadow-sm', toneClasses[tone])}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription className="text-[11px] uppercase tracking-wide">{label}</CardDescription>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl font-semibold tabular-nums">{formatNumber(value)}</div>
      </CardContent>
    </Card>
  )
}

function IncidentsLoadingState() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/70">
      <Skeleton className="h-10 w-full rounded-none" />
      <div className="space-y-2 p-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function IncidentsErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        <ShieldCheck className="h-8 w-8 text-destructive" />
        <h3 className="mt-4 text-lg font-semibold">Unable to load alert data</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      </CardContent>
    </Card>
  )
}
