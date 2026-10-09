import { AgentDemo } from '@docs/components/mcp/agent-demo'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/MCP / Agent demo/AgentDemo',
  component: AgentDemo,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AgentDemo>
export default meta
export const Default: StoryObj<typeof meta> = {}
