import type { Meta, StoryObj } from '@storybook/react-vite'
import type { McpPreview } from '../mcp-preview'
import { inChatGpt, inChatGptDark, inClaude, inClaudeDark, mcpCard, onPhone } from '../mcp-stories'

const meta = {
  title: 'MCP Apps/Job list',
  ...mcpCard('list_jobs', 'Jobs in a queue, filterable by state.'),
} satisfies Meta<typeof McpPreview>
export default meta
type Story = StoryObj<typeof meta>

export const InChatGPT: Story = inChatGpt
export const InChatGPTDark: Story = inChatGptDark
export const InClaude: Story = inClaude
export const InClaudeDark: Story = inClaudeDark
export const OnPhone: Story = onPhone
export const FailedOnly: Story = { args: { args: { status: 'failed' } } }
export const Empty: Story = { args: { state: 'empty' } }
