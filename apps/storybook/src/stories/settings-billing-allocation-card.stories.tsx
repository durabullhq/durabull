import type { Meta, StoryObj } from '@storybook/react-vite'
import { AllocationCard } from '@/components/settings/billing/allocation-card'
import type { EnabledBillingOverview } from '@/hooks/use-billing'
import { billingOverview, freeLimits } from '../fixtures/billing'

const overLimit = {
  ...billingOverview,
  planCode: 'free',
  planName: 'Free',
  limits: freeLimits,
  usage: { ...billingOverview.usage, 'connections.enabled': 1 },
  suspended: [{ kind: 'connection', id: 'demo-staging', since: '2026-11-01T00:00:00Z' }],
  allocation: {
    'connections.enabled': [
      { id: 'demo-redis', kind: 'connection', name: 'Production', suspended: false, pinned: false },
      { id: 'demo-staging', kind: 'connection', name: 'Staging', suspended: true, pinned: false },
    ],
    'members.reserved': [],
    'alerts.enabled': [],
    'alerts.destinations': [],
    'service_accounts.enabled': [],
  },
} as unknown as EnabledBillingOverview

const meta = {
  title: 'Web Components/Settings/Billing/Choose What Stays Enabled',
  component: AllocationCard,
  args: { overview: overLimit },
} satisfies Meta<typeof AllocationCard>
export default meta
type Story = StoryObj<typeof meta>
export const ConnectionPaused: Story = {}
export const MemberView: Story = {
  args: { overview: { ...overLimit, canManageBilling: false } },
}
