import { McpHero, McpStats } from '@docs/components/mcp/mcp-hero'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/MCP / Hero/McpHero',
  component: McpHero,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof McpHero>
export default meta
export const Default: StoryObj<typeof meta> = {}
export const Stats: StoryObj<typeof meta> = { render: () => <McpStats /> }
