import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { InvokeJobDialog } from '@/components/invoke-job-dialog'
import { payload } from '../fixtures/data'

const meta = {
  title: 'Web Components/Invoke Job Dialog',
  component: InvokeJobDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    queueName: 'email:receipts',
    jobId: 'job-1042',
    jobName: 'send-receipt',
    jobData: payload,
  },
} satisfies Meta<typeof InvokeJobDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
