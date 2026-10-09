import type { Meta, StoryObj } from '@storybook/react-vite'
import type { McpPreview } from '../mcp-preview'
import { inChatGptDark, inClaude, inClaudeDark, mcpCard, onPhone } from '../mcp-stories'

const meta = {
  title: 'MCP Apps/Operation receipt',
  ...mcpCard(
    'retry_job',
    'Receipt shown after the assistant performs a write. Refresh reads state; it never repeats the write.'
  ),
} satisfies Meta<typeof McpPreview>
export default meta
type Story = StoryObj<typeof meta>

export const JobRetried: Story = {}
export const InChatGPTDark: Story = inChatGptDark
export const InClaude: Story = inClaude
export const InClaudeDark: Story = inClaudeDark
export const OnPhone: Story = onPhone
export const JobPromoted: Story = { args: { tool: 'promote_job' } }
export const QueuePaused: Story = { args: { tool: 'pause_queue' } }
export const QueueResumed: Story = { args: { tool: 'resume_queue' } }
