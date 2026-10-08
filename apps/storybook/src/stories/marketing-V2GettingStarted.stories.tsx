import { V2GettingStarted } from '@docs/components/v2/features'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Features/V2GettingStarted',
  component: V2GettingStarted,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2GettingStarted>
export default meta
export const Default: StoryObj<typeof meta> = {}
