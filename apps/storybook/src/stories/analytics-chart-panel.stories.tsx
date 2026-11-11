import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChartEmptyState, ChartPanel } from '@/components/analytics/chart-panel'

const meta = {
  title: 'Web Components/Analytics/Chart Panel',
  component: ChartPanel,
  args: {
    title: 'Failure rate by queue',
    meta: '% of finished · top 10',
    hint: 'Queues with the highest share of failed jobs among those finished in the selected window.',
    children: (
      <ChartEmptyState
        tone="success"
        title="No failures in this window"
        description="212 jobs finished without a failure."
      />
    ),
  },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChartPanel>
export default meta
type Story = StoryObj<typeof meta>
export const Empty: Story = {}
export const InsufficientData: Story = {
  args: {
    title: 'Finished jobs',
    meta: 'jobs/min',
    hint: undefined,
    children: (
      <ChartEmptyState
        title="No metric points in this window"
        description="BullMQ records a point for each minute a queue finishes jobs."
      />
    ),
  },
}
