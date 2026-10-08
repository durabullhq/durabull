import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { EditJobDataDialog } from '@/components/edit-job-data-dialog'
import { payload } from '../fixtures/data'

const meta = {
  title: 'Web Components/Edit Job Data Dialog',
  component: EditJobDataDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    queueName: 'email:receipts',
    jobId: 'job-1042',
    jobName: 'send-receipt',
    jobData: payload,
    jobStatus: 'failed',
  },
} satisfies Meta<typeof EditJobDataDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
