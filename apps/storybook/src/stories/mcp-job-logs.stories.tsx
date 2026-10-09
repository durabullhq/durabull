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
  title: 'MCP Apps/Job logs',
  component: McpPreview,
  args: { tool: 'get_job_logs' },
  argTypes: mcpArgTypes,
  parameters: mcpDocs('Redacted job log lines.'),
} satisfies Meta<typeof McpPreview>
export default meta
type Story = StoryObj<typeof meta>

export const InChatGPT: Story = { name: 'In ChatGPT' }
export const InChatGPTDark: Story = { ...inChatGptDark, name: 'In ChatGPT Dark' }
export const InClaude: Story = inClaude
export const InClaudeDark: Story = inClaudeDark
export const OnPhone: Story = onPhone
