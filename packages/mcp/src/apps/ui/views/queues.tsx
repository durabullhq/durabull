import { Badge } from '@openai/apps-sdk-ui/components/Badge'
import { Stack } from '@openai/apps-sdk-ui/components/Icon'
import {
  Actions,
  Ask,
  Empty,
  Facts,
  Go,
  Header,
  Note,
  Row,
  Rows,
  Section,
  Stats,
  StatusBadge,
  useExplorer,
  useFilter,
  Warn,
} from '../components'
import {
  count,
  type Data,
  dotted,
  duration,
  fmt,
  num,
  obj,
  ratio,
  rows,
  str,
  strings,
} from '../format'

const workerTiming = (worker: Data) =>
  dotted(`up ${duration(worker.ageMs)}`, `idle ${duration(worker.idleMs)}`)

export function Queues({ data }: { data: Data }) {
  const { ids, open } = useExplorer()
  const { filtered, input } = useFilter(rows(data.queues))
  return (
    <>
      <Header
        eyebrow="Durabull"
        heading="Queues"
        subtitle={data.total == null ? undefined : `${fmt(data.total)} queues on this connection`}
      />
      {input}
      {filtered.length ? (
        <Rows>
          {filtered.map((queue) => {
            const counts = obj(queue.jobCounts)
            return (
              <Row
                key={str(queue.name)}
                icon={<Stack />}
                label={str(queue.name)}
                meta={dotted(`${fmt(counts.waiting)} waiting`, `${fmt(counts.active)} active`)}
                trailing={
                  <>
                    {num(counts.failed) > 0 ? (
                      <Badge color="danger">{fmt(counts.failed)} failed</Badge>
                    ) : null}
                    {queue.isPaused ? <StatusBadge status="paused" /> : null}
                  </>
                }
                onOpen={() => open('get_queue', { ...ids, queueName: queue.name })}
              />
            )
          })}
        </Rows>
      ) : (
        <Empty heading="No queues on this page" />
      )}
    </>
  )
}

export function Queue({ data }: { data: Data }) {
  const { ids } = useExplorer()
  const counts = obj(data.jobCounts)
  const queue = { ...ids, queueName: data.name }
  const workers = rows(data.workers)
  return (
    <>
      <Header
        eyebrow="Durabull queue"
        heading={str(data.name) || 'Queue'}
        subtitle={dotted(
          count(workers.length, 'worker'),
          `${fmt(data.scheduledJobsCount)} schedules`
        )}
        badge={<StatusBadge status={data.isPaused ? 'paused' : data.status} />}
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
          { label: 'Completed', value: counts.completed },
        ]}
      />
      <Actions>
        <Go variant="primary" label="Browse jobs" tool="list_jobs" args={queue} />
        <Go label="Failed jobs" tool="list_jobs" args={{ ...queue, status: 'failed' }} />
        <Go label="Metrics" tool="get_queue_metrics" args={queue} />
        <Go label="Schedules" tool="list_scheduled_jobs" args={queue} />
        <Ask
          label={data.isPaused ? 'Ask to resume' : 'Ask to pause'}
          action={data.isPaused ? 'Resume this queue.' : 'Pause this queue.'}
          ids={queue}
        />
      </Actions>
      <Section heading="Workers">
        {workers.length ? (
          <Rows>
            {workers.map((worker) => (
              <Row
                key={str(worker.id)}
                label={str(worker.name) || str(worker.id)}
                meta={str(worker.address) || undefined}
                trailing={workerTiming(worker)}
              />
            ))}
          </Rows>
        ) : (
          <Empty heading="No workers connected">
            Jobs in this queue will wait until a worker starts.
          </Empty>
        )}
      </Section>
    </>
  )
}

export function Workers({ data }: { data: Data }) {
  const { filtered, input } = useFilter(rows(data.workers))
  return (
    <>
      <Header
        eyebrow="Durabull"
        heading="Workers"
        subtitle={`${fmt(data.totalWorkersInPage)} on this page across ${fmt(data.totalQueues)} queues`}
      />
      {input}
      {filtered.length ? (
        <Rows>
          {filtered.map((worker) => (
            <Row
              key={`${str(worker.queueName)}:${str(worker.id)}`}
              label={str(worker.name) || str(worker.id)}
              meta={dotted(str(worker.queueName), str(worker.address))}
              trailing={workerTiming(worker)}
            />
          ))}
        </Rows>
      ) : (
        <Empty heading="No workers on this page" />
      )}
    </>
  )
}

export function Metrics({ data }: { data: Data }) {
  const totals = obj(data.totals)
  const range = obj(data.range)
  const queue = obj(data.queue)
  return (
    <>
      <Header
        eyebrow="Queue performance"
        heading={str(data.queueName) || 'Queue'}
        subtitle={`Last ${fmt(range.requestedWindowMinutes)} minutes`}
        badge={
          queue.isPaused ? (
            <StatusBadge status="paused" />
          ) : queue.isMaxed ? (
            <StatusBadge status="pending" label="At capacity" />
          ) : null
        }
      />
      <Stats
        items={[
          { label: 'Completed', value: totals.completedInWindow },
          {
            label: 'Failed',
            value: totals.failedInWindow,
            tone: num(totals.failedInWindow) > 0 ? 'danger' : undefined,
          },
          { label: 'Jobs / min', value: totals.avgCompletedPerMinuteInWindow },
          {
            label: 'Drain time',
            value: totals.estimatedDrainMinutes,
            display:
              totals.estimatedDrainMinutes == null
                ? '—'
                : `${fmt(totals.estimatedDrainMinutes)} min`,
          },
        ]}
      />
      {strings(data.warnings).map((warning) => (
        <Warn key={warning}>{warning}</Warn>
      ))}
      <Section heading="Processing">
        <Facts
          items={[
            ['Success rate', ratio(totals.successRateInWindow)],
            ['Failure rate', ratio(totals.failureRateInWindow)],
            ['Waiting to process', fmt(queue.waitingToProcess)],
            ['Workers', fmt(queue.workersCount)],
            ['Schedulers', fmt(queue.schedulersCount)],
            ['Longest failure streak', `${fmt(totals.longestFailureStreakMinutesInWindow)} min`],
          ]}
        />
      </Section>
      <Section heading="Coverage">
        <Facts
          items={[
            ['Window coverage', ratio(range.requestedWindowCoverage)],
            ['Data points', fmt(range.returnedPoints)],
            ['Latest point age', duration(range.latestPointAgeMs)],
          ]}
        />
      </Section>
      <Note>
        Drain time uses the observed completion rate. Incoming work and changes in capacity can
        alter the result.
      </Note>
    </>
  )
}
