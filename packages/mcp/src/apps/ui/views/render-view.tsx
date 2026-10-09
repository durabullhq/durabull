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

/** Select a card by tool name, falling back to the structured result. */
export function renderView(view: View) {
  const { tool, data, args } = view
  switch (tool) {
    case 'list_connections':
      return <Connections data={data} />
    case 'get_connection_overview':
      return <Overview data={data} />
    case 'list_queues':
      return <Queues data={data} />
    case 'get_queue':
      return <Queue data={data} />
    case 'get_workers':
      return <Workers data={data} />
    case 'get_queue_metrics':
      return <Metrics data={data} />
    case 'list_jobs':
      return <Jobs data={data} args={args} />
    case 'find_job':
      return <FindJob data={data} args={args} />
    case 'get_job':
      return <Job data={data} />
    case 'get_job_logs':
      return <Logs data={data} />
    case 'get_job_stacktraces':
      return <Stacktraces data={data} />
    case 'explain_job_failure':
      return <Explanation data={data} />
    case 'list_scheduled_jobs':
      return <Schedules data={data} args={args} />
    case 'get_scheduled_job':
      return <Schedule data={data} />
    case 'get_alert_summary':
      return <Incidents data={data} />
    case 'get_failure_events':
      return <AlertEvents data={data} />
    case 'get_alert_event':
    case 'resolve_alert_event':
    case 'acknowledge_alert_event':
    case 'unacknowledge_alert_event':
      return <AlertEvent data={data} tool={tool} />
    case 'list_alert_rules':
      return <Rules data={data} />
    case 'get_alert_rule':
    case 'snooze_alert_rule':
    case 'unsnooze_alert_rule':
      return <Rule data={data} tool={tool} />
    case 'get_redis_health':
      return <RedisHealth data={data} />
    case 'retry_job':
    case 'promote_job':
    case 'pause_queue':
    case 'resume_queue':
      return <Operation view={view} />
    default:
      return (
        <>
          <Header eyebrow="Durabull" heading={title(tool)} />
          <Payload label="Structured result" value={data} open />
        </>
      )
  }
}
