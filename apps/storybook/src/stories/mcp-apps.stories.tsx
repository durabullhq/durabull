import type { Meta, StoryObj } from '@storybook/react-vite'
import { McpPreview } from '../mcp-preview'

const meta = {
  title: 'MCP Apps/Queue Explorer',
  component: McpPreview,
  args: { tool: 'list_connections', state: 'ready', theme: 'light' },
  argTypes: {
    theme: { control: 'inline-radio', options: ['light', 'dark'] },
    state: { control: 'select', options: ['ready', 'empty', 'loading', 'error'] },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Production MCP app in a sandboxed iframe. A real AppBridge supplies schema-checked demo tool results. Read tools stay local; mutation requests appear in Host activity for inspection.',
      },
    },
  },
} satisfies Meta<typeof McpPreview>
export default meta
type Story = StoryObj<typeof meta>
export const Connections: Story = {}
export const Overview: Story = { args: { tool: 'get_connection_overview' } }
export const Queues: Story = { args: { tool: 'list_queues' } }
export const QueueDetail: Story = { args: { tool: 'get_queue' } }
export const Jobs: Story = { args: { tool: 'list_jobs' } }
export const JobDetail: Story = { args: { tool: 'get_job' } }
export const Logs: Story = { args: { tool: 'get_job_logs' } }
export const Stacktraces: Story = { args: { tool: 'get_job_stacktraces' } }
export const Incidents: Story = { args: { tool: 'get_failure_events' } }
export const Workers: Story = { args: { tool: 'get_workers' } }
export const Schedules: Story = { args: { tool: 'list_scheduled_jobs' } }
export const ScheduleDetail: Story = { args: { tool: 'get_scheduled_job' } }
export const Metrics: Story = { args: { tool: 'get_queue_metrics' } }
export const RedisHealth: Story = { args: { tool: 'get_redis_health' } }
export const FailureExplanation: Story = { args: { tool: 'explain_job_failure' } }
export const AlertSummary: Story = { args: { tool: 'get_alert_summary' } }
export const Empty: Story = { args: { tool: 'list_queues', state: 'empty' } }
export const Connecting: Story = { args: { state: 'loading' } }
export const ReadError: Story = { args: { tool: 'list_queues', state: 'error' } }
export const Dark: Story = { args: { tool: 'get_connection_overview', theme: 'dark' } }
export const Compact: Story = { args: { tool: 'get_job', width: 390 } }
