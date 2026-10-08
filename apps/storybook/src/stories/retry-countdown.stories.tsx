import type { Meta, StoryObj } from '@storybook/react-vite'
import { RetryCountdown } from '@/components/retry-countdown'

const meta = {
  title: 'Web Components/Retry Countdown',
  component: RetryCountdown,
  args: {
    attemptsMade: 1,
    maxAttempts: 3,
    status: 'failed',
    processedOn: Date.now(),
    backoff: { type: 'exponential', delay: 300000 },
  },
} satisfies Meta<typeof RetryCountdown>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
