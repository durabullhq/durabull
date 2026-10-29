import { V2PlanComparison } from '@docs/components/v2/pricing-page'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Pricing Page/V2PlanComparison',
  component: V2PlanComparison,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2PlanComparison>
export default meta
export const Default: StoryObj<typeof meta> = {}
