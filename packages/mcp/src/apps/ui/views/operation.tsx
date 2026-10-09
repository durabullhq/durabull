import { CheckCircleFilled } from '@openai/apps-sdk-ui/components/Icon'
import { Facts, Go, Header, Note, StatusBadge } from '../components'
import type { View } from '../explorer'
import { dotted, str } from '../format'
import { refreshToolCall } from '../read-tools'
import { isToolName } from './registry'

/** Operation receipt. Refreshing reads the affected entity; it never replays the write. */
export function Operation({ view, heading }: { view: View; heading: string }) {
  const { data } = view
  const read = refreshToolCall(view.tool, view.args)
  const isJob = 'jobId' in data
  return (
    <>
      <Header
        eyebrow={isJob ? 'Durabull job' : 'Durabull queue'}
        heading={heading}
        subtitle={dotted(isJob && str(data.jobId), str(data.queueName))}
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
      {read && isToolName(read.name) ? (
        <div>
          <Go
            variant="primary"
            label="Inspect current state"
            tool={read.name}
            args={read.arguments ?? {}}
          />
        </div>
      ) : null}
    </>
  )
}
