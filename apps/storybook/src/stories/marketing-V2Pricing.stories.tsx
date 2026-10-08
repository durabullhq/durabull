import { V2Pricing } from '@docs/components/v2/deploy'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Deploy/V2Pricing',
  component: V2Pricing,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2Pricing>
export default meta
export const Default: StoryObj<typeof meta> = {}
