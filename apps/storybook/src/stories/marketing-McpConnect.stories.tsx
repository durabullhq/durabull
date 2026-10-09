import { McpConnect } from '@docs/components/mcp/mcp-connect'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/MCP / Connect/McpConnect',
  component: McpConnect,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof McpConnect>
export default meta
export const Default: StoryObj<typeof meta> = {}
