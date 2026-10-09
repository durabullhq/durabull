import { Calendar, Clock } from '@openai/apps-sdk-ui/components/Icon'
import {
  Empty,
  Facts,
  Go,
  Header,
  Note,
  Payload,
  Row,
  Rows,
  Section,
  StatusBadge,
  useExplorer,
  useFilter,
} from '../components'
import { ago, count, type Data, dotted, duration, fmt, num, obj, rows, str, when } from '../format'

/** Cron pattern or fixed interval, whichever the scheduler uses. */
const cadence = (schedule: Data) =>
  str(schedule.pattern) || (schedule.everyMs == null ? '—' : `every ${duration(schedule.everyMs)}`)

export function Schedules({ data, args }: { data: Data; args: Data }) {
  const { ids, open } = useExplorer()
  const { filtered, input } = useFilter(rows(data.scheduledJobs))
  const queueName = str(data.queueName) || str(args.queueName)
  return (
    <>
      <Header
        eyebrow={dotted('Durabull', queueName)}
        heading="Recurring schedules"
        subtitle={
          data.total == null
            ? `Scanned ${fmt(data.queuesScanned)} of ${fmt(data.totalQueues)} queues`
            : `${fmt(data.total)} schedules`
        }
      />
      {input}
      {filtered.length ? (
        <Rows>
          {filtered.map((schedule) => (
            <Row
              key={`${str(schedule.queueName)}:${str(schedule.schedulerId)}`}
              icon={<Calendar />}
              label={str(schedule.jobName) || str(schedule.schedulerId)}
              meta={dotted(queueName ? '' : str(schedule.queueName), cadence(schedule))}
              trailing={schedule.nextRunAt ? `next ${ago(schedule.nextRunAt)}` : null}
              onOpen={() =>
                open('get_scheduled_job', {
                  ...ids,
                  queueName: schedule.queueName,
                  schedulerId: schedule.schedulerId,
                })
              }
            />
          ))}
        </Rows>
      ) : (
        <Empty heading="No recurring schedules" />
      )}
    </>
  )
}

export function Schedule({ data }: { data: Data }) {
  const { ids } = useExplorer()
  const schedule = obj(data.scheduledJob)
  const failures = num(schedule.recentFailedCount)
  return (
    <>
      <Header
        eyebrow={dotted('Durabull schedule', str(schedule.queueName))}
        heading={str(schedule.jobName) || 'Recurring job'}
        subtitle={`Scheduler ${str(schedule.schedulerId)}`}
        badge={
          failures > 0 ? (
            <StatusBadge status="failed" label={count(failures, 'recent failure')} />
          ) : null
        }
      />
      <div className="bg-surface-secondary flex items-center gap-3 rounded-xl p-3">
        <Clock className="text-secondary size-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-secondary text-xs">Next run</p>
          <p className="font-medium">
            {schedule.nextRunAt
              ? `${when(schedule.nextRunAt)} · ${ago(schedule.nextRunAt)}`
              : 'Not scheduled'}
          </p>
        </div>
      </div>
      <Facts
        items={[
          ['Cadence', cadence(schedule)],
          ['Timezone', str(schedule.timezone) || 'Unspecified'],
          ['Runs so far', fmt(schedule.iterationCount)],
          ['Run limit', schedule.limit == null ? 'None' : fmt(schedule.limit)],
          ['Starts', schedule.startDate ? when(schedule.startDate) : undefined],
          ['Ends', schedule.endDate ? when(schedule.endDate) : undefined],
          ['Last failure', schedule.lastFailedAt ? when(schedule.lastFailedAt) : '—'],
        ]}
      />
      <div>
        <Go
          label="Inspect queue"
          tool="get_queue"
          args={{ ...ids, queueName: schedule.queueName }}
        />
      </div>
      <Section heading="Template">
        <div className="flex flex-col gap-3">
          <Payload label="Job data · redacted" value={schedule.data} />
          <Payload label="Job options" value={schedule.templateOptions} />
        </div>
      </Section>
      <Note>
        Next run is a scheduled time, not proof of execution. Workers and queue state determine
        processing.
      </Note>
    </>
  )
}
