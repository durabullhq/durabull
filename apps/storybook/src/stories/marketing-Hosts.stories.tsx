import { HostRow, TrademarkNote } from '@docs/components/mcp/hosts'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/MCP / Hosts/HostRow',
  component: HostRow,
  args: {},
  parameters: { layout: 'padded' },
} satisfies Meta<typeof HostRow>
export default meta
export const Default: StoryObj<typeof meta> = {}
export const Trademarks: StoryObj<typeof meta> = {
  render: () => <TrademarkNote className="max-w-xl" />,
}
