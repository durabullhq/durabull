import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { EditJobDataDialogContent } from '@/components/edit-job-data-dialog-content'
import { Dialog } from '@/components/ui/dialog'
import { payload } from '../fixtures/data'

const meta = {
  title: 'Web Components/Edit Job Data Dialog Content',
  component: EditJobDataDialogContent,
  render: (args) => (
    <Dialog open>
      <EditJobDataDialogContent {...args} />
    </Dialog>
  ),
  args: {
    jobId: 'job-1042',
    jobName: 'send-receipt',
    originalJobData: payload,
    jobStatus: 'failed',
    isSubmitting: false,
    onCancel: fn(),
    onSubmit: fn(async () => {}),
  },
} satisfies Meta<typeof EditJobDataDialogContent>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
