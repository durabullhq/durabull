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
export const Prioritized: Story = { args: { status: 'prioritized' } }
export const WaitingOnChildren: Story = { args: { status: 'waiting-children' } }
/** An active job is in flight (blue) and reads "Active", not "Running". */
export const ActiveJob: Story = { args: { status: 'running', label: 'Active' } }
