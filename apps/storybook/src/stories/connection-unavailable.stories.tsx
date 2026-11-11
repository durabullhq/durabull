import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConnectionUnavailable } from '@/components/connection-unavailable'

const meta = {
  title: 'Web Components/Connection Unavailable',
  component: ConnectionUnavailable,
  args: {
    orgSlug: 'acme',
    connectionId: 'demo-staging',
    connectionName: 'Staging',
    reason: 'paused',
    showRulesLink: true,
  },
  parameters: { billingScenario: 'paused' },
} satisfies Meta<typeof ConnectionUnavailable>
export default meta
type Story = StoryObj<typeof meta>
export const PausedByPlan: Story = {}
export const Disabled: Story = { args: { reason: 'disabled' } }
