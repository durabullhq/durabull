import { Link } from '@tanstack/react-router'
import { GitBranch, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type JobDependenciesResponse,
  type JobDependencyKind,
  useJobDependencies,
} from '@/hooks/use-queues'
import { JOB_STATUS_OPTIONS } from '@/lib/constants'

const dependencyKinds = [
  { value: 'unprocessed', label: 'Pending' },
  { value: 'processed', label: 'Processed' },
  { value: 'failed', label: 'Failed' },
  { value: 'ignored', label: 'Ignored failures' },
] as const

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
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <GitBranch className="h-4 w-4" />
            Job Dependencies
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Follow parent and child jobs to inspect a flow across queues.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => query.refetch()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh dependencies
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {query.isLoading && <output>Loading dependencies…</output>}
        {query.error && (
          <p role="alert" className="text-sm text-destructive">
            Unable to load dependencies: {query.error.message}
          </p>
        )}
        {data && (
          <>
            {data.parent && (
              <div className="space-y-2 rounded-md border p-3">
                <h3 className="text-sm font-medium">Parent job</h3>
                <DependencyReference reference={data.parent} {...props} />
              </div>
            )}
            {data.status === 'waiting-children' && data.counts.unprocessed > 0 && (
              <p className="rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-sm">
                This job is waiting for {data.counts.unprocessed.toLocaleString()} pending child
                jobs. Inspect the pending children to find unfinished or failed work.
              </p>
            )}
            {total === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {data.parent
                  ? 'This job has no child dependencies.'
                  : 'This job has no parent or child dependencies.'}
              </p>
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
      </CardContent>
    </Card>
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
      <fieldset className="flex flex-wrap gap-2" aria-label="Dependency filters">
        {dependencyKinds.map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={kind === item.value ? 'default' : 'outline'}
            aria-pressed={kind === item.value}
            onClick={() => setSelection({ kind: item.value, cursors: ['0'] })}
          >
            {item.label} ({data.counts[item.value].toLocaleString()})
          </Button>
        ))}
      </fieldset>
      {kind === 'ignored' && (
        <p className="text-sm text-muted-foreground">
          These child failures were ignored by the parent’s failure policy.
        </p>
      )}
      <ul className="divide-y rounded-md border" aria-label="Child jobs">
        {data.children.map((child) => (
          <li key={child.key} className="p-3">
            <DependencyReference reference={child} {...props} />
          </li>
        ))}
        {data.children.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">
            {data.nextCursor
              ? 'No children in this scan. Continue to the next page.'
              : 'No children in this category on this page.'}
          </li>
        )}
      </ul>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          Page {cursors.length} · {data.children.length} children shown
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={cursors.length === 1 || isFetching}
            onClick={() => setSelection({ kind, cursors: cursors.slice(0, -1) })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
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
          className="min-w-0 break-all text-sm text-primary hover:underline"
        >
          {queueName} / {jobId}
        </Link>
      ) : (
        <span className="min-w-0 break-all font-mono text-xs text-muted-foreground">
          {reference.key}
        </span>
      )}
      <Badge
        variant={
          status === 'failed' ? 'destructive' : status === 'completed' ? 'success' : 'secondary'
        }
      >
        {label}
      </Badge>
    </div>
  )
}
