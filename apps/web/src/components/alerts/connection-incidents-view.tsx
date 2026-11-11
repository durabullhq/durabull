import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  BellOff,
  BellRing,
  CheckCheck,
  CircleCheck,
  Plus,
  ShieldAlert,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertEventsTable } from '@/components/alerts/alert-events-table'
import { AlertsHeader } from '@/components/alerts/alerts-view-switcher'
import { BulkResolveDialog } from '@/components/alerts/bulk-resolve-dialog'
import { useAppTopBar } from '@/components/app-top-bar'
import { PageTitle } from '@/components/page-title'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, PanelHeader } from '@/components/ui/section'
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

export const STATUS_FILTER_OPTIONS: Array<{
  value: IncidentStatusFilter
  label: string
  /** Compact label for the one-click filter row. */
  shortLabel: string
}> = [
  { value: 'open', label: 'Open', shortLabel: 'Open' },
  { value: 'firing', label: 'Firing (unacknowledged)', shortLabel: 'Unacknowledged' },
  { value: 'acknowledged', label: 'Acknowledged', shortLabel: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved', shortLabel: 'Resolved' },
  { value: 'suppressed', label: 'Suppressed', shortLabel: 'Suppressed' },
  { value: 'all', label: 'All statuses', shortLabel: 'All' },
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
  const [bulkResolveOpen, setBulkResolveOpen] = useState(false)
  // Bumped only when opening (not closing) so BulkResolveDialog remounts with
  // fresh filter/selection state each time, without disrupting Radix's own
  // close animation.
  const [bulkResolveOpenCount, setBulkResolveOpenCount] = useState(0)

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
  const rules = rulesQuery.data?.rules ?? []
  // A rule with no destination still opens incidents here, but tells nobody.
  const silentRuleCount = rules.filter(
    (rule) => rule.enabled && rule.notificationChannels.length === 0
  ).length
  const hasOtherConnections = (summaryQuery.data?.connections.length ?? 0) > 1

  const topBarConfig = useMemo(
    () => ({
      left: <PageTitle title="Alerts" />,
      actions: (
        <Button asChild size="xs">
          <Link to="/$orgSlug/c/$connectionId/alerts/new" params={{ orgSlug, connectionId }}>
            <Plus className="h-3.5 w-3.5" />
            New rule
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

  const filterCounts: Partial<Record<IncidentStatusFilter, number>> = {
    open: openCount,
    firing: Math.max(openCount - acknowledgedCount, 0),
    acknowledged: acknowledgedCount,
  }

  return (
    <div className="space-y-4">
      <AlertsHeader orgSlug={orgSlug} connectionId={connectionId}>
        {hasOtherConnections ? (
          <Button asChild variant="ghost" size="xs">
            <Link to="/$orgSlug/alerts" params={{ orgSlug }}>
              All connections
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </AlertsHeader>

      {silentRuleCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-status-warning/30 bg-status-warning/10 px-4 py-2.5 text-[13px]">
          <span className="flex items-center gap-2">
            <BellOff className="h-4 w-4 shrink-0 text-status-warning" aria-hidden />
            <span>
              {silentRuleCount === 1
                ? '1 active rule notifies no one.'
                : `${formatNumber(silentRuleCount)} active rules notify no one.`}{' '}
              <span className="text-muted-foreground">
                Their incidents only appear on this page.
              </span>
            </span>
          </span>
          <Button asChild variant="outline" size="xs">
            <Link to="/$orgSlug/c/$connectionId/alerts/rules" params={{ orgSlug, connectionId }}>
              Add a destination
            </Link>
          </Button>
        </div>
      ) : null}

      <Panel>
        <PanelHeader>
          <fieldset
            aria-label="Filter incidents by status"
            className="-mx-1 flex flex-wrap items-center gap-0.5"
          >
            {STATUS_FILTER_OPTIONS.map((option) => {
              const count = filterCounts[option.value]
              const isActive = status === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onStatusChange(option.value)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    isActive && 'bg-accent text-foreground'
                  )}
                >
                  {option.shortLabel}
                  {count !== undefined ? (
                    <span
                      className={cn(
                        'font-mono text-[11px] tabular-nums',
                        option.value === 'firing' && count > 0 ? 'text-status-danger' : 'text-faint'
                      )}
                    >
                      {formatNumber(count)}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </fieldset>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              <span className="font-mono tabular-nums text-foreground">
                {formatNumber(resolvedLastDayCount)}
              </span>{' '}
              resolved in 24h
            </span>
            {queue ? (
              <Badge variant="neutral" className="font-mono">
                {queue}
              </Badge>
            ) : null}
            {openCount > 0 ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => {
                  setBulkResolveOpenCount((count) => count + 1)
                  setBulkResolveOpen(true)
                }}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Bulk resolve
              </Button>
            ) : null}
          </div>
        </PanelHeader>

        {eventsQuery.isError ? (
          <EmptyState
            size="inline"
            icon={ShieldAlert}
            tone="danger"
            title="Unable to load alert data"
            description="Failed to load alert events. Retry, or refresh the page."
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void eventsQuery.refetch()}
              >
                Retry
              </Button>
            }
          />
        ) : eventsQuery.isLoading ? (
          <IncidentsLoadingState />
        ) : status === 'open' && events.length === 0 ? (
          <NoOpenIncidentsState
            orgSlug={orgSlug}
            connectionId={connectionId}
            hasRules={rulesQuery.isLoading || rules.length > 0}
          />
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
      </Panel>

      <BulkResolveDialog
        key={bulkResolveOpenCount}
        connectionId={connectionId}
        open={bulkResolveOpen}
        onOpenChange={setBulkResolveOpen}
      />
    </div>
  )
}

function NoOpenIncidentsState({
  orgSlug,
  connectionId,
  hasRules,
}: {
  orgSlug: string
  connectionId: string
  hasRules: boolean
}) {
  return (
    <EmptyState
      size="inline"
      className="py-16"
      icon={hasRules ? CircleCheck : BellRing}
      tone={hasRules ? 'success' : 'neutral'}
      title="No open incidents"
      description={
        hasRules
          ? 'Nothing is firing on this connection. Rules are evaluated in the background and new incidents appear here with queue-level context.'
          : 'Nothing is watching this connection yet. Create a rule to open an incident when failures spike, a queue stalls, or Redis runs hot.'
      }
      actions={
        <>
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
        </>
      }
    />
  )
}

function IncidentsLoadingState() {
  return (
    <div className="divide-y">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-2.5">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  )
}
