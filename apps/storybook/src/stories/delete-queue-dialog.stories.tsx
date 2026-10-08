import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { DeleteQueueDialog } from '@/components/delete-queue-dialog'

const meta = {
  title: 'Web Components/Delete Queue Dialog',
  component: DeleteQueueDialog,
  args: { queueName: 'email:receipts', open: true, onOpenChange: fn() },
} satisfies Meta<typeof DeleteQueueDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
