import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  Background,
  Controls,
  type Edge,
  type FitViewOptions,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import '@xyflow/react/dist/style.css'
import { AlertCircle, Database, Loader2, Search, ServerOff } from 'lucide-react'
import { useAppTopBar } from '@/components/app-top-bar'
import { useConnection } from '@/components/connection-provider'
import { PageTitle } from '@/components/page-title'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Metric, MetricStrip } from '@/components/ui/metric'
import { Panel, PanelHeader } from '@/components/ui/section'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type ListWorkersResponse, useAllWorkers } from '@/hooks/use-queues'
import { cn, formatCompactNumber } from '@/lib/utils'
import {
  isWorkerActive as isActiveByIdleSeconds,
  WORKER_IDLE_AFTER_SECONDS,
} from '@/lib/worker-activity'

type Worker = ListWorkersResponse['workers'][number]
type WorkerQueue = ListWorkersResponse['queues'][number]
type WorkerView = 'graph' | 'list'
type WorkerStateFilter = 'all' | 'active' | 'idle'

export const Route = createFileRoute('/$orgSlug/c/$connectionId/workers')({
  component: WorkersPage,
})

/** `worker.idle` is in seconds; the threshold lives in `lib/worker-activity`. */
function isWorkerActive(worker: Worker) {
  return isActiveByIdleSeconds(worker.idle)
}

/** Redis reports client age and idle time in whole seconds. */
function formatSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

function workerLabel(worker: Worker) {
  return worker.name || worker.id.slice(0, 12)
}

/* ------------------------------------------------------------------ */
/* Topology nodes: hairline chips, mono names, state as dot + label     */
/* ------------------------------------------------------------------ */

const CHIP = 'rounded-md border bg-card px-3 py-1.5 text-left transition-colors'

function StateDot({ className, pulse = false }: { className: string; pulse?: boolean }) {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      {pulse ? (
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-70',
            className
          )}
        />
      ) : null}
      <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', className)} />
    </span>
  )
}

function RedisNode({ data }: NodeProps) {
  return (
    <div className={cn(CHIP, 'w-[208px] border-border-strong')}>
      <Handle type="source" position={Position.Right} isConnectable={false} />
      <div className="flex items-center gap-2">
        <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-xs font-semibold">{data.label as string}</span>
      </div>
      <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
        {data.totalQueues as number} queues · {data.totalWorkers as number} workers
      </div>
    </div>
  )
}

