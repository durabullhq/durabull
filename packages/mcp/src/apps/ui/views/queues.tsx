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
import { type Data, duration, fmt, num, obj, ratio, rows, str, strings } from '../format'
import { ConnectionNav } from './connection'

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
      <ConnectionNav current="list_queues" />
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
                meta={`${fmt(counts.waiting)} waiting · ${fmt(counts.active)} active`}
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
        subtitle={`${fmt(workers.length)} worker${workers.length === 1 ? '' : 's'} · ${fmt(data.scheduledJobsCount)} schedules`}
        badge={<StatusBadge status={data.isPaused ? 'paused' : data.status} />}
      />
      <Stats
        items={[
          ['Waiting', counts.waiting],
          ['Active', counts.active],
          ['Failed', counts.failed, num(counts.failed) > 0 ? 'danger' : undefined],
          ['Completed', counts.completed],
        ]}
      />
      <Actions>
        <Go primary label="Browse jobs" tool="list_jobs" args={queue} />
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
                trailing={`up ${duration(worker.ageMs)} · idle ${duration(worker.idleMs)}`}
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
      <ConnectionNav current="get_workers" />
      {input}
      {filtered.length ? (
        <Rows>
          {filtered.map((worker) => (
            <Row
              key={`${str(worker.queueName)}:${str(worker.id)}`}
              label={str(worker.name) || str(worker.id)}
              meta={[str(worker.queueName), str(worker.address)].filter(Boolean).join(' · ')}
              trailing={`idle ${duration(worker.idleMs)}`}
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
          ['Completed', totals.completedInWindow],
          ['Failed', totals.failedInWindow, num(totals.failedInWindow) > 0 ? 'danger' : undefined],
          ['Jobs / min', totals.avgCompletedPerMinuteInWindow],
          [
            'Drain time',
            totals.estimatedDrainMinutes,
            undefined,
            totals.estimatedDrainMinutes == null ? '—' : `${fmt(totals.estimatedDrainMinutes)} min`,
          ],
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
