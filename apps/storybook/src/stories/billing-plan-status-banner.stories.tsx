import type { Meta, StoryObj } from '@storybook/react-vite'
import { PlanStatusBanner } from '@/components/billing/plan-status-banner'

const meta = {
  title: 'Web Components/Billing/Plan Status Banner',
  component: PlanStatusBanner,
  args: { orgSlug: 'acme' },
  parameters: { billingScenario: 'paused' },
} satisfies Meta<typeof PlanStatusBanner>
export default meta
type Story = StoryObj<typeof meta>
export const ResourcesPaused: Story = {}
export const PaymentFailed: Story = { parameters: { billingScenario: 'payment-failed' } }
export const BetaTransitionFallback: Story = {
  parameters: { billingScenario: 'team', billingTransition: 'notice' },
}