function QueueNode({ data }: NodeProps) {
  const paused = (data.status as string) === 'paused'
  const active = data.activeJobs as number
  const waiting = data.waitingJobs as number
  const workerCount = data.workerCount as number

  return (
    <div
      className={cn(CHIP, 'w-[236px] cursor-pointer hover:border-border-strong')}
      title={`Open queue ${data.label as string}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
      <div className="truncate font-mono text-xs font-medium">{data.label as string}</div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex shrink-0 items-center gap-1.5">
          <StateDot className={paused ? 'bg-status-warning' : 'bg-status-success'} />
          {paused ? 'Paused' : `${workerCount} ${workerCount === 1 ? 'worker' : 'workers'}`}
        </span>
        <span className="truncate font-mono">
          {waiting > 0 ? `${formatCompactNumber(waiting)} waiting · ` : ''}
          {formatCompactNumber(active)} active
        </span>
      </div>
    </div>
  )
}

/** Queues nobody consumes: one line, dashed, so the gap is visible without the weight. */
function UnattendedQueueNode({ data }: NodeProps) {
  const paused = (data.status as string) === 'paused'
  const waiting = data.waitingJobs as number

  return (
    <div
      className="flex h-7 w-[236px] cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-strong bg-card px-3 transition-colors hover:border-faint"
      title={`Open queue ${data.label as string}`}
    >
      <StateDot className={paused ? 'bg-status-warning' : 'bg-status-neutral'} />
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
        {data.label as string}
      </span>
      {paused ? <span className="text-[11px] text-status-warning">Paused</span> : null}
      {waiting > 0 ? (
        <span className="shrink-0 font-mono text-[11px] text-status-warning">
          {formatCompactNumber(waiting)} waiting
        </span>
      ) : null}
    </div>
  )
}

function GroupLabelNode({ data }: NodeProps) {
  return <div className="eyebrow whitespace-nowrap">{data.label as string}</div>
}

function WorkerNode({ data }: NodeProps) {
  const worker = data.worker as Worker
  const active = isWorkerActive(worker)

  return (
    <div
      className={cn(CHIP, 'w-[236px]', data.dimmed ? 'opacity-35' : null)}
      title={`${workerLabel(worker)} · ${worker.addr}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs font-medium">{workerLabel(worker)}</span>
        <span className="shrink-0 font-mono text-[11px] text-faint">#{worker.id}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <StateDot
            className={active ? 'bg-status-active' : 'bg-status-neutral'}
            pulse={active && !data.dimmed}
          />
          {active ? 'Active' : 'Idle'}
        </span>
        <span className="truncate font-mono">
          {active ? `up ${formatSeconds(worker.age)}` : `idle ${formatSeconds(worker.idle)}`}
        </span>
      </div>
    </div>
  )
}

const nodeTypes = {
  redis: RedisNode,
  queue: QueueNode,
  unattended: UnattendedQueueNode,
  groupLabel: GroupLabelNode,
  worker: WorkerNode,
}

/* Layout: Redis → attended queues → their workers, one row per worker.
   Queues without workers sit in a compact grid underneath. */
const ROW = 56
const QUEUE_X = 288
const WORKER_X = 604
const GRID_COLUMNS = [0, 252, 504, 756]
const GRID_ROW = 34

/** Button cells centre their content; pin it to the top so values align with plain cells. */
const METRIC_BUTTON = 'flex flex-col justify-start'

/** Leaves a gutter on the left so the zoom controls never sit on top of a chip. */
const FIT_VIEW: FitViewOptions = {
  padding: { top: '20px', right: '20px', bottom: '20px', left: '60px' },
  maxZoom: 1,
}

const EDGE_IDLE = 'var(--color-border-strong)'
const EDGE_ACTIVE = 'var(--color-status-active)'

function buildTopology(
  data: ListWorkersResponse,
  connectionName: string,
  stateFilter: WorkerStateFilter
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const workersByQueue = new Map<string, Worker[]>()
  for (const worker of data.workers) {
    const list = workersByQueue.get(worker.queueName) ?? []
    list.push(worker)
    workersByQueue.set(worker.queueName, list)
  }

  // Sort by name and id so positions stay put between refreshes.
  const sortedQueues = [...data.queues].sort((a, b) => a.name.localeCompare(b.name))
  const attended = sortedQueues.filter((queue) => (workersByQueue.get(queue.name)?.length ?? 0) > 0)
  const unattended = sortedQueues.filter(
    (queue) => (workersByQueue.get(queue.name)?.length ?? 0) === 0
  )

  const queueData = (queue: WorkerQueue) => ({
    label: queue.name,
    status: queue.status,
    workerCount: workersByQueue.get(queue.name)?.length ?? 0,
    activeJobs: queue.jobCounts.active,
    waitingJobs: queue.jobCounts.waiting,
  })

  let row = 0
  for (const queue of attended) {
    const queueId = `queue-${queue.name}`
    const queueWorkers = [...(workersByQueue.get(queue.name) ?? [])].sort((a, b) =>
      a.id.localeCompare(b.id)
    )
    const blockTop = row * ROW

    nodes.push({
      id: queueId,
      type: 'queue',
      position: { x: QUEUE_X, y: blockTop + ((queueWorkers.length - 1) * ROW) / 2 },
      data: queueData(queue),
    })

    const queueBusy = queue.status === 'active' && queue.jobCounts.active > 0
    edges.push({
      id: `redis-${queueId}`,
      source: 'redis',
      target: queueId,
      type: 'smoothstep',
      animated: queueBusy,
      style: { stroke: queueBusy ? EDGE_ACTIVE : EDGE_IDLE },
    })

    queueWorkers.forEach((worker, index) => {
      const workerId = `worker-${worker.id}`
      const active = isWorkerActive(worker)
      const dimmed = stateFilter !== 'all' && (stateFilter === 'active') !== active

      nodes.push({
        id: workerId,
        type: 'worker',
        position: { x: WORKER_X, y: blockTop + index * ROW },
        data: { label: workerLabel(worker), worker, dimmed },
      })
      edges.push({
        id: `${queueId}-${workerId}`,
        source: queueId,
        target: workerId,
        type: 'smoothstep',
        animated: active && !dimmed,
        style: { stroke: active ? EDGE_ACTIVE : EDGE_IDLE, opacity: dimmed ? 0.35 : 1 },
      })
    })

    row += queueWorkers.length
  }

  const attendedHeight = Math.max(row, 1) * ROW
  nodes.unshift({
    id: 'redis',
    type: 'redis',
    position: { x: 0, y: (attendedHeight - ROW) / 2 },
    data: {
      label: connectionName,
      totalQueues: data.totalQueues,
      totalWorkers: data.totalWorkers,
    },
  })

  if (unattended.length > 0) {
    const gridTop = attendedHeight + 28
    nodes.push({
      id: 'unattended-label',
      type: 'groupLabel',
      position: { x: 0, y: gridTop },
      data: { label: `No workers · ${unattended.length}` },
      draggable: false,
      selectable: false,
    })
    unattended.forEach((queue, index) => {
      nodes.push({
        id: `queue-${queue.name}`,
        type: 'unattended',
        position: {
          x: GRID_COLUMNS[index % GRID_COLUMNS.length],
          y: gridTop + 24 + Math.floor(index / GRID_COLUMNS.length) * GRID_ROW,
        },
        data: queueData(queue),
      })
    })
  }

  return { nodes, edges }
}

function LegendItem({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  )
}

function WorkersPage() {
  const { orgSlug, connectionId } = Route.useParams()
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useAllWorkers()
  const { currentConnection } = useConnection()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  // A phone cannot show the topology at a legible zoom, so it starts on the list.
  const [view, setView] = useState<WorkerView>(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches
      ? 'list'
      : 'graph'
  )
  const [stateFilter, setStateFilter] = useState<WorkerStateFilter>('all')
  const [search, setSearch] = useState('')

  const topBarConfig = useMemo(() => ({ left: <PageTitle title="Workers" /> }), [])
  useAppTopBar(topBarConfig)

  const connectionName = currentConnection?.name ?? 'Redis'

  useEffect(() => {
    if (!data) return
    const topology = buildTopology(data, connectionName, stateFilter)
    setNodes(topology.nodes)
    setEdges(topology.edges)
  }, [data, connectionName, stateFilter, setNodes, setEdges])

  const stats = useMemo(() => {
    if (!data) return null
    const active = data.workers.filter(isWorkerActive).length
    const attendedQueues = new Set(data.workers.map((worker) => worker.queueName))
    return {
      total: data.totalWorkers,
      active,
      idle: data.workers.length - active,
      queues: data.totalQueues,
      unattended: data.queues.filter((queue) => !attendedQueues.has(queue.name)).length,
    }
  }, [data])

  const listedWorkers = useMemo(() => {
    if (!data) return []
    const term = search.trim().toLowerCase()
    return data.workers
      .filter((worker) => {
        if (stateFilter !== 'all' && (stateFilter === 'active') !== isWorkerActive(worker)) {
          return false
        }
        if (!term) return true
        return [worker.name, worker.id, worker.queueName, worker.addr].some((value) =>
          value.toLowerCase().includes(term)
        )
      })
      .sort((a, b) => a.queueName.localeCompare(b.queueName) || a.id.localeCompare(b.id))
  }, [data, search, stateFilter])

  const toggleStateFilter = useCallback((next: WorkerStateFilter) => {
    setStateFilter((current) => (current === next ? 'all' : next))
  }, [])

  const openQueue = useCallback(
    (queueName: string) => {
      navigate({
        to: '/$orgSlug/c/$connectionId/queues/$queueName',
        params: { orgSlug, connectionId, queueName },
        search: {},
      })
    },
    [connectionId, navigate, orgSlug]
  )

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        tone="danger"
        title="Failed to load workers"
        description={error.message}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        }
      />
    )
  }

  const hasWorkers = (data?.totalWorkers ?? 0) > 0
  const filtersActive = stateFilter !== 'all' || search.trim().length > 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <MetricStrip className="shrink-0 sm:grid-cols-4">
        <Metric
          label="Workers"
          value={stats?.total ?? 0}
          loading={isLoading}
          onClick={stateFilter === 'all' ? undefined : () => setStateFilter('all')}
          title={stateFilter === 'all' ? undefined : 'Show all workers'}
          className={METRIC_BUTTON}
        />
        <Metric
          label="Active"
          value={stats?.active ?? 0}
          tone={(stats?.active ?? 0) > 0 ? 'active' : 'neutral'}
          pulse={(stats?.active ?? 0) > 0}
          loading={isLoading}
          onClick={() => toggleStateFilter('active')}
          active={stateFilter === 'active'}
          hint={`command sent in the last ${WORKER_IDLE_AFTER_SECONDS}s`}
          title="Highlight active workers"
          className={METRIC_BUTTON}
        />
        <Metric
          label="Idle"
          value={stats?.idle ?? 0}
          tone="neutral"
          loading={isLoading}
          onClick={() => toggleStateFilter('idle')}
          active={stateFilter === 'idle'}
          hint={`connection quiet for over ${WORKER_IDLE_AFTER_SECONDS}s`}
          title="Highlight idle workers"
          className={METRIC_BUTTON}
        />
        <Metric
          label="Queues"
          value={stats?.queues ?? 0}
          hint={stats && stats.unattended > 0 ? `${stats.unattended} without a worker` : undefined}
          loading={isLoading}
        />
      </MetricStrip>

      <Panel className="flex min-h-[420px] flex-1 flex-col">
        <PanelHeader className="shrink-0">
          <div className="flex items-center gap-3">
            <Tabs value={view} onValueChange={(next) => setView(next as WorkerView)}>
              <TabsList role="group" aria-label="Worker view">
                <TabsTrigger value="graph" aria-pressed={view === 'graph'}>
                  Graph
                </TabsTrigger>
                <TabsTrigger value="list" aria-pressed={view === 'list'}>
                  List
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {data?.hasMore ? (
              <span className="text-xs text-muted-foreground">
                First {data.queues.length} of {data.totalQueues} queues
              </span>
            ) : null}
          </div>

          {!hasWorkers ? null : view === 'graph' ? (
            <div className="hidden items-center gap-4 text-xs text-muted-foreground md:flex">
              <LegendItem swatch={<StateDot className="bg-status-active" />}>Active</LegendItem>
              <LegendItem swatch={<StateDot className="bg-status-neutral" />}>Idle</LegendItem>
              <LegendItem swatch={<StateDot className="bg-status-warning" />}>Paused</LegendItem>
              <LegendItem swatch={<span className="h-px w-4 bg-status-active" />}>
                Jobs in flight
              </LegendItem>
            </div>
          ) : (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by worker, queue, or address"
                aria-label="Filter workers"
                className="pl-8"
              />
            </div>
          )}
        </PanelHeader>

        <div className="min-h-0 flex-1">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading worker topology…
            </div>
          ) : !hasWorkers ? (
            <EmptyState
              icon={ServerOff}
              title="No workers connected"
              description={
                <>
                  Workers appear here when a BullMQ <code className="font-mono">Worker</code>{' '}
                  connects to this Redis.{' '}
                  {stats && stats.queues > 0
                    ? `${stats.queues} ${stats.queues === 1 ? 'queue is' : 'queues are'} waiting for one.`
                    : null}
                </>
              }
              className="h-full rounded-none border-0"
            >
              <pre className="mt-4 max-w-full overflow-x-auto rounded-md border bg-card px-3 py-2 text-left font-mono text-xs leading-5 text-muted-foreground">
                {"new Worker('my-queue', async (job) => {\n  // process job\n}, { connection })"}
              </pre>
            </EmptyState>
          ) : view === 'graph' ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => {
                if (node.type === 'queue' || node.type === 'unattended') {
                  openQueue(node.data.label as string)
                }
              }}
              nodeTypes={nodeTypes}
              nodesConnectable={false}
              fitView
              fitViewOptions={FIT_VIEW}
              minZoom={0.3}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              className="bg-background"
            >
              <Background gap={24} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          ) : listedWorkers.length === 0 ? (
            <EmptyState
              size="inline"
              icon={Search}
              title="No workers match"
              description="No connected worker matches the current filter."
              className="h-full"
              actions={
                filtersActive ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('')
                      setStateFilter('all')
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="h-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Worker</TableHead>
                    <TableHead>Queue</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">Age</TableHead>
                    <TableHead className="text-right">Idle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listedWorkers.map((worker) => {
                    const active = isWorkerActive(worker)
                    return (
                      <TableRow key={`${worker.queueName}-${worker.id}`}>
                        <TableCell className="whitespace-nowrap">
                          <span className="font-mono font-medium">{workerLabel(worker)}</span>
                          <span className="ml-2 font-mono text-xs text-faint">#{worker.id}</span>
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/$orgSlug/c/$connectionId/queues/$queueName"
                            params={{ orgSlug, connectionId, queueName: worker.queueName }}
                            search={{}}
                            className="whitespace-nowrap rounded-sm font-mono text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          >
                            {worker.queueName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2 whitespace-nowrap text-xs">
                            <StateDot
                              className={active ? 'bg-status-active' : 'bg-status-neutral'}
                              pulse={active}
                            />
                            <span className={active ? 'text-foreground' : 'text-muted-foreground'}>
                              {active ? 'Active' : 'Idle'}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {worker.addr || '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-muted-foreground">
                          {formatSeconds(worker.age)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-muted-foreground">
                          {formatSeconds(worker.idle)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
