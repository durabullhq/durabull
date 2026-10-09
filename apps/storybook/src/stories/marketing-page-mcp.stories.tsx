import type { Meta, StoryObj } from '@storybook/react-vite'
import McpPage from '../../../docs/app/(home)/mcp/page'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Pages/MCP',
  component: McpPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof McpPage>
export default meta
export const Default: StoryObj<typeof meta> = {}
