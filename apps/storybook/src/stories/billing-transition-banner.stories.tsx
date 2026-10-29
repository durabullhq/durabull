import type { Meta, StoryObj } from '@storybook/react-vite'
import { TransitionBanner } from '@/components/billing/transition-banner'

const meta = {
  title: 'Web Components/Billing/Transition Banner',
  component: TransitionBanner,
  args: { orgSlug: 'acme' },
  parameters: { billingTransition: 'notice' },
} satisfies Meta<typeof TransitionBanner>
export default meta
type Story = StoryObj<typeof meta>
export const Notice: Story = {}
export const FinalWeek: Story = { parameters: { billingTransition: 'final-week' } }
