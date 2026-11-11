import type { Meta, StoryObj } from '@storybook/react-vite'
import { FailedAttempts } from '@/components/failed-attempts'
import { job } from '../fixtures/data'

const meta = {
  title: 'Web Components/Failed Attempts',
  component: FailedAttempts,
  args: {
    queueName: 'email:receipts',
    jobId: 'job-1042',
    attemptsMade: 3,
    maxAttempts: 3,
    stacktraceCount: 3,
    failedReason: job.failedReason,
    status: 'failed',
  },
} satisfies Meta<typeof FailedAttempts>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
/** A job that later succeeded: failures read as history, without the danger headline. */
export const History: Story = { args: { status: 'completed', attemptsMade: 3, maxAttempts: 4 } }
