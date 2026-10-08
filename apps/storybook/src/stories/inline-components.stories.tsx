import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { AlertRuleBuilderSkeleton } from '@/components/alerts/alert-rule-builder-v2'
import { JsonViewerInline } from '@/components/json-viewer'
import { QueueMetricsBar } from '@/components/queue-table'
import { RetryJobProgress } from '@/components/retry-job-progress'
import { StatusDot, StatusIndicator } from '@/components/status-badge'
import { useJobRetryDialog } from '@/hooks/use-job-retry-dialog'
import { payload, queues } from '../fixtures/data'

const meta = { title: 'Web Components/Inline Summaries' } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>
export const InlineJson: Story = { render: () => <JsonViewerInline data={payload} /> }
export const StatusIndicators: Story = {
  render: () => (
    <div className="catalog-stack">
      {(['active', 'paused', 'failed', 'completed', 'waiting', 'delayed'] as const).map(
        (status) => (
          <div key={status} className="catalog-stack">
            <StatusDot status={status} />
            <StatusIndicator status={status} />
          </div>
        )
      )}
    </div>
  ),
}
export const QueueMetrics: Story = {
  render: () => (
    <QueueMetricsBar queue={queues[0] as ComponentProps<typeof QueueMetricsBar>['queue']} />
  ),
}
export const RuleLoading: Story = { render: () => <AlertRuleBuilderSkeleton /> }
function RetryProgressExample() {
  const retry = useJobRetryDialog('email:receipts', 'job-1042')
  return (
    <RetryJobProgress
      retry={{
        ...retry,
        open: true,
        requestState: 'watching',
        isWatching: true,
        logEntries: [{ id: 1, line: 'Preparing demo receipt' }],
        jobStatus: 'active',
      }}
      onClose={() => {}}
    />
  )
}
export const RetryProgress: Story = { render: () => <RetryProgressExample /> }
