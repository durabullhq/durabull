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
  title: 'MCP Apps/Operation receipt',
  component: McpPreview,
  args: { tool: 'retry_job' },
  argTypes: mcpArgTypes,
  parameters: mcpDocs(
    'Receipt shown after the assistant performs a write. Refresh reads state; it never repeats the write.'
  ),
} satisfies Meta<typeof McpPreview>
export default meta
type Story = StoryObj<typeof meta>

export const JobRetried: Story = {}
export const InChatGPTDark: Story = { ...inChatGptDark, name: 'In ChatGPT Dark' }
export const InClaude: Story = inClaude
export const InClaudeDark: Story = inClaudeDark
export const OnPhone: Story = onPhone
export const JobPromoted: Story = { args: { tool: 'promote_job' } }
export const QueuePaused: Story = { args: { tool: 'pause_queue' } }
export const QueueResumed: Story = { args: { tool: 'resume_queue' } }
