import { CheckCircleFilled } from '@openai/apps-sdk-ui/components/Icon'
import { Facts, Go, Header, Note, StatusBadge } from '../components'
import type { View } from '../explorer'
import { str } from '../format'
import { refreshToolCall } from '../read-tools'

const RECEIPTS: Record<string, [string, string]> = {
  retry_job: ['Retry requested', 'Durabull job'],
  promote_job: ['Promotion requested', 'Durabull job'],
  pause_queue: ['Queue paused', 'Durabull queue'],
  resume_queue: ['Queue resumed', 'Durabull queue'],
}

/** Operation receipt. Refreshing reads the affected entity; it never replays the write. */
export function Operation({ view }: { view: View }) {
  const { data } = view
  const [heading, eyebrow] = RECEIPTS[view.tool] ?? ['Operation complete', 'Durabull']
  const read = refreshToolCall(view.tool, view.args)
  const isJob = 'jobId' in data
  return (
    <>
      <Header
        eyebrow={eyebrow}
        heading={heading}
        subtitle={isJob ? `${str(data.jobId)} · ${str(data.queueName)}` : str(data.queueName)}
        badge={<CheckCircleFilled className="text-success size-6" aria-hidden />}
      />
      <section aria-label="Operation result" className="bg-surface-secondary rounded-xl p-3">
        <Facts
          items={
            isJob
              ? [
                  ['Previous state', <StatusBadge key="before" status={data.previousState} />],
                  ['Observed state', <StatusBadge key="after" status={data.state} />],
                ]
              : [
                  [
                    'State',
                    <StatusBadge key="state" status={data.isPaused ? 'paused' : 'active'} />,
                  ],
                  ['Changed', data.changed ? 'Yes' : 'Already in this state'],
                ]
          }
        />
      </section>
      {isJob ? (
        <Note>
          Queued work is not proof of successful completion. Inspect the job for its current state.
        </Note>
      ) : null}
      {read ? (
        <div>
          <Go primary label="Inspect current state" tool={read.name} args={read.arguments ?? {}} />
        </div>
      ) : null}
    </>
  )
}
