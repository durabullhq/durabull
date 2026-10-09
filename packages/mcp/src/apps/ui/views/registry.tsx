import type { ReactNode } from 'react'
import { Header, Payload } from '../components'
import type { View } from '../explorer'
import { title } from '../format'
import { AlertEvent, AlertEvents, Incidents, Rule, Rules } from './alerts'
import { Connections, Overview } from './connection'
import { RedisHealth } from './health'
import { Explanation, FindJob, Job, Jobs, Logs, Stacktraces } from './jobs'
import { Operation } from './operation'
import { Metrics, Queue, Queues, Workers } from './queues'
import { Schedule, Schedules } from './schedules'

type Render = (view: View) => ReactNode

/**
 * The single map from tool name to card. Mutation results reuse the affected entity's
 * card with a receipt line; every key must be a tool in the server catalog.
 */
export const VIEWS = {
  list_connections: ({ data }) => <Connections data={data} />,
  get_connection_overview: ({ data }) => <Overview data={data} />,
  list_queues: ({ data }) => <Queues data={data} />,
  get_queue: ({ data }) => <Queue data={data} />,
  get_workers: ({ data }) => <Workers data={data} />,
  get_queue_metrics: ({ data }) => <Metrics data={data} />,
  list_jobs: ({ data, args }) => <Jobs data={data} args={args} />,
  find_job: ({ data, args }) => <FindJob data={data} args={args} />,
  get_job: ({ data }) => <Job data={data} />,
  get_job_logs: ({ data }) => <Logs data={data} />,
  get_job_stacktraces: ({ data }) => <Stacktraces data={data} />,
  explain_job_failure: ({ data }) => <Explanation data={data} />,
  list_scheduled_jobs: ({ data, args }) => <Schedules data={data} args={args} />,
  get_scheduled_job: ({ data }) => <Schedule data={data} />,
  get_alert_summary: ({ data }) => <Incidents data={data} />,
  get_failure_events: ({ data }) => <AlertEvents data={data} />,
  get_alert_event: ({ data }) => <AlertEvent data={data} />,
  resolve_alert_event: ({ data }) => <AlertEvent data={data} receipt="Alert resolved" />,
  acknowledge_alert_event: ({ data }) => <AlertEvent data={data} receipt="Alert acknowledged" />,
  unacknowledge_alert_event: ({ data }) => (
    <AlertEvent data={data} receipt="Acknowledgement cleared" />
  ),
  list_alert_rules: ({ data }) => <Rules data={data} />,
  get_alert_rule: ({ data }) => <Rule data={data} />,
  snooze_alert_rule: ({ data }) => <Rule data={data} receipt="Rule snoozed" />,
  unsnooze_alert_rule: ({ data }) => <Rule data={data} receipt="Snooze cleared" />,
  get_redis_health: ({ data }) => <RedisHealth data={data} />,
  retry_job: (view) => <Operation view={view} heading="Retry requested" />,
  promote_job: (view) => <Operation view={view} heading="Promotion requested" />,
  pause_queue: (view) => <Operation view={view} heading="Queue paused" />,
  resume_queue: (view) => <Operation view={view} heading="Queue resumed" />,
} satisfies Record<string, Render>

export type ToolName = keyof typeof VIEWS
export const isToolName = (tool: string): tool is ToolName => Object.hasOwn(VIEWS, tool)

/** Render the card for a snapshot, falling back to its structured result for unknown tools. */
export function renderView(view: View) {
  if (isToolName(view.tool)) return VIEWS[view.tool](view)
  return (
    <>
      <Header eyebrow="Durabull" heading={title(view.tool)} />
      <Payload label="Structured result" value={view.data} defaultOpen />
    </>
  )
}
