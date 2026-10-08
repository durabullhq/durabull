import type { Meta, StoryObj } from '@storybook/react-vite'
import { RedisHealthCharts } from '@/components/analytics/redis-health-charts'
import { redisHealth } from '../fixtures/analytics'

const meta = {
  title: 'Web Components/Analytics/Redis Health Charts',
  component: RedisHealthCharts,
  args: {
    series: redisHealth.series,
    thresholds: redisHealth.thresholds,
    bucketMinutes: redisHealth.range.bucketMinutes,
  },
} satisfies Meta<typeof RedisHealthCharts>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
