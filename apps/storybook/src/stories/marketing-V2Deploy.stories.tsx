import { V2Deploy } from '@docs/components/v2/deploy'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Deploy/V2Deploy',
  component: V2Deploy,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2Deploy>
export default meta
export const Default: StoryObj<typeof meta> = {}
