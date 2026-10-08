import { DurabullLogo } from '@docs/components/durabull-logo'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Durabull Logo/DurabullLogo',
  component: DurabullLogo,
  args: { className: 'size-20' },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DurabullLogo>
export default meta
export const Default: StoryObj<typeof meta> = {}
