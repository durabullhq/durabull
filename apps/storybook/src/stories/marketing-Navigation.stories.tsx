import { Navigation } from '@docs/components/navigation'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Navigation/Navigation',
  component: Navigation,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Navigation>
export default meta
export const Default: StoryObj<typeof meta> = {}
