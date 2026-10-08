import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PurgeQueueDialog } from '@/components/purge-queue-dialog'
import { counts } from '../fixtures/data'

const meta = {
  title: 'Web Components/Purge Queue Dialog',
  component: PurgeQueueDialog,
  args: { queueName: 'email:receipts', queueJobCounts: counts, open: true, onOpenChange: fn() },
} satisfies Meta<typeof PurgeQueueDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
