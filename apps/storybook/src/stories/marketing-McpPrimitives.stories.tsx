import {
  AgentFrame,
  AgentMsg,
  McpUrl,
  ResultCard,
  ToolPill,
  UsedDurabull,
  UserMsg,
} from '@docs/components/mcp/primitives'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/MCP / Primitives/McpUrl',
  component: McpUrl,
  args: {},
  parameters: { layout: 'padded' },
} satisfies Meta<typeof McpUrl>
export default meta
export const Default: StoryObj<typeof meta> = {}
export const ToolPills: StoryObj<typeof meta> = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <ToolPill name="get_connection_overview" />
      <ToolPill name="retry_job" write />
    </div>
  ),
}
export const Conversation: StoryObj<typeof meta> = {
  render: () => (
    <AgentFrame className="max-w-lg">
      <UserMsg>Job 48213 failed. Why?</UserMsg>
      <UsedDurabull tools={['find_job', 'explain_job_failure']} />
      <AgentMsg>All 3 attempts hit the same SMTP rate limit.</AgentMsg>
      <ResultCard
        title="job 48213 · send-receipt"
        status="Failed"
        tone="bad"
        rows={[
          ['Strongest signal', '421 4.7.0 rate limited'],
          ['Attempts', '3 of 3'],
        ]}
      />
    </AgentFrame>
  ),
}
