import { DurabullWordmark } from '@docs/components/durabull-logo'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Durabull Logo/DurabullWordmark',
  component: DurabullWordmark,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DurabullWordmark>
export default meta
export const Default: StoryObj<typeof meta> = {}
