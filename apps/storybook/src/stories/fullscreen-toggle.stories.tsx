import type { Meta, StoryObj } from '@storybook/react-vite'
import { FullscreenToggle } from '@/components/fullscreen-toggle'

const meta = {
  title: 'Desktop/Fullscreen Toggle',
  parameters: { desktop: true },
  component: FullscreenToggle,
  args: {},
} satisfies Meta<typeof FullscreenToggle>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
