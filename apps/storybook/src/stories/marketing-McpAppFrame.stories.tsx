import { McpAppFrame } from '@docs/components/mcp/mcp-app-frame'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/MCP / Apps/McpAppFrame',
  component: McpAppFrame,
  args: { tool: 'get_connection_overview', host: 'claude', theme: 'dark' },
  argTypes: {
    host: { control: 'inline-radio', options: ['claude', 'chatgpt'] },
    theme: { control: 'inline-radio', options: ['light', 'dark'] },
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof McpAppFrame>
export default meta
type Story = StoryObj<typeof meta>
export const Overview: Story = {}
export const FailureInvestigationChatGPT: Story = {
  args: { tool: 'explain_job_failure', host: 'chatgpt', theme: 'light' },
}
export const RedisHealth: Story = { args: { tool: 'get_redis_health' } }
