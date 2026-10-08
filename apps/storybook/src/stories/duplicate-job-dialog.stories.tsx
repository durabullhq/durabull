import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { DuplicateJobDialog } from '@/components/duplicate-job-dialog'
import { payload } from '../fixtures/data'

const meta = {
  title: 'Web Components/Duplicate Job Dialog',
  component: DuplicateJobDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    queueName: 'email:receipts',
    originalJobId: 'job-1042',
    originalJobName: 'send-receipt',
    originalJobData: payload,
    originalJobOpts: { attempts: 3 },
  },
} satisfies Meta<typeof DuplicateJobDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
