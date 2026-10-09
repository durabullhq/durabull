import { QueueExplorer } from '@docs/components/mcp/queue-explorer'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/MCP / Queue Explorer/QueueExplorer',
  component: QueueExplorer,
  args: { initialView: 'overview', theme: 'light' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof QueueExplorer>
export default meta
type Story = StoryObj<typeof meta>
export const Overview: Story = {}
export const RedisHealthDark: Story = { args: { initialView: 'redis', theme: 'dark' } }
export const Rules: Story = { args: { initialView: 'rules' } }
export const FailureInvestigation: Story = {
  args: { initialView: 'investigation', showSearch: false },
}
