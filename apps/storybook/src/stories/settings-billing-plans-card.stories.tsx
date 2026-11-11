import type { Meta, StoryObj } from '@storybook/react-vite'
import { describeBilling } from '@/components/settings/billing/billing-state'
import { PlansCard } from '@/components/settings/billing/plans-card'
import type { EnabledBillingOverview } from '@/hooks/use-billing'
import { billingOverview } from '../fixtures/billing'

const teamOverview = billingOverview as unknown as EnabledBillingOverview

const meta = {
  title: 'Web Components/Settings/Billing/Plans',
  component: PlansCard,
  args: {
    overview: teamOverview,
    state: describeBilling(teamOverview),
    portalBusy: false,
    onPortal: () => {},
  },
} satisfies Meta<typeof PlansCard>
export default meta
type Story = StoryObj<typeof meta>
export const AnnualTeamSubscriber: Story = {}
