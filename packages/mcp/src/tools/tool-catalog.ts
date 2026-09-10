import { z } from 'zod'

import {
  MCP_SCOPE_DIAGNOSTICS_READ,
  MCP_SCOPE_DISCOVER,
  MCP_SCOPE_FAILURES_READ,
  MCP_SCOPE_FAILURES_WRITE,
  MCP_SCOPE_JOBS_PROMOTE,
  MCP_SCOPE_JOBS_READ,
  MCP_SCOPE_JOBS_RETRY,
  MCP_SCOPE_LOGS_READ,
  MCP_SCOPE_QUEUES_PAUSE,
} from '../auth/scopes'

/**
 * Single source of truth for every MCP tool: name, human-readable metadata, required OAuth
 * scopes, behavioural annotations, and input/output schemas.
 *
 * - `packages/mcp` registers tools from this catalog (descriptions, annotations, schemas).
 * - `apps/api` policy engine reads `requiredScopes` from it (fail-closed on unknown tools).
 * - `apps/api` rate limiting reads `heavy` from it.
 * - Docs tables are checked against it in tests.
 */

// ---------------------------------------------------------------------------
// Shared argument schemas
// ---------------------------------------------------------------------------

const connectionIdArg = z
  .string()
  .min(1)
  .describe('Connection id. Discover ids with list_connections.')
const queueNameArg = z.string().min(1).describe('BullMQ queue name (without prefix).')
const jobIdArg = z.string().min(1).describe('BullMQ job id.')
const cursorArg = z
  .string()
  .optional()
  .describe('Opaque pagination cursor returned as nextCursor by the previous page.')
const pageSizeArg = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe('Items per page (1-100, default 25).')

export const MCP_JOB_STATES = [
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'paused',
  'prioritized',
  'waiting-children',
] as const
export type McpJobState = (typeof MCP_JOB_STATES)[number]

const jobStateArg = z
  .enum(MCP_JOB_STATES)
  .optional()
  .describe('Filter to a single BullMQ job state. Omit to include every state.')

// ---------------------------------------------------------------------------
// Shared output fragments
// ---------------------------------------------------------------------------

const nullableIsoDate = z.string().nullable().describe('ISO-8601 timestamp or null.')
const nullableEpochMs = z.number().nullable().describe('Unix epoch milliseconds or null.')

export const jobCountsSchema = z.object({
  waiting: z.number(),
  active: z.number(),
  delayed: z.number(),
  completed: z.number(),
  failed: z.number(),
  paused: z.number(),
  prioritized: z.number(),
})

export const jobSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z
    .string()
    .describe('BullMQ job state (waiting, active, completed, failed, delayed, ...).'),
  attemptsMade: z.number(),
  maxAttempts: z.number(),
  failedReason: z.string().nullable(),
  processedOn: nullableEpochMs,
  finishedOn: nullableEpochMs,
  timestamp: nullableEpochMs.describe('Job creation time (epoch ms).'),
  delay: z.number(),
  priority: z.number(),
})

export const workerSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  ageMs: z.number(),
  idleMs: z.number(),
})

export const alertEventSummarySchema = z.object({
  id: z.string(),
  alertRuleId: z.string(),
  queueName: z.string(),
  type: z
    .string()
    .describe(
      'Alert rule type (failure_threshold, failure_rate, queue_stalled, job_failed, redis_health).'
    ),
  status: z.string().describe('firing, resolved, or suppressed.'),
  summary: z.string(),
  context: z.record(z.string(), z.unknown()).nullable(),
  firedAt: z.string(),
  resolvedAt: nullableIsoDate,
  acknowledgedAt: nullableIsoDate,
})

export const alertDeliverySummarySchema = z.object({
  id: z.string(),
  channelType: z.string(),
  status: z.string(),
  attemptCount: z.number(),
  lastError: z.string().nullable(),
  externalIdentifier: z.string().nullable(),
  externalUrl: z.string().nullable(),
  nextRetryAt: nullableIsoDate,
  updatedAt: z.string(),
})

export const alertEventDetailSchema = alertEventSummarySchema.extend({
  resolutionReason: z.string().nullable(),
  notificationSentAt: nullableIsoDate,
  deliveries: z.array(alertDeliverySummarySchema),
})

export const alertRuleSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  state: z.enum(['active', 'snoozed', 'disabled']),
  enabled: z.boolean(),
  mutedUntil: nullableIsoDate,
  queueName: z.string().nullable(),
  queueFilterMode: z.enum(['include', 'exclude']).nullable(),
  filterQueueNames: z.array(z.string()),
  cooldownMinutes: z.number(),
  config: z.record(z.string(), z.unknown()),
  notificationChannels: z.array(z.unknown()).describe('Channels with secrets removed.'),
  openEventCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const scheduledJobSummarySchema = z.object({
  schedulerId: z.string(),
  queueName: z.string(),
  jobName: z.string(),
  pattern: z.string().nullable().describe('Cron pattern, or null for interval schedulers.'),
  everyMs: z.number().nullable().describe('Interval in ms, or null for cron schedulers.'),
  timezone: z.string().nullable(),
  nextRunAt: nullableIsoDate,
  startDate: nullableIsoDate,
  endDate: nullableIsoDate,
  limit: z.number().nullable(),
  iterationCount: z.number().nullable(),
  recentFailedCount: z.number(),
  lastFailedAt: nullableIsoDate,
  data: z.unknown(),
  templateOptions: z.unknown(),
})

