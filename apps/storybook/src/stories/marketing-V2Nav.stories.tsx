import { V2Nav } from '@docs/components/v2/nav'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Nav/V2Nav',
  component: V2Nav,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2Nav>
export default meta
export const Default: StoryObj<typeof meta> = {}
