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
  title: 'MCP Apps/Connections',
  component: McpPreview,
  args: { tool: 'list_connections' },
  argTypes: mcpArgTypes,
  parameters: mcpDocs('Connection picker shown when the assistant lists Durabull connections.'),
} satisfies Meta<typeof McpPreview>
export default meta
type Story = StoryObj<typeof meta>

export const InChatGPT: Story = { name: 'In ChatGPT' }
export const InChatGPTDark: Story = { ...inChatGptDark, name: 'In ChatGPT Dark' }
export const InClaude: Story = inClaude
export const InClaudeDark: Story = inClaudeDark
export const OnPhone: Story = onPhone
export const Empty: Story = { args: { state: 'empty' } }
export const Connecting: Story = { args: { state: 'loading' } }
export const ReadError: Story = { args: { state: 'error', tool: 'list_queues' } }