const redisHealthMetricsSchema = z.object({
  memoryUsagePercent: z.number().nullable(),
  usedMemoryBytes: z.number().nullable(),
  residentMemoryBytes: z.number().nullable(),
  memoryCapacityBytes: z.number().nullable(),
  cpuUsagePercent: z.number().nullable(),
  memoryFragmentationRatio: z.number().nullable(),
  memoryFragmentationBytes: z.number().nullable(),
  connectedClientsPercent: z.number().nullable(),
  connectedClients: z.number().nullable(),
  maxClients: z.number().nullable(),
  blockedClients: z.number().nullable(),
  evictedKeysPerMinute: z.number().nullable(),
  rejectedConnectionsPerMinute: z.number().nullable(),
})

// ---------------------------------------------------------------------------
// Output schemas (exported so handlers and tests can validate against them)
// ---------------------------------------------------------------------------

export const listConnectionsOutputSchema = z.object({
  connections: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      environment: z.string().nullable(),
      prefix: z.string(),
      isDefault: z.boolean(),
      organizationId: z.string(),
    })
  ),
  nextCursor: z.string().nullable(),
})

export const listQueuesOutputSchema = z.object({
  connectionId: z.string(),
  total: z.number(),
  queues: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['paused', 'active']),
      isPaused: z.boolean(),
      discoveryState: z.string(),
      jobCounts: jobCountsSchema,
    })
  ),
  nextCursor: z.string().nullable(),
})

export const getQueueOutputSchema = z.object({
  connectionId: z.string(),
  name: z.string(),
  status: z.enum(['paused', 'active']),
  isPaused: z.boolean(),
  scheduledJobsCount: z.number(),
  jobCounts: jobCountsSchema,
  workers: z.array(workerSchema),
})

export const listJobsOutputSchema = z.object({
  connectionId: z.string(),
  queueName: z.string(),
  total: z.number(),
  jobs: z.array(jobSummarySchema),
  nextCursor: z.string().nullable(),
})

export const findJobOutputSchema = z.object({
  connectionId: z.string(),
  jobId: z.string(),
  matches: z.array(
    z.object({
      queueName: z.string(),
      job: jobSummarySchema,
    })
  ),
  queuesScanned: z.number(),
  totalQueues: z.number(),
  truncated: z
    .boolean()
    .describe(
      'True when the connection has more queues than one call scans; narrow with list_jobs.'
    ),
})

export const getJobOutputSchema = z.object({
  connectionId: z.string(),
  queueName: z.string(),
  job: jobSummarySchema.extend({
    data: z.record(z.string(), z.unknown()),
    progress: z.unknown(),
    opts: z.record(z.string(), z.unknown()),
    returnvalue: z.unknown(),
    stacktraceCount: z.number(),
  }),
})

export const getJobLogsOutputSchema = z.object({
  connectionId: z.string(),
  queueName: z.string(),
  jobId: z.string(),
  logs: z.array(z.string()),
  total: z.number(),
  nextCursor: z.string().nullable(),
})

export const getJobStacktracesOutputSchema = z.object({
  connectionId: z.string(),
  queueName: z.string(),
  jobId: z.string(),
  total: z.number(),
  stacktraces: z.array(
    z.object({
      attemptNumber: z.number(),
      stacktrace: z.string(),
      isLatest: z.boolean(),
    })
  ),
  nextCursor: z.string().nullable(),
})

export const listScheduledJobsOutputSchema = z.object({
  connectionId: z.string(),
  queueName: z.string().nullable(),
  scheduledJobs: z.array(scheduledJobSummarySchema),
  total: z
    .number()
    .nullable()
    .describe('Total schedulers when a queueName was given; null for connection-wide scans.'),
  queuesScanned: z.number(),
  totalQueues: z.number(),
  nextCursor: z.string().nullable(),
})

export const getScheduledJobOutputSchema = z.object({
  connectionId: z.string(),
  scheduledJob: scheduledJobSummarySchema,
})

export const getFailureEventsOutputSchema = z.object({
  connectionId: z.string(),
  total: z.number(),
  events: z.array(alertEventSummarySchema),
  nextCursor: z.string().nullable(),
})

export const getAlertEventOutputSchema = z.object({
  connectionId: z.string(),
  event: alertEventDetailSchema,
})

export const alertEventMutationOutputSchema = z.object({
  connectionId: z.string(),
  event: alertEventSummarySchema,
})

export const listAlertRulesOutputSchema = z.object({
  connectionId: z.string(),
  total: z.number(),
  rules: z.array(alertRuleSummarySchema),
  nextCursor: z.string().nullable(),
})

export const getAlertRuleOutputSchema = z.object({
  connectionId: z.string(),
  rule: alertRuleSummarySchema,
  recentEvents: z.array(alertEventSummarySchema),
})

export const alertRuleMutationOutputSchema = z.object({
  connectionId: z.string(),
  rule: alertRuleSummarySchema,
})

