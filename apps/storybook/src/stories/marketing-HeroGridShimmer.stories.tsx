import { HeroGridShimmer } from '@docs/components/v2/hero-grid-shimmer'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Hero Grid Shimmer/HeroGridShimmer',
  component: HeroGridShimmer,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HeroGridShimmer>
export default meta
export const Default: StoryObj<typeof meta> = {
  render: () => (
    <div className="relative h-96">
      <HeroGridShimmer />
    </div>
  ),
}
