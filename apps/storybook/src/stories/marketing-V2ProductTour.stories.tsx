import { V2ProductTour } from '@docs/components/v2/showcase'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Showcase/V2ProductTour',
  component: V2ProductTour,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2ProductTour>
export default meta
export const Default: StoryObj<typeof meta> = {}
