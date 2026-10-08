import { V2Problem } from '@docs/components/v2/features'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Features/V2Problem',
  component: V2Problem,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2Problem>
export default meta
export const Default: StoryObj<typeof meta> = {}
