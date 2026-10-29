import { PricingContent } from '@docs/components/pricing/pricing-content'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
  title: 'Marketing/Pricing/Pricing Content',
  component: PricingContent,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PricingContent>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
