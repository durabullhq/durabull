import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { QueueFlowControlsDialog } from '@/components/queue-flow-controls-dialog'

const meta = {
  title: 'Web Components/Queue Flow Controls Dialog',
  component: QueueFlowControlsDialog,
  args: { queueName: 'email:receipts', open: true, onOpenChange: fn() },
} satisfies Meta<typeof QueueFlowControlsDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
