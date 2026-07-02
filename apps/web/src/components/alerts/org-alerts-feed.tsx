import { Link } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight, BellRing, ShieldAlert, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertEventsTable } from '@/components/alerts/alert-events-table'
import {
  eventFiltersForStatus,
  type IncidentStatusFilter,
  STATUS_FILTER_OPTIONS,
} from '@/components/alerts/connection-incidents-view'
import { useAppTopBar } from '@/components/app-top-bar'
import { useConnection } from '@/components/connection-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type AlertEventRecord,
  type AlertSummaryConnection,
  getOpenAlertCount,
  useAcknowledgeGlobalAlertEvent,
  useAlertSummary,
  useGlobalAlertEvents,
  useResolveGlobalAlertEvent,
} from '@/hooks/use-alerts'
import { cn, formatNumber } from '@/lib/utils'

export interface OrgAlertsFilters {
  status: IncidentStatusFilter
  connection?: string
}

interface ConnectionStripEntry {
  connectionId: string
  name: string
  firing: number
  acknowledged: number
  open: number
}

export function OrgAlertsFeed({
  orgSlug,
  status,
  connection,
  onFiltersChange,
}: {
  orgSlug: string
  status: IncidentStatusFilter
  connection?: string
  onFiltersChange: (filters: OrgAlertsFilters) => void
}) {
  const { connections } = useConnection()
  const [resolvingEventId, setResolvingEventId] = useState<string | null>(null)
  const [acknowledgingEventId, setAcknowledgingEventId] = useState<string | null>(null)

  const summaryQuery = useAlertSummary({ refetchInterval: 15_000 })
  const eventsQuery = useGlobalAlertEvents({
    ...eventFiltersForStatus(status),
    connectionId: connection || undefined,
    limit: 100,
  })
  const resolveEventMutation = useResolveGlobalAlertEvent()
  const acknowledgeEventMutation = useAcknowledgeGlobalAlertEvent()

  const connectionNameById = useMemo(
    () => new Map(connections.map((entry) => [entry.id, entry.name])),
    [connections]
  )

  const totalOpenCount = getOpenAlertCount(summaryQuery.data?.connections)

  const stripEntries = useMemo<ConnectionStripEntry[]>(() => {
    const summaries = summaryQuery.data?.connections ?? []
    return summaries
      .map((entry: AlertSummaryConnection) => ({
        connectionId: entry.connectionId,
        name: connectionNameById.get(entry.connectionId) ?? 'Unknown connection',
        firing: entry.firing ?? 0,
        acknowledged: entry.acknowledged ?? 0,
        open: getOpenAlertCount(summaries, entry.connectionId),
      }))
      .filter((entry) => entry.open > 0)
      .sort((left, right) => right.open - left.open || left.name.localeCompare(right.name))
  }, [summaryQuery.data?.connections, connectionNameById])

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
            Cross-connection incident feed for the active organization
          </span>
        </div>
      ),
    }),
    []
  )

  useAppTopBar(topBarConfig)

  async function handleResolveEvent(event: AlertEventRecord) {
    try {
      setResolvingEventId(event.id)
      await resolveEventMutation.mutateAsync({
        eventId: event.id,
        connectionId: event.connectionId,
      })
      toast.success('Incident resolved', {
        description: 'The alert event was marked resolved.',
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
    const event = events.find((candidate) => candidate.id === eventId)
    try {
      setAcknowledgingEventId(eventId)
      await acknowledgeEventMutation.mutateAsync({
        eventId,
        connectionId: event?.connectionId,
      })
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

  const isLoading = summaryQuery.isLoading || eventsQuery.isLoading
  const isError = summaryQuery.isError || eventsQuery.isError

  if (isError) {
    return (
      <div className="space-y-6">
        <OrgFeedHeader totalOpenCount={totalOpenCount} />
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <ShieldAlert className="h-8 w-8 text-destructive" />
            <h3 className="mt-4 text-lg font-semibold">Unable to load alert data</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Failed to fetch organization incidents. Retry, or refresh the page.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                void summaryQuery.refetch()
                void eventsQuery.refetch()
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <OrgFeedHeader totalOpenCount={totalOpenCount} />
        <OrgFeedLoadingState />
      </div>
    )
  }

  const showCalmEmptyState = status === 'open' && !connection && events.length === 0

  return (
    <div className="space-y-6">
      <OrgFeedHeader totalOpenCount={totalOpenCount} />

      {stripEntries.length > 0 ? (
        <div className="flex flex-wrap gap-2" data-testid="org-alerts-connection-strip">
          {stripEntries.map((entry) => (
            <Link
              key={entry.connectionId}
              to="/$orgSlug/c/$connectionId/alerts"
              params={{ orgSlug, connectionId: entry.connectionId }}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                'border-destructive/25 bg-destructive/5 hover:border-destructive/50'
              )}
            >
              <span className="font-medium">{entry.name}</span>
              <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                {formatNumber(entry.firing)} firing
              </Badge>
              {entry.acknowledged > 0 ? (
                <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                  {formatNumber(entry.acknowledged)} ack'd
                </Badge>
              ) : null}
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={connection ?? 'all'}
          onChange={(event) =>
            onFiltersChange({
              status,
              connection: event.target.value === 'all' ? undefined : event.target.value,
            })
          }
          className="h-9 w-[220px]"
          aria-label="Filter incidents by connection"
        >
          <option value="all">All connections</option>
          {connections.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(event) =>
            onFiltersChange({ status: event.target.value as IncidentStatusFilter, connection })
          }
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

      {showCalmEmptyState ? (
        <OrgFeedCalmEmptyState orgSlug={orgSlug} connections={connections} />
      ) : (
        <AlertEventsTable
          orgSlug={orgSlug}
          events={events}
          emptyTitle="No incidents match these filters"
          emptyCopy="Adjust the connection or status filters, or wait for alert rules to evaluate in the background."
          showConnectionColumn
          connectionNameForEvent={(event) =>
            connectionNameById.get(event.connectionId) ?? 'Unknown connection'
          }
          onResolve={(event) => handleResolveEvent(event)}
          resolvingEventId={resolvingEventId}
          onAcknowledge={(eventId) => handleAcknowledgeEvent(eventId)}
          acknowledgingEventId={acknowledgingEventId}
        />
      )}
    </div>
  )
}

function OrgFeedHeader({ totalOpenCount }: { totalOpenCount: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="text-lg font-semibold">Organization incidents</h2>
      <Badge variant={totalOpenCount > 0 ? 'destructive' : 'success'}>
        {formatNumber(totalOpenCount)} open
      </Badge>
    </div>
  )
}

function OrgFeedCalmEmptyState({
  orgSlug,
  connections,
}: {
  orgSlug: string
  connections: Array<{ id: string; name: string }>
}) {
  return (
    <Card className="border-border/70 bg-muted/15">
      <CardContent className="flex flex-col items-center justify-center py-14 text-center">
        <div className="rounded-full border border-status-success/25 bg-status-success/10 p-4 text-status-success">
          <Sparkles className="h-8 w-8" />
        </div>
        <h3 className="mt-5 text-xl font-semibold">No open incidents</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Nothing is firing across your connections right now. As alert rules evaluate in the
          background, cross-connection incidents will appear here.
        </p>
        {connections.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {connections.slice(0, 4).map((connection) => (
              <Button key={connection.id} asChild variant="outline" size="sm" className="gap-1.5">
                <Link
                  to="/$orgSlug/c/$connectionId/alerts"
                  params={{ orgSlug, connectionId: connection.id }}
                >
                  Configure alerts on {connection.name}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Add a Redis connection to unlock background alerting and incident history.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function OrgFeedLoadingState() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-48 rounded-full" />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-[220px]" />
        <Skeleton className="h-9 w-[220px]" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/70">
        <Skeleton className="h-10 w-full rounded-none" />
        <div className="space-y-2 p-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
