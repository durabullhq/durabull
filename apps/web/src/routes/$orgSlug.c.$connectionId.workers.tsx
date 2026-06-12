import { createFileRoute } from '@tanstack/react-router'
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo } from 'react'
import '@xyflow/react/dist/style.css'

// Worker type - matches API response
interface WorkerWithQueue {
  id: string
  name: string
  addr: string
  age: number
  idle: number
  queueName: string
}

import {
  Activity,
  AlertCircle,
  Clock,
  Cpu,
  Database,
  Layers,
  Network,
  Server,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useAppTopBar } from '@/components/app-top-bar'
import { useConnection } from '@/components/connection-provider'
import { QueueNameTag } from '@/components/queue-name-tag'
import { StatusIndicator } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { type ListWorkersResponse, useAllWorkers } from '@/hooks/use-queues'
import { cn, formatDuration } from '@/lib/utils'

export const Route = createFileRoute('/$orgSlug/c/$connectionId/workers')({
  component: WorkersPage,
})

// Custom Redis Node
function RedisNode({ data }: NodeProps) {
  return (
    <div className="relative">
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-status-danger !w-3 !h-3 !border-2 !border-status-danger"
      />
      <div
        className={cn(
          'relative px-6 py-4 rounded-2xl border-2 shadow-2xl min-w-[200px]',
          'bg-gradient-to-br from-status-danger to-status-danger border-status-danger/30',
          'animate-pulse-soft'
        )}
      >
        {/* Glow effect */}
        <div className="absolute inset-0 rounded-2xl bg-status-danger/20 blur-xl -z-10" />

        <div className="flex items-center gap-3 text-white">
          <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
            <Database className="h-8 w-8" />
          </div>
          <div>
            <div className="font-bold text-lg">Redis</div>
            <div className="text-white/80 text-sm font-mono">{data.label as string}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-white/80">
          <div className="flex items-center gap-1.5">
            <Wifi className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Connected</span>
          </div>
          <span className="text-white/60">•</span>
          <span className="text-xs">{data.totalQueues as number} queues</span>
        </div>
      </div>
    </div>
  )
}

