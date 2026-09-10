/**
 * Prompt templates package the multi-tool workflows operators run most often. They contain no
 * data and perform no I/O; each renders instructions that reference catalog tools by name.
 */

export interface McpPromptArgument {
  name: string
  description: string
  required: boolean
}

export interface McpPromptDefinition {
  name: string
  title: string
  description: string
  arguments: readonly McpPromptArgument[]
  render: (args: Record<string, string | undefined>) => string
}

const connectionIdArgument: McpPromptArgument = {
  name: 'connectionId',
  description: 'Connection id from list_connections.',
  required: true,
}

const queueNameArgument: McpPromptArgument = {
  name: 'queueName',
  description: 'BullMQ queue name.',
  required: true,
}

function bounded(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export const MCP_PROMPT_CATALOG: readonly McpPromptDefinition[] = [
  {
    name: 'triage_failed_jobs',
    title: 'Triage failed jobs in a queue',
    description:
      'Group recent failures in one queue by root cause, using job metadata, stacktraces, logs, and related alerts, and recommend next steps.',
    arguments: [
      connectionIdArgument,
      queueNameArgument,
      {
        name: 'limit',
        description: 'How many recent failed jobs to inspect (1-50, default 10).',
        required: false,
      },
    ],
    render: (args) => {
      const limit = bounded(args.limit, 10, 1, 50)
      return [
        `Triage failed jobs in queue "${args.queueName}" on connection ${args.connectionId}.`,
        '',
        'Steps:',
        `1. Call get_queue to confirm the queue exists and read its failed count and worker list.`,
        `2. Call list_jobs with status "failed" and pageSize ${limit} to fetch the most recent failures.`,
        '3. For each distinct failedReason (or for the first few jobs if reasons are empty), call explain_job_failure to get the top signal, stacktrace excerpt, recent log lines, and related alert events.',
        '4. Group the failures by root cause. For each group report: count, representative job id, the error, whether attempts are exhausted (attemptsMade vs maxAttempts), and the first and last failure times.',
        '5. Call get_failure_events with the queueName and status "firing" to see whether an alert is already open for this queue.',
        '6. Finish with a short recommendation per group: retry (safe when the cause was transient), fix code or config first, or ignore. Do not retry or mutate anything unless explicitly asked; if asked, retry_job requires the mcp:jobs:retry scope.',
        '',
        'Report findings as a table grouped by root cause, then the recommendations.',
      ].join('\n')
    },
  },
  {
    name: 'investigate_queue_backlog',
    title: 'Investigate a queue backlog',
    description:
      'Determine why a queue is backing up: paused state, missing or idle workers, throughput trend, failure streaks, and Redis pressure.',
    arguments: [connectionIdArgument, queueNameArgument],
    render: (args) =>
      [
        `Investigate why queue "${args.queueName}" on connection ${args.connectionId} is backing up.`,
        '',
        'Steps:',
        '1. Call get_queue. Note isPaused, waiting, active, delayed, and prioritized counts, and how many workers are attached and their idle time.',
        '2. Call get_queue_metrics with windowMinutes 60. Compare avgCompletedPerMinuteInWindow against the waiting count and read estimatedDrainMinutes, failureRateInWindow, and longestFailureStreakMinutesInWindow.',
        '3. If workers are attached but idle while jobs wait, suspect rate limiting, a paused queue, or jobs stuck in a waiting-children state; check list_jobs with status "waiting-children" and "delayed".',
        '4. If no workers are attached, say so plainly. That is the most common cause.',
        '5. Call get_redis_health to rule out Redis memory pressure, evictions, rejected connections, or high blocked_clients.',
        '6. Call get_failure_events with the queueName to see whether a queue_stalled or failure alert is already firing.',
        '',
        'Report: the most likely cause first with the evidence for it, then secondary factors, then concrete next steps. Do not pause, resume, or promote anything unless explicitly asked.',
      ].join('\n'),
  },
  {
    name: 'alert_activity_review',
    title: 'Review alert activity',
    description:
      'Summarize open incidents on a connection, what is acknowledged, noisy rules, and snoozed or disabled rules that may be hiding problems.',
    arguments: [
      connectionIdArgument,
      {
        name: 'recentEvents',
        description: 'How many recent events to review across statuses (10-100, default 50).',
        required: false,
      },
    ],
    render: (args) => {
      const recent = bounded(args.recentEvents, 50, 10, 100)
      return [
        `Review alert activity on connection ${args.connectionId}.`,
        '',
        'Steps:',
        '1. Call get_alert_summary for open counts by queue and by rule and the rule state counts.',
        '2. Call list_alert_rules. Flag rules that are snoozed or disabled and rules with a high openEventCount.',
        `3. Call get_failure_events with pageSize ${recent} (no status filter) to read the most recent events across firing, resolved, and suppressed. Suppressed events indicate a rule that is firing repeatedly inside its cooldown.`,
        '4. For each firing event that is unacknowledged, call get_alert_event to check whether notifications were delivered or are failing.',
        '',
        'Report: open incidents that need a human (unacknowledged, notification failures), rules that look noisy, rules that are muted and why that matters, and anything that resolved recently. Do not acknowledge, resolve, or snooze unless explicitly asked; those need mcp:failures:write.',
      ].join('\n')
    },
  },
  {
    name: 'connection_health_check',
    title: 'Connection health check',
    description:
      'A quick end-to-end health read of one connection: discovery, backlog, failures, workers, Redis health, and open alerts.',
    arguments: [connectionIdArgument],
    render: (args) =>
      [
        `Run a health check on connection ${args.connectionId}.`,
        '',
        'Steps:',
        '1. Call get_connection_overview. It aggregates discovery state, job counts across queues, paused queues, queues with backlog but no workers, top failing queues, worker totals, open alert counts, and the latest Redis sample.',
        '2. For each queue named in topFailed or withoutWorkers, call get_queue for detail.',
        '3. If redisHealth shows memoryUsagePercent above 80, connectedClients near maxClients, or blockedClients above 0, call get_redis_health for the trend.',
        '4. If alerts.open is greater than 0, call get_alert_summary and then get_failure_events with status "firing".',
        '',
        'Report a traffic-light summary (healthy, degraded, unhealthy) with the two or three facts that drove the verdict, then the details. Read-only: do not change anything.',
      ].join('\n'),
  },
]

export const MCP_PROMPT_NAMES: readonly string[] = MCP_PROMPT_CATALOG.map((prompt) => prompt.name)

export function getMcpPromptDefinition(name: string): McpPromptDefinition | null {
  return MCP_PROMPT_CATALOG.find((prompt) => prompt.name === name) ?? null
}
