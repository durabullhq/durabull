import { createFileRoute, useParams } from '@tanstack/react-router'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  Rocket,
  Search,
  Timer,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { QueueTable } from '@/components/queue-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useDiscoverQueues, useQueueDiscoveryStatus, useQueues } from '@/hooks/use-queues'
import { REDIS_CONNECTION_ERROR_MESSAGE } from '@/lib/api'
import { PAGINATION } from '@/lib/constants'
import { cn, formatNumber } from '@/lib/utils'

const AUTO_DISCOVERY_MIN_INTERVAL_MS = 5 * 60 * 1000

function isRedisConnectionFailure(message: string): boolean {
  const normalized = message.toLowerCase()
  return [
    'failed to connect to redis',
    'unable to connect to redis',
    'redis connection failed recently',
    'invalid username-password pair',
    'authentication failed',
    'wrongpass',
    'noauth',
    'allowlist',
    'econnrefused',
    'enotfound',
    'etimedout',
  ].some((indicator) => normalized.includes(indicator))
}

export const Route = createFileRoute('/$orgSlug/c/$connectionId/')({
  component: Dashboard,
})

function Dashboard() {
  const routeParams = useParams({ strict: false }) as { connectionId?: string }
  const connectionId = routeParams.connectionId ?? ''
  const [page, setPage] = useState(1)
  const { data, isLoading, error, isPlaceholderData } = useQueues({
    page,
    pageSize: PAGINATION.QUEUES_PAGE_SIZE,
  })
  const discoveryQuery = useQueueDiscoveryStatus()
  const discoverMutation = useDiscoverQueues()
  const hasAutoTriggeredDiscovery = useRef(false)
  const discoveryPendingCount = Math.max(
    discoveryQuery.data?.indexed.pending ?? 0,
    data?.discovery?.indexed.pending ?? 0
  )
  const backendDiscoveryRunning =
    (discoveryQuery.data?.running ?? false) || (data?.discovery?.running ?? false)
  const discoveryRunning =
    discoverMutation.isPending || backendDiscoveryRunning || discoveryPendingCount > 0
  const discoveryErrorMessage = discoveryQuery.data?.lastError ?? data?.discovery?.lastError ?? null
  const lastDiscoveryAt =
    discoveryQuery.data?.indexed.lastDiscoveredAt ??
    data?.discovery?.indexed.lastDiscoveredAt ??
    discoveryQuery.data?.completedAt ??
    data?.discovery?.completedAt ??
    null
  const hasRecentDiscovery =
    lastDiscoveryAt !== null && Date.now() - lastDiscoveryAt < AUTO_DISCOVERY_MIN_INTERVAL_MS
  const lastDiscoveryLabel = useMemo(() => {
    if (!lastDiscoveryAt) return 'Discovery not run yet'
    return `Last discovery: ${new Date(lastDiscoveryAt).toLocaleString()}`
  }, [lastDiscoveryAt])

  useEffect(() => {
    if (!connectionId) return
    hasAutoTriggeredDiscovery.current = false
    setPage(1)
  }, [connectionId])

  useEffect(() => {
    if (hasAutoTriggeredDiscovery.current) return
    if (isLoading) return
    if (!data) return
    if (discoveryRunning) return
    if (hasRecentDiscovery) return

    hasAutoTriggeredDiscovery.current = true
    discoverMutation.mutate()
  }, [data, discoverMutation, discoveryRunning, hasRecentDiscovery, isLoading])

  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Layers className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Queues</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">
            Monitor and manage your job queues
          </span>
        </div>
      ),
      actions: (
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground xl:inline">
            {lastDiscoveryLabel}
          </span>
          <Button
            type="button"
            size="xs"
            onClick={() => discoverMutation.mutate()}
            disabled={discoveryRunning}
            className="gap-2"
          >
            {discoveryRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Discover Queues
          </Button>
        </div>
      ),
    }),
    [discoverMutation, discoveryRunning, lastDiscoveryLabel]
  )

  useAppTopBar(topBarConfig)

  const shouldShowConnectionFailure =
    !error &&
    !isLoading &&
    (data?.total ?? 0) === 0 &&
    !discoveryRunning &&
    !!discoveryErrorMessage &&
    isRedisConnectionFailure(discoveryErrorMessage)

  if (error || shouldShowConnectionFailure) {
    const message = error?.message ?? REDIS_CONNECTION_ERROR_MESSAGE
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-4 mb-4">
          <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Failed to load queues</h2>
        <p className="text-muted-foreground text-center max-w-md">{message}</p>
      </div>
    )
  }

  const queues = data?.queues ?? []
  const totals = data?.totalJobCounts ?? {
    waiting: 0,
    active: 0,
    failed: 0,
    delayed: 0,
    completed: 0,
    prioritized: 0,
  }

  return (
    <TooltipProvider>
      <div className="space-y-8">
        {discoveryRunning && (
          <div className="flex items-center gap-2 rounded-lg border border-muted-foreground/20 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Discovering queues in Redis. Pending queues will appear dimmed until confirmed.
          </div>
        )}

        {!discoveryRunning && discoveryErrorMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            Discovery failed: {discoveryErrorMessage}
          </div>
        )}

        {/* Summary stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            title="Waiting"
            value={totals.waiting}
            icon={Clock}
            loading={isLoading}
            tooltip="Jobs waiting to be processed"
          />
          <StatCard
            title="Prioritized"
            value={totals.prioritized}
            icon={Rocket}
            loading={isLoading}
            variant="violet"
            tooltip="Prioritized jobs waiting ahead of the standard queue"
          />
          <StatCard
            title="Active"
            value={totals.active}
            icon={Activity}
            loading={isLoading}
            variant="blue"
            showPulse={totals.active > 0}
            tooltip="Jobs currently being processed"
          />
          <StatCard
            title="Delayed"
            value={totals.delayed}
            icon={Timer}
            loading={isLoading}
            variant="orange"
            tooltip="Jobs scheduled for later"
          />
          <StatCard
            title="Completed"
            value={totals.completed}
            icon={CheckCircle2}
            loading={isLoading}
            variant="green"
            tooltip="Successfully completed jobs"
          />
          <StatCard
            title="Failed"
            value={totals.failed}
            icon={AlertCircle}
            loading={isLoading}
            variant="red"
            tooltip="Jobs that failed to process"
          />
        </div>

        {/* Queues Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">Queues</h2>
              {data && (
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                  {data.total} total
                </span>
              )}
            </div>
            {totals.active > 0 && (
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                </span>
                {formatNumber(totals.active)} jobs processing
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="rounded-lg border bg-card">
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            </div>
          ) : (data?.total ?? 0) === 0 ? (
            <EmptyState />
          ) : (
            <QueueTable
              queues={queues}
              page={data?.page ?? 1}
              totalPages={data?.totalPages ?? 1}
              total={data?.total ?? 0}
              isPlaceholderData={isPlaceholderData}
              onPageChange={setPage}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

type StatVariant = 'default' | 'blue' | 'green' | 'orange' | 'red' | 'violet'

interface StatCardProps {
  title: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  loading?: boolean
  variant?: StatVariant
  showPulse?: boolean
  tooltip?: string
}

const variantStyles: Record<
  StatVariant,
  {
    icon: string
    value: string
    bg: string
    border: string
  }
> = {
  default: {
    icon: 'text-muted-foreground',
    value: 'text-foreground',
    bg: 'bg-muted/50',
    border: 'border-border',
  },
  blue: {
    icon: 'text-blue-500',
    value: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-500/5 dark:bg-blue-500/10',
    border: 'border-blue-200 dark:border-blue-900',
  },
  green: {
    icon: 'text-green-500',
    value: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-500/5 dark:bg-green-500/10',
    border: 'border-green-200 dark:border-green-900',
  },
  orange: {
    icon: 'text-orange-500',
    value: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/5 dark:bg-orange-500/10',
    border: 'border-orange-200 dark:border-orange-900',
  },
  red: {
    icon: 'text-red-500',
    value: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-500/5 dark:bg-red-500/10',
    border: 'border-red-200 dark:border-red-900',
  },
  violet: {
    icon: 'text-violet-500',
    value: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-500/5 dark:bg-violet-500/10',
    border: 'border-violet-200 dark:border-violet-900',
  },
}

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  variant = 'default',
  showPulse,
  tooltip,
}: StatCardProps) {
  const styles = variantStyles[variant]

  const cardContent = (
    <Card className={cn('transition-all hover:shadow-md', styles.bg, styles.border)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="relative">
          <Icon className={cn('h-4 w-4', styles.icon)} />
          {showPulse && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className={cn('text-2xl font-bold tabular-nums', styles.value)}>
            {formatNumber(value)}
          </div>
        )}
      </CardContent>
    </Card>
  )

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cardContent}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    )
  }

  return cardContent
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 py-16">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Zap className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1">No queues found</h3>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        No BullMQ queues were detected. Make sure your Redis connection is configured correctly and
        that you have created some queues.
      </p>
    </div>
  )
}
