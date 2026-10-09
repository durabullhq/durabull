import { Badge } from '@openai/apps-sdk-ui/components/Badge'
import { Storage } from '@openai/apps-sdk-ui/components/Icon'
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
import { ago, type Data, dotted, fmt, num, obj, rows, str, strings, title } from '../format'

const environment = (data: Data) =>
  dotted(title(str(data.environment)), str(data.prefix) && `prefix ${str(data.prefix)}`)

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
              meta={environment(connection)}
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
  const { ids, open } = useExplorer()
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
        subtitle={environment(data)}
        badge={
          data.alerts ? (
            num(alerts.firing) > 0 ? (
              <StatusBadge status="firing" label={`${fmt(alerts.firing)} firing`} />
            ) : (
              <StatusBadge status="resolved" label="No open alerts" />
            )
          ) : null
        }
      />
      <Stats
        items={[
          { label: 'Waiting', value: counts.waiting },
          { label: 'Active', value: counts.active },
          {
            label: 'Failed',
            value: counts.failed,
            tone: num(counts.failed) > 0 ? 'danger' : undefined,
          },
          { label: 'Workers', value: obj(data.workers).total },
        ]}
      />
      {strings(data.warnings).map((warning) => (
        <Warn key={warning}>{warning}</Warn>
      ))}
      {queues.truncated ? (
        <Warn>This overview is a partial scan. Browse queues for the complete paginated list.</Warn>
      ) : null}
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
        {dotted(
          `Scanned ${fmt(queues.scanned)} of ${fmt(discovery.totalQueues)} discovered queues`,
          num(discovery.pending) > 0 && `${fmt(discovery.pending)} pending discovery`,
          Boolean(discovery.lastDiscoveredAt) && `discovered ${ago(discovery.lastDiscoveredAt)}`
        )}
      </Note>
    </>
  )
}
