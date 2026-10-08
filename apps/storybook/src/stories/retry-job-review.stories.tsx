import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { RetryJobReview } from '@/components/retry-job-review'
import { payload } from '../fixtures/data'

const meta = {
  title: 'Web Components/Retry Job Review',
  component: RetryJobReview,
  args: { jobData: payload, onCancel: fn(), onRetry: fn() },
} satisfies Meta<typeof RetryJobReview>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
