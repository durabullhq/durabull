import { AgentHub, HostGrid } from '@docs/components/mcp/agent-hub'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/MCP / Agent Hub/AgentHub',
  component: AgentHub,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AgentHub>
export default meta
export const Default: StoryObj<typeof meta> = {
  render: () => (
    <div className="px-8 pb-12 pt-16">
      <AgentHub />
    </div>
  ),
}
export const Dark: StoryObj<typeof meta> = {
  render: () => (
    <div className="v2-dark px-8 pb-12 pt-16">
      <AgentHub />
    </div>
  ),
}
export const Hosts: StoryObj<typeof meta> = {
  render: () => (
    <div className="p-8">
      <HostGrid />
    </div>
  ),
}
