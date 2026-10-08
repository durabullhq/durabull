import type { Meta, StoryObj } from '@storybook/react-vite'
import { DeleteJobLogsButton } from '@/components/delete-job-logs-button'

const meta = {
  title: 'Web Components/Delete Job Logs Button',
  component: DeleteJobLogsButton,
  args: { queueName: 'email:receipts', jobId: 'job-1042', logCount: 2 },
} satisfies Meta<typeof DeleteJobLogsButton>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
