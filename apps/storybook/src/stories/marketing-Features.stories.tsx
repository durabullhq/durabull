import { Features } from '@docs/components/sections/features'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Sections / Features/Features',
  component: Features,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Features>
export default meta
export const Default: StoryObj<typeof meta> = {}