// Custom Queue Node
function QueueNode({ data }: NodeProps) {
  const isActive = (data.status as string) === 'active'
  const workerCount = data.workerCount as number
  const hasWorkers = workerCount > 0
  const queueName = data.label as string

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-status-active !w-3 !h-3 !border-2 !border-status-active"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-status-success !w-3 !h-3 !border-2 !border-status-success"
      />
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'relative px-5 py-4 rounded-xl border-2 shadow-xl w-[260px] transition-all duration-300 cursor-default',
                isActive
                  ? 'bg-gradient-to-br from-status-active/10 to-status-active/5 border-status-active/50 dark:from-status-active/20 dark:to-status-active/10'
                  : 'bg-gradient-to-br from-status-warning/10 to-status-warning/5 border-status-warning/50 dark:from-status-warning/20 dark:to-status-warning/10',
                hasWorkers && 'ring-2 ring-status-success/30 ring-offset-2 ring-offset-background'
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'p-2 rounded-lg shrink-0',
                    isActive
                      ? 'bg-status-active/20 text-status-active'
                      : 'bg-status-warning/20 text-status-warning'
                  )}
                >
                  <Layers className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <QueueNameTag name={queueName} size="sm" />
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge
                      variant={isActive ? 'default' : 'warning'}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {isActive ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3 w-3" />
                  <span>{workerCount} workers</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Activity className="h-3 w-3" />
                  <span>{data.activeJobs as number} active</span>
                </div>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="font-mono text-sm">
            {queueName}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

// Custom Worker Node
function WorkerNode({ data }: NodeProps) {
  const worker = data.worker as WorkerWithQueue
  const isIdle = worker.idle > 5000 // Consider idle if > 5 seconds

  return (
    <div className="relative group">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-status-success !w-2.5 !h-2.5 !border-2 !border-status-success"
      />
      <div
        className={cn(
          'relative px-4 py-3 rounded-lg border shadow-lg min-w-[220px] transition-all duration-300',
          'bg-gradient-to-br from-card to-card/80 hover:shadow-xl',
          isIdle
            ? 'border-muted-foreground/30'
            : 'border-status-success/50 ring-1 ring-status-success/20'
        )}
      >
        {/* Activity indicator */}
        {!isIdle && (
          <div className="absolute -top-1 -right-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-status-success" />
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div
            className={cn(
              'p-2 rounded-lg transition-colors',
              isIdle ? 'bg-muted text-muted-foreground' : 'bg-status-success/10 text-status-success'
            )}
          >
            <Server className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-foreground truncate font-mono">
              {worker.name || worker.id.slice(0, 12)}
            </div>
            <div className="text-xs text-muted-foreground font-mono truncate">{worker.addr}</div>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Age: {formatDuration(worker.age * 1000)}</span>
          </div>
          <div
            className={cn(
              'flex items-center gap-1',
              isIdle ? 'text-status-warning' : 'text-status-success'
            )}
          >
            <Cpu className="h-3 w-3" />
            <span>{isIdle ? 'Idle' : 'Active'}</span>
          </div>
        </div>

        {/* Idle time */}
        {isIdle && (
          <div className="mt-1 text-[10px] text-muted-foreground text-right">
            Idle for {formatDuration(worker.idle)}
          </div>
        )}
      </div>
    </div>
  )
}

const nodeTypes = {
  redis: RedisNode,
  queue: QueueNode,
  worker: WorkerNode,
}

function WorkersPage() {
  const { data, isLoading, error } = useAllWorkers()
  const { currentConnection } = useConnection()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Network className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Workers</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">
            Visualize connected workers and queue assignments
          </span>
        </div>
      ),
    }),
    []
  )

  useAppTopBar(topBarConfig)

  // Build the flow graph - use useMemo for stable positions
  const buildGraph = useCallback(() => {
    if (!data) return

    const newNodes: Node[] = []
    const newEdges: Edge[] = []

    // Redis node (center)
    const redisNode: Node = {
      id: 'redis',
      type: 'redis',
      position: { x: 0, y: 300 },
      data: {
        label: currentConnection?.name ?? 'Redis',
        totalQueues: data.totalQueues,
        totalWorkers: data.totalWorkers,
      },
    }
    newNodes.push(redisNode)

    // Sort queues alphabetically to ensure stable ordering
    const sortedQueues = [...data.queues].sort((a, b) => a.name.localeCompare(b.name))

    // Calculate layout
    const queueCount = sortedQueues.length
    const queueSpacing = 200
    const queueStartY = 300 - ((queueCount - 1) * queueSpacing) / 2

    // Queue nodes and their workers
    sortedQueues.forEach((queue, queueIndex) => {
      const queueId = `queue-${queue.name}`
      const queueY = queueStartY + queueIndex * queueSpacing

      // Queue node
      const queueNode: Node = {
        id: queueId,
        type: 'queue',
        position: { x: 350, y: queueY },
        data: {
          label: queue.name,
          status: queue.status,
          workerCount: queue.workerCount,
          activeJobs: queue.jobCounts.active,
          waitingJobs: queue.jobCounts.waiting,
        },
      }
      newNodes.push(queueNode)

      // Edge from Redis to Queue
      newEdges.push({
        id: `redis-${queueId}`,
        source: 'redis',
        target: queueId,
        type: 'smoothstep',
        animated: queue.status === 'active',
        style: {
          stroke: queue.status === 'active' ? '#3b82f6' : '#f59e0b',
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: queue.status === 'active' ? '#3b82f6' : '#f59e0b',
        },
      })

      // Worker nodes for this queue - sort by ID for stable ordering
      type Worker = ListWorkersResponse['workers'][number]
      const queueWorkers = data.workers
        .filter((w: Worker) => w.queueName === queue.name)
        .sort((a: Worker, b: Worker) => a.id.localeCompare(b.id))
      const workerSpacing = 100
      const workerStartY = queueY - ((queueWorkers.length - 1) * workerSpacing) / 2

      queueWorkers.forEach((worker: Worker, workerIndex: number) => {
        const workerId = `worker-${worker.id}`
        const workerY = workerStartY + workerIndex * workerSpacing

        const workerNode: Node = {
          id: workerId,
          type: 'worker',
          position: { x: 720, y: workerY },
          data: {
            label: worker.name || worker.id,
            worker,
          },
        }
        newNodes.push(workerNode)

        // Edge from Queue to Worker
        const isActive = worker.idle <= 5000
        newEdges.push({
          id: `${queueId}-${workerId}`,
          source: queueId,
          target: workerId,
          type: 'smoothstep',
          animated: isActive,
          style: {
            stroke: isActive ? '#22c55e' : '#71717a',
            strokeWidth: isActive ? 2 : 1,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isActive ? '#22c55e' : '#71717a',
          },
        })
      })
    })

    setNodes(newNodes)
    setEdges(newEdges)
  }, [data, currentConnection, setNodes, setEdges])

  useEffect(() => {
    buildGraph()
  }, [buildGraph])

  // Stats
  const stats = useMemo(() => {
    if (!data) return null
    type Worker = ListWorkersResponse['workers'][number]
    const activeWorkers = data.workers.filter((w: Worker) => w.idle <= 5000).length
    const idleWorkers = data.workers.length - activeWorkers
    return {
      total: data.totalWorkers,
      active: activeWorkers,
      idle: idleWorkers,
      queues: data.totalQueues,
    }
  }, [data])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-status-danger/10 p-4 mb-4">
          <AlertCircle className="h-8 w-8 text-status-danger" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Failed to load workers</h2>
        <p className="text-muted-foreground text-center max-w-md">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Total Workers"
          value={stats?.total ?? 0}
          icon={Server}
          loading={isLoading}
        />
        <StatCard
          title="Active"
          value={stats?.active ?? 0}
          icon={Activity}
          loading={isLoading}
          variant="green"
          showPulse={(stats?.active ?? 0) > 0}
        />
        <StatCard
          title="Idle"
          value={stats?.idle ?? 0}
          icon={Clock}
          loading={isLoading}
          variant="orange"
        />
        <StatCard
          title="Queues"
          value={stats?.queues ?? 0}
          icon={Layers}
          loading={isLoading}
          variant="blue"
        />
      </div>

      {/* React Flow Visualization */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Network className="h-4 w-4 text-muted-foreground" />
              Worker Topology
            </CardTitle>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-status-danger" />
                Redis
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-status-active" />
                Queue
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-status-success" />
                Worker
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-gradient-to-r from-status-success to-status-success animate-pulse" />
                Active
              </div>
            </div>
          </div>
        </CardHeader>
        <div className="h-[600px] w-full bg-gradient-to-br from-background via-background to-muted/20">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-muted rounded-full" />
                  <div className="absolute inset-0 w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-muted-foreground">Loading worker topology...</p>
              </div>
            </div>
          ) : data?.totalWorkers === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="rounded-full bg-muted p-6 mb-4">
                <WifiOff className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No Workers Connected</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                No workers are currently connected to any queue. Start some workers to see them
                appear here.
              </p>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.3}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              className="bg-transparent"
            >
              <Background
                gap={20}
                size={1}
                color="currentColor"
                className="text-muted-foreground/10"
              />
              <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground hover:[&>button]:!bg-accent" />
              <MiniMap
                className="!bg-card !border-border"
                nodeColor={(node) => {
                  if (node.type === 'redis') return '#ef4444'
                  if (node.type === 'queue') return '#3b82f6'
                  return '#22c55e'
                }}
                maskColor="rgba(0, 0, 0, 0.2)"
              />
            </ReactFlow>
          )}
        </div>
      </Card>

      {/* Worker Details Table */}
      {data && data.workers.length > 0 && (
        <Card>
          <CardHeader className="border-b bg-muted/30 py-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              Worker Details
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Status</TableHead>
                <TableHead>Worker ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Queue</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Idle Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.workers.map((worker: ListWorkersResponse['workers'][number]) => {
                const isActive = worker.idle <= 5000
                return (
                  <TableRow key={worker.id}>
                    <TableCell>
                      <StatusIndicator status={isActive ? 'active' : 'idle'} />
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                        {worker.id}
                      </code>
                    </TableCell>
                    <TableCell className="text-sm">
                      {worker.name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <QueueNameTag name={worker.queueName} asLink size="sm" />
                    </TableCell>
                    <TableCell>
                      <code className="text-xs text-muted-foreground font-mono">{worker.addr}</code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDuration(worker.age * 1000)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDuration(worker.idle)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

// Stats Card Component
type StatVariant = 'default' | 'blue' | 'green' | 'orange' | 'red'

interface StatCardProps {
  title: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  loading?: boolean
  variant?: StatVariant
  showPulse?: boolean
}

const variantStyles: Record<
  StatVariant,
  {
    icon: string
    accent: string
  }
> = {
  default: {
    icon: 'text-muted-foreground',
    accent: 'bg-status-neutral/40',
  },
  blue: {
    icon: 'text-status-active',
    accent: 'bg-status-active',
  },
  green: {
    icon: 'text-status-success',
    accent: 'bg-status-success',
  },
  orange: {
    icon: 'text-status-delayed',
    accent: 'bg-status-delayed',
  },
  red: {
    icon: 'text-status-danger',
    accent: 'bg-status-danger',
  },
}

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  variant = 'default',
  showPulse,
}: StatCardProps) {
  const styles = variantStyles[variant]

  return (
    <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
      <span className={cn('absolute inset-x-0 top-0 h-0.5', styles.accent)} aria-hidden="true" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="eyebrow">{title}</CardTitle>
        <div className="relative">
          <Icon className={cn('h-4 w-4', styles.icon)} />
          {showPulse && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-status-success" />
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        )}
      </CardContent>
    </Card>
  )
}
