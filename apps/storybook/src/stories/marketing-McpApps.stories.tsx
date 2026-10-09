import { McpApps } from '@docs/components/mcp/mcp-apps'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/MCP / Apps/McpApps',
  component: McpApps,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof McpApps>
export default meta
export const Default: StoryObj<typeof meta> = {}
