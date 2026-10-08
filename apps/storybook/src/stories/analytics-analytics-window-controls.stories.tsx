import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AnalyticsWindowControls } from '@/components/analytics/analytics-window-controls'

const meta = {
  title: 'Web Components/Analytics/Analytics Window Controls',
  component: AnalyticsWindowControls,
  args: { selectedWindow: '1h', isRefreshing: false, onWindowChange: fn(), onRefresh: fn() },
} satisfies Meta<typeof AnalyticsWindowControls>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
