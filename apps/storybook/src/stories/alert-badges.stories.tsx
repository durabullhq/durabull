import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  AlertStatusBadge,
  AlertTypeBadge,
  RuleStateBadge,
} from '@/components/alerts/alert-primitives'

const meta = { title: 'Web Components/Alerts/Badges' } satisfies Meta
export default meta
export const Types: StoryObj<typeof meta> = {
  render: () => (
    <div className="catalog-stack">
      {(
        [
          'failure_threshold',
          'failure_rate',
          'queue_stalled',
          'job_failed',
          'redis_health',
        ] as const
      ).map((type) => (
        <AlertTypeBadge key={type} type={type} />
      ))}
    </div>
  ),
}
export const Statuses: StoryObj<typeof meta> = {
  render: () => (
    <div className="catalog-stack">
      <AlertStatusBadge status="firing" />
      <AlertStatusBadge status="firing" acknowledged />
      <AlertStatusBadge status="resolved" />
      <AlertStatusBadge status="suppressed" />
      <RuleStateBadge state="active" />
      <RuleStateBadge state="disabled" />
      <RuleStateBadge state="snoozed" mutedUntil="2099-01-01" />
    </div>
  ),
}