export const getAlertSummaryOutputSchema = z.object({
  connectionId: z.string(),
  open: z.number().describe('Firing events, acknowledged or not.'),
  firing: z.number().describe('Firing events nobody has acknowledged.'),
  acknowledged: z.number(),
  byQueue: z
    .array(z.object({ queueName: z.string(), open: z.number() }))
    .describe('Descending by open count; at most 100 entries.'),
  byRule: z
    .array(z.object({ alertRuleId: z.string(), ruleName: z.string().nullable(), open: z.number() }))
    .describe('Descending by open count; at most 100 entries.'),
  rules: z.object({
    total: z.number(),
    active: z.number(),
    snoozed: z.number(),
    disabled: z.number(),
  }),
  truncated: z
    .boolean()
    .describe('True when more than 500 open events exist; breakdowns are partial.'),
})

export const getQueueMetricsOutputSchema = z.object({
  connectionId: z.string(),
  queueName: z.string(),
  range: z.object({
    requestedWindowMinutes: z.number().nullable(),
    returnedPoints: z.number(),
    oldestPointTimestamp: z.number().nullable(),
    newestPointTimestamp: z.number().nullable(),
    latestPointAgeMs: z.number().nullable(),
    requestedWindowCoverage: z.number().nullable(),
  }),
  totals: z.object({
    completedInWindow: z.number(),
    failedInWindow: z.number(),
    finishedInWindow: z.number(),
    successRateInWindow: z.number(),
    failureRateInWindow: z.number(),
    avgCompletedPerMinuteInWindow: z.number(),
    avgFailedPerMinuteInWindow: z.number(),
    longestFailureStreakMinutesInWindow: z.number(),
    longestCompletionStreakMinutesInWindow: z.number(),
    completedLifetime: z.number(),
    failedLifetime: z.number(),
    failureRateLifetime: z.number(),
    estimatedDrainMinutes: z.number().nullable(),
  }),
  counts: jobCountsSchema.extend({ waitingChildren: z.number() }),
  queue: z.object({
    isPaused: z.boolean(),
    isMaxed: z.boolean(),
    waitingToProcess: z.number(),
    workersCount: z.number(),
    schedulersCount: z.number(),
  }),
  warnings: z.array(z.string()),
})

export const getRedisHealthOutputSchema = z.object({
  connectionId: z.string(),
  collectionEnabled: z.boolean(),
  retentionDays: z.number(),
  staleAfterMs: z.number(),
  latest: redisHealthMetricsSchema
    .extend({
      capturedAt: z.string(),
      memoryCapacitySource: z.string(),
      isStale: z.boolean(),
    })
    .nullable(),
  thresholds: z.array(
    z.object({
      ruleId: z.string(),
      name: z.string(),
      metric: z.string(),
      threshold: z.number(),
    })
  ),
  range: z.object({
    from: z.string(),
    to: z.string(),
    bucketMinutes: z.number(),
    aggregation: z.literal('max'),
    totalBuckets: z.number(),
    sampledBuckets: z.number(),
    coveragePercent: z.number(),
  }),
  series: z.array(
    redisHealthMetricsSchema.extend({
      capturedAt: z.string(),
      sampleCount: z.number(),
    })
  ),
})

export const getWorkersOutputSchema = z.object({
  connectionId: z.string(),
  totalQueues: z.number(),
  totalWorkersInPage: z.number(),
  workers: z.array(workerSchema.extend({ queueName: z.string() })),
  queues: z.array(
    z.object({
      name: z.string(),
      workerCount: z.number(),
      status: z.enum(['paused', 'active']),
      jobCounts: z.object({ active: z.number(), waiting: z.number() }),
    })
  ),
  nextCursor: z.string().nullable(),
})

export const getConnectionOverviewOutputSchema = z.object({
  connectionId: z.string(),
  name: z.string(),
  environment: z.string().nullable(),
  prefix: z.string(),
  discovery: z.object({
    totalQueues: z.number(),
    confirmed: z.number(),
    pending: z.number(),
    lastDiscoveredAt: nullableIsoDate,
  }),
  queues: z.object({
    scanned: z.number(),
    truncated: z.boolean(),
    totals: jobCountsSchema,
    paused: z.array(z.string()).describe('At most 100 names; see warnings when capped.'),
    withoutWorkers: z
      .array(z.string())
      .describe('Scanned queues with waiting jobs but no workers (at most 100).'),
    topFailed: z.array(z.object({ name: z.string(), failed: z.number() })),
    topBacklog: z.array(z.object({ name: z.string(), waiting: z.number() })),
  }),
  workers: z.object({ total: z.number() }),
  alerts: z
    .object({ open: z.number(), firing: z.number(), acknowledged: z.number() })
    .nullable()
    .describe('Null when the caller lacks mcp:failures:read.'),
  redisHealth: z
    .object({
      capturedAt: z.string(),
      memoryUsagePercent: z.number().nullable(),
      cpuUsagePercent: z.number().nullable(),
      connectedClients: z.number().nullable(),
      blockedClients: z.number().nullable(),
    })
    .nullable()
    .describe('Null when unavailable or when the caller lacks mcp:diagnostics:read.'),
  warnings: z.array(z.string()),
})

