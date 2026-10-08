import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { RetryQueueDialog } from '@/components/retry-queue-dialog'
import { counts } from '../fixtures/data'

const meta = {
  title: 'Web Components/Retry Queue Dialog',
  component: RetryQueueDialog,
  args: { queueName: 'email:receipts', queueJobCounts: counts, open: true, onOpenChange: fn() },
} satisfies Meta<typeof RetryQueueDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
