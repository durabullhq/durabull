import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AppUpdateBanner } from '@/components/app-update-banner'

const meta = {
  title: 'Web Components/App Update Banner',
  component: AppUpdateBanner,
  parameters: { updateAvailable: true },
  args: { onUpdate: fn() },
} satisfies Meta<typeof AppUpdateBanner>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
