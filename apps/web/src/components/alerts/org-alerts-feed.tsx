import { Link } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight, CircleCheck, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertEventsTable } from '@/components/alerts/alert-events-table'
import {
  eventFiltersForStatus,
  type IncidentStatusFilter,
  STATUS_FILTER_OPTIONS,
} from '@/components/alerts/incident-status-filter'
import { useAppTopBar } from '@/components/app-top-bar'
import { useConnection } from '@/components/connection-provider'
import { PageTitle } from '@/components/page-title'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, PanelHeader } from '@/components/ui/section'
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
import { formatNumber } from '@/lib/utils'

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
        <PageTitle
          title="Alerts"
          meta={
            <>
              <span className="text-[13px] text-muted-foreground">All connections</span>
              <Badge variant={totalOpenCount > 0 ? 'destructive' : 'success'}>
                {formatNumber(totalOpenCount)} open
              </Badge>
            </>
          }
        />
      ),
    }),
    [totalOpenCount]
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
      <Panel>
        <EmptyState
          size="inline"
          icon={ShieldAlert}
          tone="danger"
          title="Unable to load alert data"
          description="Failed to fetch organization incidents. Retry, or refresh the page."
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void summaryQuery.refetch()
                void eventsQuery.refetch()
              }}
            >
              Retry
            </Button>
          }
        />
      </Panel>
    )
  }

  if (isLoading) {
    return <OrgFeedLoadingState />
  }

  const showCalmEmptyState = status === 'open' && !connection && events.length === 0

  return (
    <div className="space-y-4">
      {stripEntries.length > 0 ? (
        <div className="flex flex-wrap gap-2" data-testid="org-alerts-connection-strip">
          {stripEntries.map((entry) => (
            <Link
              key={entry.connectionId}
              to="/$orgSlug/c/$connectionId/alerts"
              params={{ orgSlug, connectionId: entry.connectionId }}
              className="inline-flex h-8 items-center gap-2 rounded-md border bg-card px-2.5 text-[13px] transition-colors hover:border-border-strong hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span className="font-medium">{entry.name}</span>
              <Badge variant="destructive">{formatNumber(entry.firing)} firing</Badge>
              {entry.acknowledged > 0 ? (
                <Badge variant="warning">{formatNumber(entry.acknowledged)} ack'd</Badge>
              ) : null}
              <ArrowUpRight className="h-3.5 w-3.5 text-faint" />
            </Link>
          ))}
        </div>
      ) : null}

      <Panel>
        <PanelHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={connection ?? 'all'}
              onChange={(event) =>
                onFiltersChange({
                  status,
                  connection: event.target.value === 'all' ? undefined : event.target.value,
                })
              }
              className="w-[200px]"
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
              className="w-[200px]"
              aria-label="Filter incidents by status"
            >
              {STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </PanelHeader>
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
      </Panel>
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
    <EmptyState
      size="inline"
      className="py-16"
      icon={CircleCheck}
      tone="success"
      title="No open incidents"
      description={
        connections.length > 0
          ? 'Nothing is firing across your connections. Incidents from every connection appear here as rules evaluate in the background.'
          : 'Add a Redis connection to unlock background alerting and incident history.'
      }
      actions={
        connections.length > 0
          ? connections.slice(0, 4).map((connection) => (
              <Button key={connection.id} asChild variant="outline" size="sm">
                <Link
                  to="/$orgSlug/c/$connectionId/alerts"
                  params={{ orgSlug, connectionId: connection.id }}
                >
                  Configure alerts on {connection.name}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ))
          : undefined
      }
    />
  )
}

function OrgFeedLoadingState() {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex gap-2 border-b px-4 py-2">
        <Skeleton className="h-8 w-[200px]" />
        <Skeleton className="h-8 w-[200px]" />
      </div>
      <div className="divide-y">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 px-4 py-2.5">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
}
