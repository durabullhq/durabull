import { createFileRoute, Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowRight, BellRing, Cable, Link2, Radar, ShieldAlert, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AlertEventsTable } from '@/components/alerts/alert-events-table'
import { AlertSeverityChip, AlertStatusBadge } from '@/components/alerts/alert-primitives'
import { useAppTopBar } from '@/components/app-top-bar'
import { useConnection } from '@/components/connection-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAlertSummary,
  useGlobalAlertEvents,
  useResolveAlertEvent,
  type AlertEventRecord,
  type AlertEventStatus,
} from '@/hooks/use-alerts'
import { cn, formatNumber } from '@/lib/utils'

const shellTransition = { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const }

export const Route = createFileRoute('/$orgSlug/alerts')({
  component: OrganizationAlertsPage,
})

function OrganizationAlertsPage() {
  const { orgSlug } = Route.useParams()
  const { connections, currentConnection } = useConnection()
  const [statusFilter, setStatusFilter] = useState<'all' | AlertEventStatus>('all')
  const [resolvingEventId, setResolvingEventId] = useState<string | null>(null)

  const summaryQuery = useAlertSummary({ refetchInterval: 15_000 })
  const eventsQuery = useGlobalAlertEvents({
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 100,
  })
  const resolveEventMutation = useResolveAlertEvent()

  const summaryByConnection = useMemo(() => {
    return new Map(
      (summaryQuery.data?.connections ?? []).map((entry) => [entry.connectionId, entry.count])
    )
  }, [summaryQuery.data?.connections])

  const totalOpenAlerts = useMemo(
    () => Array.from(summaryByConnection.values()).reduce((sum, count) => sum + count, 0),
    [summaryByConnection]
  )

  const affectedConnections = useMemo(
    () => Array.from(summaryByConnection.values()).filter((count) => count > 0).length,
    [summaryByConnection]
  )

  const events = eventsQuery.data?.events ?? []
  const connectionRows = useMemo(() => {
    return connections
      .map((connection) => ({
        connection,
        count: summaryByConnection.get(connection.id) ?? 0,
      }))
      .sort(
        (left, right) =>
          right.count - left.count || left.connection.name.localeCompare(right.connection.name)
      )
  }, [connections, summaryByConnection])

  const eventConnectionName = useMemo(() => {
    return new Map(connections.map((connection) => [connection.id, connection.name]))
  }, [connections])

  const resolvedEventCount = events.filter((event) => event.status === 'resolved').length
  const deliveredEventCount = events.filter((event) => event.notificationSentAt).length

  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <BellRing className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Alerts</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">
            Organization-wide incident command and response posture
          </span>
        </div>
      ),
      actions: currentConnection ? (
        <Button asChild size="xs" className="gap-2">
          <Link
            to="/$orgSlug/c/$connectionId/alerts"
            params={{ orgSlug, connectionId: currentConnection.id }}
          >
            Open connection workspace
          </Link>
        </Button>
      ) : undefined,
    }),
    [currentConnection, orgSlug]
  )

  useAppTopBar(topBarConfig)

  async function handleResolveEvent(event: AlertEventRecord) {
    try {
      setResolvingEventId(event.id)
      await resolveEventMutation.mutateAsync({
        connectionId: event.connectionId,
        eventId: event.id,
      })
    } catch (error) {
      toast.error('Failed to resolve incident', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      })
    } finally {
      setResolvingEventId(null)
    }
  }

  const hasConnections = connections.length > 0
  const hasAnyAlerts = totalOpenAlerts > 0 || events.length > 0

  return (
    <div className="space-y-6">
      <motion.section
        className="relative overflow-hidden rounded-[32px] border border-border/70 bg-card/85 shadow-[0_25px_90px_-55px_rgba(15,23,42,0.55)]"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shellTransition}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.16),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(251,191,36,0.14),transparent_28%),radial-gradient(circle_at_60%_70%,rgba(56,189,248,0.14),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.05),transparent_55%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.18),transparent_30%),radial-gradient(circle_at_80%_18%,rgba(251,191,36,0.18),transparent_28%),radial-gradient(circle_at_60%_70%,rgba(56,189,248,0.18),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.32),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-size-[36px_36px] opacity-40" />

        <div className="relative grid gap-6 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <AlertSeverityChip count={totalOpenAlerts} label="Open incidents across the org" />
              <Badge variant="outline" className="border-border/70 bg-background/70">
                {formatNumber(affectedConnections)} connections impacted
              </Badge>
            </div>

            <div className="space-y-3">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Alert command center for {orgSlug}
              </h2>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Watch connection-level incident load, route into the most affected Redis surfaces,
                and resolve queue alerts without losing the broader operational picture.
              </p>
            </div>

            {!hasConnections ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
                Add a Redis connection to unlock background alerting, incident history, and
                queue-level policies.
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="Open Incidents"
              value={totalOpenAlerts}
              tone={totalOpenAlerts > 0 ? 'critical' : 'good'}
              icon={ShieldAlert}
            />
            <MetricCard
              label="Affected Connections"
              value={affectedConnections}
              tone={affectedConnections > 0 ? 'warn' : 'good'}
              icon={Link2}
            />
            <MetricCard
              label="Resolved Events (page)"
              value={resolvedEventCount}
              tone="good"
              icon={Radar}
            />
            <MetricCard
              label="Notifications Sent"
              value={deliveredEventCount}
              tone="neutral"
              icon={Cable}
            />
          </div>
        </div>
      </motion.section>

      {summaryQuery.isError || eventsQuery.isError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <ShieldAlert className="h-8 w-8 text-destructive" />
            <h3 className="mt-4 text-lg font-semibold">Unable to load alert data</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Failed to fetch alert data. Please try refreshing the page.
            </p>
          </CardContent>
        </Card>
      ) : summaryQuery.isLoading ? (
        <ConnectionRowLoadingState />
      ) : connectionRows.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {connectionRows.slice(0, 6).map(({ connection, count }) => (
            <Card
              key={connection.id}
              className={cn(
                'overflow-hidden border-border/70 bg-card/80 shadow-sm',
                count > 0 && 'border-destructive/25 bg-destructive/4'
              )}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{connection.name}</CardTitle>
                    <CardDescription>{connection.environment}</CardDescription>
                  </div>
                  <AlertStatusBadge
                    status={count > 0 ? 'firing' : 'resolved'}
                    emphasize={count > 0}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Active incidents
                  </div>
                  <div className="mt-1 font-mono text-3xl font-semibold tabular-nums">
                    {formatNumber(count)}
                  </div>
                </div>
                <Button
                  asChild
                  className="w-full gap-2"
                  variant={count > 0 ? 'default' : 'outline'}
                >
                  <Link
                    to="/$orgSlug/c/$connectionId/alerts"
                    params={{ orgSlug, connectionId: connection.id }}
                  >
                    Open connection alerts
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!hasAnyAlerts && hasConnections ? (
        <Card className="border-border/70 bg-muted/15">
          <CardContent className="flex flex-col items-center justify-center py-14 text-center">
            <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-8 w-8" />
            </div>
            <h3 className="mt-5 text-xl font-semibold">The alert surface is calm</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              No open incidents have been recorded across your connections yet. As rules begin
              firing, this command center will rank affected connections and surface the full event
              stream here.
            </p>
            {currentConnection ? (
              <Button asChild className="mt-5 gap-2">
                <Link
                  to="/$orgSlug/c/$connectionId/alerts"
                  params={{ orgSlug, connectionId: currentConnection.id }}
                >
                  Configure alerts on {currentConnection.name}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Organization incident timeline</h3>
            <p className="text-sm text-muted-foreground">
              Every firing, resolved, and suppressed alert event across the active organization.
            </p>
          </div>
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | AlertEventStatus)}
            className="h-9 w-[180px]"
          >
            <option value="all">All statuses</option>
            <option value="firing">Firing</option>
            <option value="resolved">Resolved</option>
            <option value="suppressed">Suppressed</option>
          </Select>
        </div>

        {eventsQuery.isLoading ? (
          <EventsLoadingState />
        ) : (
          <AlertEventsTable
            orgSlug={orgSlug}
            events={events}
            emptyTitle="No organization-wide incidents yet"
            emptyCopy="Connection-level incidents will appear here automatically once alert rules start firing."
            showConnectionColumn
            connectionNameForEvent={(event) =>
              eventConnectionName.get(event.connectionId) ?? 'Unknown connection'
            }
            onResolve={(event) => handleResolveEvent(event)}
            resolvingEventId={resolvingEventId}
          />
        )}
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  tone: 'neutral' | 'good' | 'warn' | 'critical'
}) {
  const toneClasses: Record<typeof tone, string> = {
    neutral: 'bg-background/75 border-border/70',
    good: 'bg-emerald-500/[0.08] border-emerald-500/30',
    warn: 'bg-amber-500/[0.1] border-amber-500/35',
    critical: 'bg-destructive/10 border-destructive/30',
  }

  return (
    <Card className={cn('border shadow-sm backdrop-blur', toneClasses[tone])}>
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

function ConnectionRowLoadingState() {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index}>
          <CardHeader className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-20" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function EventsLoadingState() {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-14 rounded-xl" />
        ))}
      </CardContent>
    </Card>
  )
}
