import { Screenshots } from '@docs/components/sections/screenshots'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Sections / Screenshots/Screenshots',
  component: Screenshots,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screenshots>
export default meta
export const Default: StoryObj<typeof meta> = {}
