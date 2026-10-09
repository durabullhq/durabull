import { Alert } from '@openai/apps-sdk-ui/components/Alert'
import { Badge } from '@openai/apps-sdk-ui/components/Badge'
import { Filter } from '@openai/apps-sdk-ui/components/Icon'
import { Select } from '@openai/apps-sdk-ui/components/Select'
import { MCP_JOB_STATES } from '../../../tools/tool-catalog'
import {
  Actions,
  Ask,
  Code,
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
import {
  ago,
  count,
  type Data,
  dotted,
  fmt,
  num,
  obj,
  rows,
  str,
  strings,
  title,
  when,
} from '../format'

/** Overrides Alert's danger default of role=alert: a recorded failure is content, not news. */
const nonLiveAlertRole = { role: 'note' }
const ALL_STATES = 'all'
const STATE_OPTIONS = [
  { value: ALL_STATES, label: 'All states' },
  ...MCP_JOB_STATES.map((state) => ({ value: state, label: title(state) })),
]
const attempts = (job: Data) => `${fmt(job.attemptsMade)} of ${fmt(job.maxAttempts)} attempts`

export function Jobs({ data, args }: { data: Data; args: Data }) {
  const { ids, open, disabled } = useExplorer()
  const status = str(args.status)
  const queue = { ...ids, queueName: data.queueName ?? args.queueName }
  const { filtered, input } = useFilter(rows(data.jobs))
  const { cursor: _cursor, status: _status, ...base } = args
  return (
    <>
      <Header
        eyebrow={dotted('Durabull', str(queue.queueName))}
        heading={status ? `${title(status)} jobs` : 'Jobs'}
        subtitle={`${count(data.total, 'job')} matched`}
      />
      <div className="flex gap-2">
        {/* Select names its trigger with the chosen state; the legend supplies the field name. */}
        <fieldset className="m-0 shrink-0 border-0 p-0">
          <legend className="sr-only">Job state</legend>
          <Select
            options={STATE_OPTIONS}
            value={status || ALL_STATES}
            size="sm"
            variant="soft"
            TriggerStartIcon={Filter}
            disabled={disabled}
            onChange={(option) =>
              open('list_jobs', {
                ...base,
                ...(option.value === ALL_STATES ? {} : { status: option.value }),
              })
            }
          />
        </fieldset>
        <div className="min-w-0 flex-1">{input}</div>
      </div>
      {filtered.length ? (
        <Rows>
          {filtered.map((job) => (
            <Row
              key={str(job.id)}
              label={str(job.id)}
              meta={dotted(str(job.name), attempts(job))}
              detail={
                job.failedReason ? (
                  <p className="text-danger truncate text-sm">{str(job.failedReason)}</p>
                ) : null
              }
              trailing={<StatusBadge status={job.status} />}
              onOpen={() => open('get_job', { ...queue, jobId: job.id })}
            />
          ))}
        </Rows>
      ) : (
        <Empty heading="No jobs match">Try another state or refresh.</Empty>
      )}
    </>
  )
}

export function FindJob({ data, args }: { data: Data; args: Data }) {
  const { ids, open } = useExplorer()
  const matches = rows(data.matches)
  return (
    <>
      <Header
        eyebrow="Durabull job search"
        heading={str(data.jobId) || str(args.jobId) || 'Job search'}
        subtitle={`Searched ${fmt(data.queuesScanned)} of ${fmt(data.totalQueues)} queues`}
        badge={<Badge>{count(matches.length, 'match', 'matches')}</Badge>}
      />
      {matches.length ? (
        <Rows>
          {matches.map((match) => {
            const job = obj(match.job)
            return (
              <Row
                key={`${str(match.queueName)}:${str(job.id)}`}
                label={str(job.id)}
                meta={dotted(str(match.queueName), str(job.name))}
                trailing={<StatusBadge status={job.status} />}
                onOpen={() =>
                  open('get_job', { ...ids, queueName: match.queueName, jobId: job.id })
                }
              />
            )
          })}
        </Rows>
      ) : (
        <Empty heading="No job with this ID">Job IDs must match exactly.</Empty>
      )}
      <Note>
        {data.truncated
          ? 'Partial search: narrow to a queue to check the remaining jobs.'
          : 'Job IDs are unique per queue and may appear in more than one queue.'}
      </Note>
    </>
  )
}

export function Job({ data }: { data: Data }) {
  const { ids } = useExplorer()
  const job = obj(data.job)
  const target = { ...ids, queueName: data.queueName, jobId: job.id }
  const status = str(job.status)
  return (
    <>
      <Header
        eyebrow={dotted('Durabull job', str(data.queueName))}
        heading={str(job.name) || str(job.id) || 'Job'}
        subtitle={`ID ${str(job.id)}`}
        badge={<StatusBadge status={status} />}
      />
      {job.failedReason ? (
        <Alert
          color="danger"
          variant="soft"
          {...nonLiveAlertRole}
          title={`Failed after ${attempts(job)}`}
          description={str(job.failedReason)}
        />
      ) : null}
      <Facts
        items={[
          ['Attempts', attempts(job)],
          ['Priority', fmt(job.priority)],
          ['Created', when(job.timestamp)],
          ['Processed', job.processedOn ? when(job.processedOn) : undefined],
          ['Finished', job.finishedOn ? when(job.finishedOn) : undefined],
          ['Delay', num(job.delay) ? `${fmt(job.delay)} ms` : undefined],
        ]}
      />
      <Actions>
        {status === 'failed' ? (
          <Ask label="Ask to retry" action="Retry this failed job once." ids={target} />
        ) : null}
        {status === 'delayed' ? (
          <Ask label="Ask to promote" action="Promote this delayed job to run now." ids={target} />
        ) : null}
        <Ask
          label="Ask to investigate"
          action="Investigate this job failure. Gather evidence before proposing changes."
          ids={target}
        />
      </Actions>
      <Actions>
        <Go label="Logs" tool="get_job_logs" args={target} />
        <Go label="Stacktraces" tool="get_job_stacktraces" args={target} />
        <Go label="Failure evidence" tool="explain_job_failure" args={target} />
      </Actions>
      <Section heading="Data">
        <div className="flex flex-col gap-3">
          <Payload label="Payload · redacted" value={job.data} defaultOpen />
          <Payload
            label="Result & progress"
            value={{ result: job.returnvalue, progress: job.progress }}
          />
        </div>
      </Section>
    </>
  )
}
export function Logs({ data }: { data: Data }) {
  const logs = strings(data.logs)
  return (
    <>
      <Header
        eyebrow={dotted('Job logs', str(data.queueName))}
        heading={str(data.jobId) || 'Job logs'}
        subtitle={`${fmt(data.total ?? logs.length)} lines · redacted`}
      />
      {logs.length ? (
        <ol className="bg-surface-secondary max-h-96 overflow-auto rounded-xl py-2 font-mono text-xs leading-relaxed">
          {logs.map((line, index) => (
            <li key={index} className="flex gap-3 px-3">
              <span className="text-tertiary w-6 shrink-0 text-end tabular-nums select-none">
                {index + 1}
              </span>
              <span className="min-w-0 break-words whitespace-pre-wrap">{line}</span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty heading="No logs for this job" />
      )}
    </>
  )
}

export function Stacktraces({ data }: { data: Data }) {
  const traces = rows(data.stacktraces)
  return (
    <>
      <Header
        eyebrow={dotted('Stacktraces', str(data.queueName))}
        heading={str(data.jobId) || 'Stacktraces'}
        subtitle={`${fmt(data.total ?? traces.length)} attempts · redacted`}
      />
      {traces.length ? (
        traces.map((trace) => (
          <section key={str(trace.attemptNumber)} className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              Attempt {fmt(trace.attemptNumber)}
              {trace.isLatest ? <Badge>Latest</Badge> : null}
            </h2>
            <Code>{str(trace.stacktrace)}</Code>
          </section>
        ))
      ) : (
        <Empty heading="No stacktraces for this job" />
      )}
    </>
  )
}

const CONFIDENCE: Record<string, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
}
export function Explanation({ data }: { data: Data }) {
  const { ids, open } = useExplorer()
  const timeline = obj(data.attemptTimeline)
  const signal = obj(data.topSignal)
  const logs = strings(data.recentLogLines)
  const related = rows(data.relatedAlertEvents)
  const gaps = rows(data.skippedSources)
  const confidence = str(data.confidence)
  return (
    <>
      <Header
        eyebrow={dotted('Failure investigation', str(data.queueName))}
        heading={str(data.jobId) || 'Job'}
        subtitle={dotted(
          title(str(data.status)),
          `${fmt(timeline.attemptsMade)} of ${fmt(timeline.maxAttempts)} attempts`
        )}
        badge={
          confidence ? (
            <StatusBadge status={confidence} label={CONFIDENCE[confidence] ?? title(confidence)} />
          ) : null
        }
      />
      <p className="text-base leading-relaxed">{str(data.summary)}</p>
      {signal.excerpt ? (
        <Section heading="Strongest signal" trailing={<Badge>{title(str(signal.source))}</Badge>}>
          <Code>{str(signal.excerpt)}</Code>
        </Section>
      ) : null}
      <Section heading="Timeline">
        <Facts
          items={[
            ['Created', when(timeline.timestamp)],
            ['Processed', when(timeline.processedOn)],
            ['Finished', when(timeline.finishedOn)],
          ]}
        />
      </Section>
      {logs.length ? (
        <Section heading="Recent logs · redacted">
          <Code>{logs.join('\n')}</Code>
        </Section>
      ) : null}
      {related.length ? (
        <Section heading="Related alerts">
          <Rows>
            {related.map((event) => (
              <Row
                key={str(event.id)}
                label={str(event.summary) || str(event.id)}
                meta={`Fired ${ago(event.firedAt)}`}
                trailing={<StatusBadge status={event.status} />}
                onOpen={() => open('get_alert_event', { ...ids, eventId: event.id })}
              />
            ))}
          </Rows>
        </Section>
      ) : null}
      {gaps.length ? (
        <Section heading="Evidence gaps">
          <Facts items={gaps.map((gap) => [title(str(gap.source)), str(gap.reason)])} />
        </Section>
      ) : null}
      <Note>Sources: {strings(data.sources).map(title).join(', ') || 'none'}</Note>
    </>
  )
}