export const explainJobFailureOutputSchema = z.object({
  connectionId: z.string(),
  queueName: z.string(),
  jobId: z.string(),
  status: z.string(),
  summary: z.string(),
  failedReason: z.string().nullable(),
  attemptTimeline: z.object({
    attemptsMade: z.number(),
    maxAttempts: z.number(),
    processedOn: nullableEpochMs,
    finishedOn: nullableEpochMs,
    timestamp: nullableEpochMs,
  }),
  topSignal: z.object({
    source: z.enum(['failed_reason', 'stacktrace', 'logs', 'none']),
    excerpt: z.string(),
  }),
  relatedAlertEvents: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      status: z.string(),
      summary: z.string(),
      firedAt: z.string(),
      context: z.record(z.string(), z.unknown()).nullable(),
    })
  ),
  recentLogLines: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(z.string()),
  skippedSources: z
    .array(z.object({ source: z.string(), reason: z.string() }))
    .describe('Evidence not consulted, typically because the token lacks a scope.'),
})

export const jobMutationOutputSchema = z.object({
  connectionId: z.string(),
  queueName: z.string(),
  jobId: z.string(),
  previousState: z.string(),
  state: z.string().describe('Job state after the operation.'),
})

export const queuePauseOutputSchema = z.object({
  connectionId: z.string(),
  queueName: z.string(),
  isPaused: z.boolean(),
  changed: z.boolean().describe('False when the queue was already in the requested state.'),
})

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface McpToolAnnotations {
  title: string
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint: boolean
  openWorldHint: boolean
}

export interface McpToolDefinition {
  name: string
  title: string
  description: string
  /** Every scope listed must be granted (and, for service accounts, bound) or the call is denied. */
  requiredScopes: readonly string[]
  /** Scopes that unlock additional evidence in the response when present; never required. */
  optionalScopes: readonly string[]
  annotations: McpToolAnnotations
  /** Heavy tools get the lower per-tool rate limit. */
  heavy: boolean
  inputSchema: Record<string, z.ZodType>
  outputSchema: z.ZodObject | null
}

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const WRITE_IDEMPOTENT_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const WRITE_NON_IDEMPOTENT_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const

function defineTool(definition: {
  name: string
  title: string
  description: string
  requiredScopes: readonly string[]
  optionalScopes?: readonly string[]
  annotations: Omit<McpToolAnnotations, 'title'>
  heavy?: boolean
  inputSchema: Record<string, z.ZodType>
  outputSchema: z.ZodObject | null
}): McpToolDefinition {
  return {
    ...definition,
    optionalScopes: definition.optionalScopes ?? [],
    heavy: definition.heavy ?? false,
    annotations: { title: definition.title, ...definition.annotations },
  }
}

