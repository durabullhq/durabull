import type { Meta, StoryObj } from '@storybook/react-vite'
import type { McpPreview } from '../mcp-preview'
import { inChatGpt, inChatGptDark, inClaude, inClaudeDark, mcpCard, onPhone } from '../mcp-stories'

const meta = {
  title: 'MCP Apps/Alert',
  ...mcpCard(
    'get_alert_event',
    'One alert event with delivery status and assistant-mediated acknowledgement.'
  ),
} satisfies Meta<typeof McpPreview>
export default meta
type Story = StoryObj<typeof meta>

export const InChatGPT: Story = inChatGpt
export const InChatGPTDark: Story = inChatGptDark
export const InClaude: Story = inClaude
export const InClaudeDark: Story = inClaudeDark
export const OnPhone: Story = onPhone
export const Resolved: Story = { args: { tool: 'resolve_alert_event' } }
export const Acknowledged: Story = { args: { tool: 'acknowledge_alert_event' } }
export const Unacknowledged: Story = { args: { tool: 'unacknowledge_alert_event' } }
