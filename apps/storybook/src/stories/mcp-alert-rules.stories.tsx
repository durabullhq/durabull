import type { Meta, StoryObj } from '@storybook/react-vite'
import type { McpPreview } from '../mcp-preview'
import { inChatGpt, inChatGptDark, inClaude, inClaudeDark, mcpCard, onPhone } from '../mcp-stories'

const meta = {
  title: 'MCP Apps/Alert rules',
  ...mcpCard('list_alert_rules', 'Configured alert rules and their state.'),
} satisfies Meta<typeof McpPreview>
export default meta
type Story = StoryObj<typeof meta>

export const InChatGPT: Story = inChatGpt
export const InChatGPTDark: Story = inChatGptDark
export const InClaude: Story = inClaude
export const InClaudeDark: Story = inClaudeDark
export const OnPhone: Story = onPhone
