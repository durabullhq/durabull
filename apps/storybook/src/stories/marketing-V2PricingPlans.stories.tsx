import { V2PricingPlans } from '@docs/components/v2/pricing-page'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Pricing Page/V2PricingPlans',
  component: V2PricingPlans,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2PricingPlans>
export default meta
export const Default: StoryObj<typeof meta> = {}