export const MCP_TOOL_CATALOG: readonly McpToolDefinition[] = [
  defineTool({
    name: 'ping',
    title: 'Ping',
    description:
      'Health check for the MCP transport. Returns the text "pong". Requires only mcp:discover; use it to confirm authentication and connectivity before calling other tools.',
    requiredScopes: [MCP_SCOPE_DISCOVER],
    annotations: READ_ANNOTATIONS,
    inputSchema: {},
    outputSchema: null,
  }),

  // -- Connections & queues -------------------------------------------------
  defineTool({
    name: 'list_connections',
    title: 'List connections',
    description:
      'List the Redis connections the caller may access, with name, environment, BullMQ key prefix, and organization. Start here: every other tool needs a connectionId from this list.',
    requiredScopes: [MCP_SCOPE_JOBS_READ],
    annotations: READ_ANNOTATIONS,
    inputSchema: { cursor: cursorArg, pageSize: pageSizeArg },
    outputSchema: listConnectionsOutputSchema,
  }),
  defineTool({
    name: 'list_queues',
    title: 'List queues',
    description:
      'List discovered BullMQ queues on a connection with paused state and live job counts (waiting, active, delayed, completed, failed, paused, prioritized). Paginated and alphabetical.',
    requiredScopes: [MCP_SCOPE_JOBS_READ],
    annotations: READ_ANNOTATIONS,
    inputSchema: { connectionId: connectionIdArg, cursor: cursorArg, pageSize: pageSizeArg },
    outputSchema: listQueuesOutputSchema,
  }),
  defineTool({
    name: 'get_queue',
    title: 'Get queue',
    description:
      'Detail for one queue: paused state, job counts by state, number of job schedulers, and the workers currently attached (id, address, age, idle time).',
    requiredScopes: [MCP_SCOPE_JOBS_READ],
    annotations: READ_ANNOTATIONS,
    inputSchema: { connectionId: connectionIdArg, queueName: queueNameArg },
    outputSchema: getQueueOutputSchema,
  }),
  defineTool({
    name: 'get_connection_overview',
    title: 'Connection overview',
    description:
      'One-call health check for a connection: discovery status, aggregated job counts across up to 100 queues, paused queues, queues with backlog but no workers, top queues by failed and waiting jobs, total workers, and (when scopes allow) open alert counts and the latest Redis health sample. Use it first when asked "how is this system doing".',
    requiredScopes: [MCP_SCOPE_JOBS_READ],
    optionalScopes: [MCP_SCOPE_FAILURES_READ, MCP_SCOPE_DIAGNOSTICS_READ],
    annotations: READ_ANNOTATIONS,
    heavy: true,
    inputSchema: { connectionId: connectionIdArg },
    outputSchema: getConnectionOverviewOutputSchema,
  }),

  // -- Jobs -----------------------------------------------------------------
  defineTool({
    name: 'list_jobs',
    title: 'List jobs',
    description:
      'Paginated job summaries for one queue. Filter by state (status), a case-insensitive substring of the job name (name), or an exact job id (jobId). Name filtering scans up to 10,000 jobs, so combine it with status on large queues.',
    requiredScopes: [MCP_SCOPE_JOBS_READ],
    annotations: READ_ANNOTATIONS,
    inputSchema: {
      connectionId: connectionIdArg,
      queueName: queueNameArg,
      status: jobStateArg,
      name: z
        .string()
        .min(1)
        .optional()
        .describe('Case-insensitive substring match on the job name.'),
      jobId: z.string().min(1).optional().describe('Exact job id; returns at most one job.'),
      cursor: cursorArg,
      pageSize: pageSizeArg,
    },
    outputSchema: listJobsOutputSchema,
  }),
  defineTool({
    name: 'find_job',
    title: 'Find job across queues',
    description:
      'Locate a job by id when the queue is unknown. Scans up to 100 discovered queues on the connection and returns every queue containing that job id. Prefer get_job when the queue is already known.',
    requiredScopes: [MCP_SCOPE_JOBS_READ],
    annotations: READ_ANNOTATIONS,
    heavy: true,
    inputSchema: { connectionId: connectionIdArg, jobId: jobIdArg },
    outputSchema: findJobOutputSchema,
  }),
  defineTool({
    name: 'get_job',
    title: 'Get job',
    description:
      'Full detail for one job: state, attempts, payload (data), options, progress, return value, failure reason, and stacktrace count. Sensitive keys and inline secrets are redacted and long strings truncated.',
    requiredScopes: [MCP_SCOPE_JOBS_READ],
    annotations: READ_ANNOTATIONS,
    inputSchema: { connectionId: connectionIdArg, queueName: queueNameArg, jobId: jobIdArg },
    outputSchema: getJobOutputSchema,
  }),
  defineTool({
    name: 'get_job_logs',
    title: 'Get job logs',
    description:
      'Paginated log lines written by the worker via job.log(). Oldest first; use the cursor to page toward the newest lines.',
    requiredScopes: [MCP_SCOPE_LOGS_READ],
    annotations: READ_ANNOTATIONS,
    heavy: true,
    inputSchema: {
      connectionId: connectionIdArg,
      queueName: queueNameArg,
      jobId: jobIdArg,
      cursor: cursorArg,
      pageSize: pageSizeArg,
    },
    outputSchema: getJobLogsOutputSchema,
  }),
  defineTool({
    name: 'get_job_stacktraces',
    title: 'Get job stacktraces',
    description:
      'Stacktraces recorded for each failed attempt of a job, newest attempt first. attemptNumber counts from 1; isLatest marks the most recent failure.',
    requiredScopes: [MCP_SCOPE_LOGS_READ],
    annotations: READ_ANNOTATIONS,
    heavy: true,
    inputSchema: {
      connectionId: connectionIdArg,
      queueName: queueNameArg,
      jobId: jobIdArg,
      cursor: cursorArg,
      pageSize: pageSizeArg,
    },
    outputSchema: getJobStacktracesOutputSchema,
  }),
  defineTool({
    name: 'explain_job_failure',
    title: 'Explain job failure',
    description:
      'Deterministic failure triage for one job: picks the strongest signal (failedReason, latest stacktrace, or last log lines), lists related alert events, and rates confidence. Stacktraces and logs need mcp:logs:read; related alerts need mcp:failures:read. Missing evidence is reported in skippedSources rather than failing the call.',
    requiredScopes: [MCP_SCOPE_DIAGNOSTICS_READ, MCP_SCOPE_JOBS_READ],
    optionalScopes: [MCP_SCOPE_LOGS_READ, MCP_SCOPE_FAILURES_READ],
    annotations: READ_ANNOTATIONS,
    heavy: true,
    inputSchema: { connectionId: connectionIdArg, queueName: queueNameArg, jobId: jobIdArg },
    outputSchema: explainJobFailureOutputSchema,
  }),

  // -- Scheduled jobs -------------------------------------------------------
  defineTool({
    name: 'list_scheduled_jobs',
    title: 'List scheduled jobs',
    description:
      'BullMQ job schedulers (repeatable jobs) with cron pattern or interval, timezone, next run, iteration count, and recent failure counts. Pass queueName for one queue, or omit it to walk the whole connection (up to 25 queues or pageSize schedulers per page; large queues are split across pages).',
    requiredScopes: [MCP_SCOPE_JOBS_READ],
    annotations: READ_ANNOTATIONS,
    heavy: true,
    inputSchema: {
      connectionId: connectionIdArg,
      queueName: queueNameArg.optional(),
      cursor: cursorArg,
      pageSize: pageSizeArg,
    },
    outputSchema: listScheduledJobsOutputSchema,
  }),
  defineTool({
    name: 'get_scheduled_job',
    title: 'Get scheduled job',
    description:
      'Detail for one job scheduler including its job template (name, data, options), schedule, next run, and recent failure statistics.',
    requiredScopes: [MCP_SCOPE_JOBS_READ],
    annotations: READ_ANNOTATIONS,
    inputSchema: {
      connectionId: connectionIdArg,
      queueName: queueNameArg,
      schedulerId: z
        .string()
        .min(1)
        .describe('Scheduler key (the id passed to upsertJobScheduler).'),
    },
    outputSchema: getScheduledJobOutputSchema,
  }),

  // -- Workers & metrics ----------------------------------------------------
  defineTool({
    name: 'get_workers',
    title: 'Get workers',
    description:
      'Workers attached to queues on a connection with age and idle time. Pass queueName for one queue, or omit it to page through every queue (up to 50 queues per call).',
    requiredScopes: [MCP_SCOPE_JOBS_READ],
    annotations: READ_ANNOTATIONS,
    inputSchema: {
      connectionId: connectionIdArg,
      queueName: queueNameArg.optional(),
      cursor: cursorArg,
      pageSize: pageSizeArg,
    },
    outputSchema: getWorkersOutputSchema,
  }),
  defineTool({
    name: 'get_queue_metrics',
    title: 'Get queue metrics',
    description:
      'Throughput metrics for one queue over a window of up to 1440 minutes: completed/failed counts, success and failure rates, per-minute averages, longest streaks, lifetime totals, estimated drain time, live counts, and worker/scheduler counts.',
    requiredScopes: [MCP_SCOPE_DIAGNOSTICS_READ],
    annotations: READ_ANNOTATIONS,
    heavy: true,
    inputSchema: {
      connectionId: connectionIdArg,
      queueName: queueNameArg,
      windowMinutes: z
        .number()
        .int()
        .min(1)
        .max(1440)
        .optional()
        .describe('Lookback window in minutes (1-1440, default 360).'),
    },
    outputSchema: getQueueMetricsOutputSchema,
  }),
  defineTool({
    name: 'get_redis_health',
    title: 'Get Redis health',
    description:
      'Redis server health for a connection: latest sample (memory %, CPU %, fragmentation, clients, blocked clients, evictions/min, rejected connections/min), active redis_health alert thresholds, and a bounded time series aggregated by max per bucket.',
    requiredScopes: [MCP_SCOPE_DIAGNOSTICS_READ],
    annotations: READ_ANNOTATIONS,
    heavy: true,
    inputSchema: {
      connectionId: connectionIdArg,
      windowMinutes: z
        .number()
        .int()
        .min(5)
        .max(43_200)
        .optional()
        .describe('Lookback window in minutes (5-43200, default 60).'),
      targetPoints: z
        .number()
        .int()
        .min(10)
        .max(100)
        .optional()
        .describe('Maximum series points to return (10-100, default 60).'),
    },
    outputSchema: getRedisHealthOutputSchema,
  }),

  // -- Alerts (read) --------------------------------------------------------
  defineTool({
    name: 'get_failure_events',
    title: 'Get failure events',
    description:
      'Alert events (incidents) for a connection, newest first. Filter by queue, job id, status (firing, resolved, suppressed), acknowledgement, or rule. Suppressed events are informational cooldown records.',
    requiredScopes: [MCP_SCOPE_FAILURES_READ],
    annotations: READ_ANNOTATIONS,
    heavy: true,
    inputSchema: {
      connectionId: connectionIdArg,
      queueName: queueNameArg.optional(),
      jobId: jobIdArg.optional(),
      status: z.enum(['firing', 'resolved', 'suppressed']).optional(),
      acknowledged: z
        .boolean()
        .optional()
        .describe('true = only acknowledged events, false = only unacknowledged.'),
      alertRuleId: z.string().min(1).optional().describe('Limit to events from one alert rule.'),
      cursor: cursorArg,
      pageSize: pageSizeArg,
    },
    outputSchema: getFailureEventsOutputSchema,
  }),
  defineTool({
    name: 'get_alert_event',
    title: 'Get alert event',
    description:
      'Detail for one alert event including acknowledgement, resolution reason, and notification deliveries (channel, status, attempts, last error, external link). Delivery targets are omitted.',
    requiredScopes: [MCP_SCOPE_FAILURES_READ],
    annotations: READ_ANNOTATIONS,
    inputSchema: {
      connectionId: connectionIdArg,
      eventId: z.string().min(1).describe('Alert event id.'),
    },
    outputSchema: getAlertEventOutputSchema,
  }),
  defineTool({
    name: 'get_alert_summary',
    title: 'Get alert summary',
    description:
      'Open alert counts for a connection split by acknowledgement, broken down by queue and by rule, plus rule state counts (active, snoozed, disabled). Cheap first call when asked "is anything alerting".',
    requiredScopes: [MCP_SCOPE_FAILURES_READ],
    annotations: READ_ANNOTATIONS,
    heavy: true,
    inputSchema: { connectionId: connectionIdArg },
    outputSchema: getAlertSummaryOutputSchema,
  }),
  defineTool({
    name: 'list_alert_rules',
    title: 'List alert rules',
    description:
      'Alert rules configured for a connection with type, thresholds (config), queue filters, cooldown, state (active, snoozed, disabled), notification channels (secrets removed), and open event counts.',
    requiredScopes: [MCP_SCOPE_FAILURES_READ],
    annotations: READ_ANNOTATIONS,
    inputSchema: { connectionId: connectionIdArg, cursor: cursorArg, pageSize: pageSizeArg },
    outputSchema: listAlertRulesOutputSchema,
  }),
  defineTool({
    name: 'get_alert_rule',
    title: 'Get alert rule',
    description: 'Detail for one alert rule plus its five most recent events.',
    requiredScopes: [MCP_SCOPE_FAILURES_READ],
    annotations: READ_ANNOTATIONS,
    inputSchema: {
      connectionId: connectionIdArg,
      ruleId: z.string().min(1).describe('Alert rule id.'),
    },
    outputSchema: getAlertRuleOutputSchema,
  }),

  // -- Alerts (write) -------------------------------------------------------
  defineTool({
    name: 'resolve_alert_event',
    title: 'Resolve alert event',
    description:
      'Mark a firing alert event as manually resolved. Suppressed events cannot be resolved. Linked external issues (for example Linear) are closed asynchronously.',
    requiredScopes: [MCP_SCOPE_FAILURES_WRITE],
    annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    inputSchema: {
      connectionId: connectionIdArg,
      eventId: z.string().min(1).describe('Alert event id.'),
    },
    outputSchema: alertEventMutationOutputSchema,
  }),
  defineTool({
    name: 'acknowledge_alert_event',
    title: 'Acknowledge alert event',
    description:
      'Acknowledge a firing alert event on behalf of the signed-in user. The event stays open and still auto-resolves. Only delegated (user) principals can acknowledge; service accounts receive validation_error.',
    requiredScopes: [MCP_SCOPE_FAILURES_WRITE],
    annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    inputSchema: {
      connectionId: connectionIdArg,
      eventId: z.string().min(1).describe('Alert event id.'),
    },
    outputSchema: alertEventMutationOutputSchema,
  }),
  defineTool({
    name: 'unacknowledge_alert_event',
    title: 'Unacknowledge alert event',
    description:
      'Remove the acknowledgement from a firing alert event so it shows as unhandled again.',
    requiredScopes: [MCP_SCOPE_FAILURES_WRITE],
    annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    inputSchema: {
      connectionId: connectionIdArg,
      eventId: z.string().min(1).describe('Alert event id.'),
    },
    outputSchema: alertEventMutationOutputSchema,
  }),
  defineTool({
    name: 'snooze_alert_rule',
    title: 'Snooze alert rule',
    description:
      'Silence an alert rule for a number of minutes (1 to 10080). Open incidents stay frozen and re-evaluate when the snooze expires. Does not disable the rule.',
    requiredScopes: [MCP_SCOPE_FAILURES_WRITE],
    annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    inputSchema: {
      connectionId: connectionIdArg,
      ruleId: z.string().min(1).describe('Alert rule id.'),
      minutes: z
        .number()
        .int()
        .min(1)
        .max(10_080)
        .describe('Snooze duration in minutes (max 7 days).'),
    },
    outputSchema: alertRuleMutationOutputSchema,
  }),
  defineTool({
    name: 'unsnooze_alert_rule',
    title: 'Unsnooze alert rule',
    description: 'Clear a snooze so the alert rule evaluates on the next monitor poll.',
    requiredScopes: [MCP_SCOPE_FAILURES_WRITE],
    annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    inputSchema: {
      connectionId: connectionIdArg,
      ruleId: z.string().min(1).describe('Alert rule id.'),
    },
    outputSchema: alertRuleMutationOutputSchema,
  }),

  // -- Jobs & queues (write) ------------------------------------------------
  defineTool({
    name: 'retry_job',
    title: 'Retry job',
    description:
      'Re-enqueue a failed job with its existing payload. Only jobs in the failed state can be retried; other states return conflict. Never modifies job data.',
    requiredScopes: [MCP_SCOPE_JOBS_RETRY],
    annotations: WRITE_NON_IDEMPOTENT_ANNOTATIONS,
    inputSchema: { connectionId: connectionIdArg, queueName: queueNameArg, jobId: jobIdArg },
    outputSchema: jobMutationOutputSchema,
  }),
  defineTool({
    name: 'promote_job',
    title: 'Promote job',
    description:
      'Move a delayed job to the waiting list so a worker picks it up immediately. Only jobs in the delayed state can be promoted; other states return conflict.',
    requiredScopes: [MCP_SCOPE_JOBS_PROMOTE],
    annotations: WRITE_NON_IDEMPOTENT_ANNOTATIONS,
    inputSchema: { connectionId: connectionIdArg, queueName: queueNameArg, jobId: jobIdArg },
    outputSchema: jobMutationOutputSchema,
  }),
  defineTool({
    name: 'pause_queue',
    title: 'Pause queue',
    description:
      'Pause a queue so workers stop picking up new jobs. Active jobs finish normally. Safe to call on an already paused queue (changed=false).',
    requiredScopes: [MCP_SCOPE_QUEUES_PAUSE],
    annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    inputSchema: { connectionId: connectionIdArg, queueName: queueNameArg },
    outputSchema: queuePauseOutputSchema,
  }),
  defineTool({
    name: 'resume_queue',
    title: 'Resume queue',
    description: 'Resume a paused queue. Safe to call on an active queue (changed=false).',
    requiredScopes: [MCP_SCOPE_QUEUES_PAUSE],
    annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    inputSchema: { connectionId: connectionIdArg, queueName: queueNameArg },
    outputSchema: queuePauseOutputSchema,
  }),
]

