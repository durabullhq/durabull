import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { JobRemoveButton } from '@/components/job-remove-button'

const meta = {
  title: 'Web Components/Job Remove Button',
  component: JobRemoveButton,
  args: { isScheduledJob: false, onRemoveJobOnly: fn(), onRemoveJobAndStopScheduler: fn() },
} satisfies Meta<typeof JobRemoveButton>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Scheduled: Story = { args: { isScheduledJob: true } }
export const Pending: Story = { args: { isPending: true } }
