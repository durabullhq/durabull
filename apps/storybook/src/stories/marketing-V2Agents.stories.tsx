import { V2Agents } from '@docs/components/v2/agents'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Agents/V2Agents',
  component: V2Agents,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2Agents>
export default meta
export const Default: StoryObj<typeof meta> = {}
