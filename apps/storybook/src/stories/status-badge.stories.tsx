import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatusBadge } from '@/components/status-badge'

const meta = {
  title: 'Web Components/Status Badge',
  component: StatusBadge,
  args: { status: 'active', showPulse: true },
} satisfies Meta<typeof StatusBadge>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Failed: Story = { args: { status: 'failed' } }
export const Completed: Story = { args: { status: 'completed' } }
export const Paused: Story = { args: { status: 'paused' } }
export const Waiting: Story = { args: { status: 'waiting' } }
export const Delayed: Story = { args: { status: 'delayed' } }