const CATALOG_BY_NAME = new Map(MCP_TOOL_CATALOG.map((tool) => [tool.name, tool]))

export const MCP_TOOL_NAMES: readonly string[] = MCP_TOOL_CATALOG.map((tool) => tool.name)

export const MCP_READ_TOOL_NAMES: readonly string[] = MCP_TOOL_CATALOG.filter(
  (tool) => tool.annotations.readOnlyHint
).map((tool) => tool.name)

export const MCP_WRITE_TOOL_NAMES: readonly string[] = MCP_TOOL_CATALOG.filter(
  (tool) => !tool.annotations.readOnlyHint
).map((tool) => tool.name)

export const MCP_HEAVY_TOOL_NAMES: ReadonlySet<string> = new Set(
  MCP_TOOL_CATALOG.filter((tool) => tool.heavy).map((tool) => tool.name)
)

export function getMcpToolDefinition(name: string): McpToolDefinition | null {
  return CATALOG_BY_NAME.get(name) ?? null
}

/** Required scopes for a tool, or null when the tool is unknown (callers must fail closed). */
export function getMcpToolRequiredScopes(name: string): readonly string[] | null {
  return CATALOG_BY_NAME.get(name)?.requiredScopes ?? null
}

export function isMcpHeavyTool(name: string): boolean {
  return MCP_HEAVY_TOOL_NAMES.has(name)
}

