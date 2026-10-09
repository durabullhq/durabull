import { McpCapabilities } from '@docs/components/mcp/mcp-capabilities'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/MCP / Capabilities/McpCapabilities',
  component: McpCapabilities,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof McpCapabilities>
export default meta
export const Default: StoryObj<typeof meta> = {}
