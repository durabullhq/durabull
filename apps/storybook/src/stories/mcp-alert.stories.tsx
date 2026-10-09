import type { Meta, StoryObj } from '@storybook/react-vite'
import { McpPreview } from '../mcp-preview'
import {
  inChatGptDark,
  inClaude,
  inClaudeDark,
  mcpArgTypes,
  mcpDocs,
  onPhone,
} from '../mcp-stories'

const meta = {
  title: 'MCP Apps/Alert',
  component: McpPreview,
  args: { tool: 'get_alert_event' },
  argTypes: mcpArgTypes,
  parameters: mcpDocs(
    'One alert event with delivery status and assistant-mediated acknowledgement.'
  ),
} satisfies Meta<typeof McpPreview>
export default meta
type Story = StoryObj<typeof meta>

export const InChatGPT: Story = { name: 'In ChatGPT' }
export const InChatGPTDark: Story = { ...inChatGptDark, name: 'In ChatGPT Dark' }
export const InClaude: Story = inClaude
export const InClaudeDark: Story = inClaudeDark
export const OnPhone: Story = onPhone
export const Resolved: Story = { args: { tool: 'resolve_alert_event' } }
export const Acknowledged: Story = { args: { tool: 'acknowledge_alert_event' } }
export const Unacknowledged: Story = { args: { tool: 'unacknowledge_alert_event' } }
