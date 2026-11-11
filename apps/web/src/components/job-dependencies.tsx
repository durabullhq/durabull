import { Link } from '@tanstack/react-router'
import { GitBranch, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, PanelHeader } from '@/components/ui/section'
import { segmentedItemClass } from '@/components/ui/segmented'
import {
  type JobDependenciesResponse,
  type JobDependencyKind,
  useJobDependencies,
} from '@/hooks/use-queues'
import { JOB_STATUS_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'

const dependencyKinds = [
  { value: 'unprocessed', label: 'Pending' },
  { value: 'processed', label: 'Processed' },
  { value: 'failed', label: 'Failed' },
  { value: 'ignored', label: 'Ignored failures' },
] as const

const STATUS_BADGE: Record<string, BadgeProps['variant']> = {
  failed: 'destructive',
  completed: 'success',
  active: 'info',
  delayed: 'warning',
  paused: 'warning',
  'waiting-children': 'warning',
  prioritized: 'priority',
}

interface JobDependenciesProps {
  orgSlug: string
  connectionId: string
  queueName: string
  jobId: string
}

interface DependencySelection {
  kind: JobDependencyKind
  cursors: string[]
}

export function JobDependencies(props: JobDependenciesProps) {
  const [selection, setSelection] = useState<DependencySelection>({
    kind: 'unprocessed',
    cursors: ['0'],
  })
  const { kind, cursors } = selection
  const query = useJobDependencies(props.queueName, props.jobId, kind, cursors.at(-1) ?? '0')
  const data = query.data
  const total = data ? Object.values(data.counts).reduce((sum, count) => sum + count, 0) : 0

  return (
    <Panel>
      <PanelHeader>
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="text-sm font-semibold tracking-tight">Dependencies</h2>
          {data ? (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {total.toLocaleString()} {total === 1 ? 'child' : 'children'}
            </span>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="xs"
          disabled={query.isFetching}
          onClick={() => query.refetch()}
          aria-label="Refresh dependencies"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', query.isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </PanelHeader>

      {query.isLoading && (
        <output className="block px-4 py-8 text-center text-[13px] text-muted-foreground">
          Loading dependencies…
        </output>
      )}
      {query.error && (
        <p role="alert" className="px-4 py-3 text-[13px] text-status-danger">
          Unable to load dependencies: {query.error.message}
        </p>
      )}
      {data && (
        <>
          {data.parent && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2.5">
              <h3 className="eyebrow w-16 shrink-0">Parent job</h3>
              <div className="min-w-0 flex-1">
                <DependencyReference reference={data.parent} {...props} />
              </div>
            </div>
          )}
          {data.status === 'waiting-children' && data.counts.unprocessed > 0 && (
            <p className="border-b border-status-warning/30 bg-status-warning/10 px-4 py-2.5 text-[13px] leading-5">
              This job is waiting for {data.counts.unprocessed.toLocaleString()} pending child jobs.
              Inspect the pending children to find unfinished or failed work.
            </p>
          )}
          {total === 0 ? (
            <EmptyState
              size="inline"
              icon={GitBranch}
              title={data.parent ? 'No child jobs' : 'No dependencies'}
              description={
                data.parent
                  ? 'This job has no child dependencies.'
                  : 'This job has no parent or child dependencies.'
              }
            />
          ) : (
            <ChildDependencies
              {...props}
              data={data}
              selection={selection}
              setSelection={setSelection}
              isFetching={query.isFetching}
            />
          )}
        </>
      )}
    </Panel>
  )
}

function ChildDependencies({
  data,
  selection,
  setSelection,
  isFetching,
  ...props
}: JobDependenciesProps & {
  data: JobDependenciesResponse
  selection: DependencySelection
  setSelection: (selection: DependencySelection) => void
  isFetching: boolean
}) {
  const { kind, cursors } = selection
  return (
    <>
      <div className="border-b px-4 py-2">
        <fieldset
          className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-md border bg-muted p-0.5"
          aria-label="Dependency filters"
        >
          {dependencyKinds.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={kind === item.value}
              onClick={() => setSelection({ kind: item.value, cursors: ['0'] })}
              className={segmentedItemClass(kind === item.value, 'h-6 px-2 text-xs tabular-nums')}
            >
              {item.label} ({data.counts[item.value].toLocaleString()})
            </button>
          ))}
        </fieldset>
        {kind === 'ignored' && (
          <p className="mt-2 text-xs text-muted-foreground">
            These child failures were ignored by the parent’s failure policy.
          </p>
        )}
      </div>
      <ul className="divide-y" aria-label="Child jobs">
        {data.children.map((child) => (
          <li key={child.key} className="px-4 py-2">
            <DependencyReference reference={child} {...props} />
          </li>
        ))}
        {data.children.length === 0 && (
          <li className="px-4 py-6 text-center text-[13px] text-muted-foreground">
            {data.nextCursor
              ? 'No children in this scan. Continue to the next page.'
              : 'No children in this category on this page.'}
          </li>
        )}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-2">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          Page {cursors.length} · {data.children.length} children shown
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="xs"
            disabled={cursors.length === 1 || isFetching}
            onClick={() => setSelection({ kind, cursors: cursors.slice(0, -1) })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={!data.nextCursor || isFetching}
            onClick={() => {
              if (data.nextCursor) setSelection({ kind, cursors: [...cursors, data.nextCursor] })
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  )
}

function DependencyReference({
  reference,
  orgSlug,
  connectionId,
}: {
  reference: JobDependenciesResponse['children'][number]
  orgSlug: string
  connectionId: string
}) {
  const { queueName, jobId, status } = reference
  const canNavigate = queueName !== null && jobId !== null && status !== 'unknown'
  const label =
    JOB_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    (status === 'outside-connection' ? 'Outside this connection prefix' : 'Removed or unavailable')
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {canNavigate ? (
        <Link
          to="/$orgSlug/c/$connectionId/queues/$queueName/jobs/$jobId"
          params={{ orgSlug, connectionId, queueName, jobId }}
          search={{ tab: 'dependencies' }}
          className="min-w-0 break-all rounded-sm font-mono text-xs text-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {queueName} / {jobId}
        </Link>
      ) : (
        <span className="min-w-0 break-all font-mono text-xs text-muted-foreground">
          {reference.key}
        </span>
      )}
      <Badge variant={STATUS_BADGE[status] ?? 'neutral'}>{label}</Badge>
    </div>
  )
}
