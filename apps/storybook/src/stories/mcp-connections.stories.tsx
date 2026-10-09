import type { Meta, StoryObj } from '@storybook/react-vite'
import type { McpPreview } from '../mcp-preview'
import { inChatGpt, inChatGptDark, inClaude, inClaudeDark, mcpCard, onPhone } from '../mcp-stories'

const meta = {
  title: 'MCP Apps/Connections',
  ...mcpCard(
    'list_connections',
    'Connection picker shown when the assistant lists Durabull connections.'
  ),
} satisfies Meta<typeof McpPreview>
export default meta
type Story = StoryObj<typeof meta>

export const InChatGPT: Story = inChatGpt
export const InChatGPTDark: Story = inChatGptDark
export const InClaude: Story = inClaude
export const InClaudeDark: Story = inClaudeDark
export const OnPhone: Story = onPhone
export const Empty: Story = { args: { state: 'empty' } }
export const Connecting: Story = { args: { state: 'loading' } }
export const ReadError: Story = { args: { state: 'error', tool: 'list_queues' } }
