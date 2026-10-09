import { Badge } from '@openai/apps-sdk-ui/components/Badge'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Search, Storage } from '@openai/apps-sdk-ui/components/Icon'
import { Input } from '@openai/apps-sdk-ui/components/Input'
import { useState } from 'react'
import {
  Empty,
  Header,
  Note,
  Row,
  Rows,
  Section,
  Stats,
  StatusBadge,
  useExplorer,
  Warn,
} from '../components'
import { ago, type Data, fmt, obj, rows, str, strings, title } from '../format'

const NAV: [string, string][] = [
  ['Overview', 'get_connection_overview'],
  ['Queues', 'list_queues'],
  ['Workers', 'get_workers'],
  ['Schedules', 'list_scheduled_jobs'],
  ['Incidents', 'get_alert_summary'],
  ['Alerts', 'get_failure_events'],
  ['Rules', 'list_alert_rules'],
  ['Redis', 'get_redis_health'],
]

/** Connection-scoped destinations as compact, scrollable chips. */
export function ConnectionNav({ current }: { current: string }) {
  const { ids, open, disabled } = useExplorer()
  return (
    <nav
      aria-label="Connection views"
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]"
    >
      {NAV.map(([label, tool]) => (
        <Button
          key={tool}
          color="secondary"
          variant={tool === current ? 'soft' : 'ghost'}
          size="xs"
          selected={tool === current}
          aria-current={tool === current ? 'page' : undefined}
          disabled={disabled}
          onClick={() => open(tool, { connectionId: ids.connectionId })}
        >
          {label}
        </Button>
      ))}
    </nav>
  )
}

/** Exact job-ID search across this connection, independent of page filtering. */
export function JobSearch({ initial = '' }: { initial?: string }) {
  const { ids, open, disabled } = useExplorer()
  const [value, setValue] = useState(initial)
  const find = () => {
    if (value.trim() && !disabled)
      open('find_job', { connectionId: ids.connectionId, jobId: value.trim() })
  }
  return (
    <search>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          find()
        }}
      >
        <Input
          name="jobId"
          size="sm"
          variant="soft"
          placeholder="Find a job by exact ID"
          aria-label="Find job by exact ID across queues"
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          startAdornment={<Search className="text-tertiary size-4" />}
        />
        <Button
          type="submit"
          color="secondary"
          variant="soft"
          size="sm"
          disabled={disabled || !value.trim()}
        >
          Find job
        </Button>
      </form>
    </search>
  )
}

export function Connections({ data }: { data: Data }) {
  const { open } = useExplorer()
  const connections = rows(data.connections)
  return (
    <>
      <Header
        eyebrow="Durabull"
        heading="Connections"
        subtitle="Choose a connection to inspect its queues, workers and alerts."
      />
      {connections.length ? (
        <Rows>
          {connections.map((connection) => (
            <Row
              key={str(connection.id)}
              icon={<Storage />}
              label={str(connection.name)}
              meta={[
                title(str(connection.environment)),
                str(connection.prefix) && `prefix ${str(connection.prefix)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={connection.isDefault ? <Badge>Default</Badge> : null}
              onOpen={() => open('get_connection_overview', { connectionId: connection.id })}
            />
          ))}
        </Rows>
      ) : (
        <Empty heading="No connections available">
          Check connection access for this account in Durabull.
        </Empty>
      )}
    </>
  )
}

export function Overview({ data }: { data: Data }) {
  const { ids, open, disabled } = useExplorer()
  const queues = obj(data.queues)
  const counts = obj(queues.totals)
  const discovery = obj(data.discovery)
  const alerts = obj(data.alerts)
  const queue = (name: unknown) => () => open('get_queue', { ...ids, queueName: name })
  const failing = rows(queues.topFailed)
  const backlog = rows(queues.topBacklog)
  return (
    <>
      <Header
        eyebrow="Durabull connection"
        heading={str(data.name) || 'Connection'}
        subtitle={[title(str(data.environment)), str(data.prefix) && `prefix ${str(data.prefix)}`]
          .filter(Boolean)
          .join(' · ')}
        badge={
          data.alerts ? (
            Number(alerts.firing) > 0 ? (
              <StatusBadge status="firing" label={`${fmt(alerts.firing)} firing`} />
            ) : (
              <StatusBadge status="resolved" label="No open alerts" />
            )
          ) : null
        }
        trailing={
          <Button
            color="secondary"
            variant="ghost"
            size="xs"
            disabled={disabled}
            onClick={() => open('list_connections', {})}
          >
            Switch
          </Button>
        }
      />
      <ConnectionNav current="get_connection_overview" />
      <Stats
        items={[
          ['Waiting', counts.waiting],
          ['Active', counts.active],
          ['Failed', counts.failed, Number(counts.failed) > 0 ? 'danger' : undefined],
          ['Workers', obj(data.workers).total],
        ]}
      />
      {strings(data.warnings).map((warning) => (
        <Warn key={warning}>{warning}</Warn>
      ))}
      {queues.truncated ? (
        <Warn>This overview is a partial scan. Browse queues for the complete paginated list.</Warn>
      ) : null}
      <JobSearch />
      {failing.length ? (
        <Section heading="Needs attention">
          <Rows>
            {failing.map((row) => (
              <Row
                key={str(row.name)}
                label={str(row.name)}
                trailing={
                  <span className="text-danger tabular-nums">{fmt(row.failed)} failed</span>
                }
                onOpen={queue(row.name)}
              />
            ))}
          </Rows>
        </Section>
      ) : null}
      {backlog.length ? (
        <Section heading="Largest backlog">
          <Rows>
            {backlog.map((row) => (
              <Row
                key={str(row.name)}
                label={str(row.name)}
                trailing={<span className="tabular-nums">{fmt(row.waiting)} waiting</span>}
                onOpen={queue(row.name)}
              />
            ))}
          </Rows>
        </Section>
      ) : null}
      {(
        [
          ['Waiting without workers', 'withoutWorkers'],
          ['Paused queues', 'paused'],
        ] as const
      ).map(([heading, key]) =>
        strings(queues[key]).length ? (
          <Section key={key} heading={heading}>
            <Rows>
              {strings(queues[key]).map((name) => (
                <Row key={name} label={name} onOpen={queue(name)} />
              ))}
            </Rows>
          </Section>
        ) : null
      )}
      <Note>
        Scanned {fmt(queues.scanned)} of {fmt(discovery.totalQueues)} discovered queues
        {Number(discovery.pending) > 0 ? ` · ${fmt(discovery.pending)} pending discovery` : ''}
        {discovery.lastDiscoveredAt ? ` · discovered ${ago(discovery.lastDiscoveredAt)}` : ''}
      </Note>
    </>
  )
}