// ---------------------------------------------------------------------------
// Output types (derived from schemas so handlers and schemas cannot drift)
// ---------------------------------------------------------------------------

export type ListConnectionsHandlerOutput = z.infer<typeof listConnectionsOutputSchema>
export type ListQueuesHandlerOutput = z.infer<typeof listQueuesOutputSchema>
export type GetQueueHandlerOutput = z.infer<typeof getQueueOutputSchema>
export type GetConnectionOverviewHandlerOutput = z.infer<typeof getConnectionOverviewOutputSchema>
export type ListJobsHandlerOutput = z.infer<typeof listJobsOutputSchema>
export type FindJobHandlerOutput = z.infer<typeof findJobOutputSchema>
export type GetJobHandlerOutput = z.infer<typeof getJobOutputSchema>
export type GetJobLogsHandlerOutput = z.infer<typeof getJobLogsOutputSchema>
export type GetJobStacktracesHandlerOutput = z.infer<typeof getJobStacktracesOutputSchema>
export type ExplainJobFailureHandlerOutput = z.infer<typeof explainJobFailureOutputSchema>
export type ListScheduledJobsHandlerOutput = z.infer<typeof listScheduledJobsOutputSchema>
export type GetScheduledJobHandlerOutput = z.infer<typeof getScheduledJobOutputSchema>
export type GetWorkersHandlerOutput = z.infer<typeof getWorkersOutputSchema>
export type GetQueueMetricsHandlerOutput = z.infer<typeof getQueueMetricsOutputSchema>
export type GetRedisHealthHandlerOutput = z.infer<typeof getRedisHealthOutputSchema>
export type GetFailureEventsHandlerOutput = z.infer<typeof getFailureEventsOutputSchema>
export type GetAlertEventHandlerOutput = z.infer<typeof getAlertEventOutputSchema>
export type GetAlertSummaryHandlerOutput = z.infer<typeof getAlertSummaryOutputSchema>
export type ListAlertRulesHandlerOutput = z.infer<typeof listAlertRulesOutputSchema>
export type GetAlertRuleHandlerOutput = z.infer<typeof getAlertRuleOutputSchema>
export type AlertEventMutationHandlerOutput = z.infer<typeof alertEventMutationOutputSchema>
export type AlertRuleMutationHandlerOutput = z.infer<typeof alertRuleMutationOutputSchema>
export type JobMutationHandlerOutput = z.infer<typeof jobMutationOutputSchema>
export type QueuePauseHandlerOutput = z.infer<typeof queuePauseOutputSchema>

export type McpJobSummary = z.infer<typeof jobSummarySchema>
export type McpAlertEventSummary = z.infer<typeof alertEventSummarySchema>
export type McpAlertEventDetail = z.infer<typeof alertEventDetailSchema>
export type McpAlertRuleSummary = z.infer<typeof alertRuleSummarySchema>
export type McpScheduledJobSummary = z.infer<typeof scheduledJobSummarySchema>

/** Backwards-compatible alias: resolve_alert_event output. */
export type ResolveAlertEventHandlerOutput = AlertEventMutationHandlerOutput
