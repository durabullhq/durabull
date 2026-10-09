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
  title: 'MCP Apps/Alert rule',
  component: McpPreview,
  args: { tool: 'get_alert_rule' },
  argTypes: mcpArgTypes,
  parameters: mcpDocs('One alert rule with recent events and configuration.'),
} satisfies Meta<typeof McpPreview>
export default meta
type Story = StoryObj<typeof meta>

export const InChatGPT: Story = { name: 'In ChatGPT' }
export const InChatGPTDark: Story = { ...inChatGptDark, name: 'In ChatGPT Dark' }
export const InClaude: Story = inClaude
export const InClaudeDark: Story = inClaudeDark
export const OnPhone: Story = onPhone
export const Snoozed: Story = { args: { tool: 'snooze_alert_rule' } }
export const Unsnoozed: Story = { args: { tool: 'unsnooze_alert_rule' } }
