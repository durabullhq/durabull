import { V2Showcase } from '@docs/components/v2/showcase'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Showcase/V2Showcase',
  component: V2Showcase,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2Showcase>
export default meta
export const Default: StoryObj<typeof meta> = {}
