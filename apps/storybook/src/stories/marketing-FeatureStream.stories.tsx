import { FeatureStream } from '@docs/components/v2/feature-stream'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Feature Stream/FeatureStream',
  component: FeatureStream,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FeatureStream>
export default meta
export const Default: StoryObj<typeof meta> = {}
