import { McpSafety } from '@docs/components/mcp/mcp-safety'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/MCP / Safety/McpSafety',
  component: McpSafety,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof McpSafety>
export default meta
export const Default: StoryObj<typeof meta> = {}
