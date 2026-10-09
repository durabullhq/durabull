import { McpFaq, McpFinalCta, McpWorksWith } from '@docs/components/mcp/mcp-closing'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/MCP / Closing/McpWorksWith',
  component: McpWorksWith,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof McpWorksWith>
export default meta
export const Default: StoryObj<typeof meta> = {}
export const Faq: StoryObj<typeof meta> = { render: () => <McpFaq /> }
export const FinalCta: StoryObj<typeof meta> = { render: () => <McpFinalCta /> }
