import type { Meta, StoryObj } from '@storybook/react-vite'
import { RedisHealthObservability } from '@/components/analytics/redis-health-observability'
import { redisHealth } from '../fixtures/analytics'

const meta = {
  title: 'Web Components/Analytics/Redis Health Observability',
  component: RedisHealthObservability,
  args: { data: redisHealth },
} satisfies Meta<typeof RedisHealthObservability>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Loading: Story = { args: { isLoading: true } }
export const Unavailable: Story = { args: { error: new Error('Demo Redis unavailable') } }
