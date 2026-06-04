import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { getMcpRequestContext } from '../request-context'
import type { McpToolInvocationAuditInput } from '../request-context'
import { sanitizeMcpOutput } from '../safety/sanitize-output'

export interface ListConnectionsHandlerInput {
  principal:
    | {
        type: 'delegated_user'
        principalId: string
        userId: string
      }
    | {
        type: 'service_account'
        principalId: string
        organizationId: string
      }
  cursor?: string
  pageSize: number
}

export interface ListConnectionsHandlerOutput {
  [key: string]: unknown
  connections: Array<{
    id: string
    name: string
    environment: string | null
    prefix: string
    isDefault: boolean
    organizationId: string
  }>
  nextCursor: string | null
}

export interface ListQueuesHandlerInput {
  principal: ListConnectionsHandlerInput['principal']
  connectionId: string
  cursor?: string
  pageSize: number
}

export interface ListQueuesHandlerOutput {
  [key: string]: unknown
  connectionId: string
  total: number
  queues: Array<{
    name: string
    status: 'paused' | 'active'
    isPaused: boolean
    discoveryState: string
    jobCounts: {
      waiting: number
      active: number
      delayed: number
      completed: number
      failed: number
      paused: number
      prioritized: number
    }
  }>
  nextCursor: string | null
}

export interface GetQueueHandlerInput {
  principal: ListConnectionsHandlerInput['principal']
  connectionId: string
  queueName: string
}

export interface GetQueueHandlerOutput {
  [key: string]: unknown
  connectionId: string
  name: string
  status: 'paused' | 'active'
  isPaused: boolean
  scheduledJobsCount: number
  jobCounts: {
    waiting: number
    active: number
    delayed: number
    completed: number
    failed: number
    paused: number
    prioritized: number
  }
  workers: Array<{
    id: string
    name: string
    address: string
    ageMs: number
    idleMs: number
  }>
}

export interface ListJobsHandlerInput {
  principal: ListConnectionsHandlerInput['principal']
  connectionId: string
  queueName: string
  status?: string
  name?: string
  jobId?: string
  cursor?: string
  pageSize: number
}

export interface ListJobsHandlerOutput {
  [key: string]: unknown
  connectionId: string
  queueName: string
  total: number
  jobs: Array<{
    id: string
    name: string
    status: string
    attemptsMade: number
    maxAttempts: number
    failedReason: string | null
    processedOn: number | null
    finishedOn: number | null
    timestamp: number | null
    delay: number
    priority: number
  }>
  nextCursor: string | null
}

export interface GetJobHandlerInput {
  principal: ListConnectionsHandlerInput['principal']
  connectionId: string
  queueName: string
  jobId: string
}

export interface GetJobHandlerOutput {
  [key: string]: unknown
  connectionId: string
  queueName: string
  job: {
    id: string
    name: string
    status: string
    data: Record<string, unknown>
    progress: unknown
    attemptsMade: number
    maxAttempts: number
    failedReason: string | null
    processedOn: number | null
    finishedOn: number | null
    timestamp: number | null
    delay: number
    priority: number
    opts: Record<string, unknown>
    returnvalue: unknown
    stacktraceCount: number
  }
}

export interface GetJobLogsHandlerInput {
  principal: ListConnectionsHandlerInput['principal']
  connectionId: string
  queueName: string
  jobId: string
  cursor?: string
  pageSize: number
}

export interface GetJobLogsHandlerOutput {
  [key: string]: unknown
  connectionId: string
  queueName: string
  jobId: string
  logs: string[]
  total: number
  nextCursor: string | null
}

export interface GetJobStacktracesHandlerInput {
  principal: ListConnectionsHandlerInput['principal']
  connectionId: string
  queueName: string
  jobId: string
  cursor?: string
  pageSize: number
}

export interface GetJobStacktracesHandlerOutput {
  [key: string]: unknown
  connectionId: string
  queueName: string
  jobId: string
  total: number
  stacktraces: Array<{
    attemptNumber: number
    stacktrace: string
    isLatest: boolean
  }>
  nextCursor: string | null
}

export interface GetFailureEventsHandlerInput {
  principal: ListConnectionsHandlerInput['principal']
  connectionId: string
  queueName?: string
  jobId?: string
  status?: 'firing' | 'resolved' | 'suppressed'
  cursor?: string
  pageSize: number
}

export interface GetFailureEventsHandlerOutput {
  [key: string]: unknown
  connectionId: string
  total: number
  events: Array<{
    id: string
    alertRuleId: string
    queueName: string
    type: string
    status: string
    summary: string
    context: Record<string, unknown> | null
    firedAt: string
    resolvedAt: string | null
  }>
  nextCursor: string | null
}

export interface ResolveAlertEventHandlerInput {
  principal: ListConnectionsHandlerInput['principal']
  connectionId: string
  eventId: string
}

export interface ResolveAlertEventHandlerOutput {
  [key: string]: unknown
  connectionId: string
  event: {
    id: string
    alertRuleId: string
    queueName: string
    type: string
    status: string
    summary: string
    context: Record<string, unknown> | null
    firedAt: string
    resolvedAt: string | null
  }
}

export interface GetQueueMetricsHandlerInput {
  principal: ListConnectionsHandlerInput['principal']
  connectionId: string
  queueName: string
  windowMinutes?: number
}

export interface GetQueueMetricsHandlerOutput {
  [key: string]: unknown
  connectionId: string
  queueName: string
  range: {
    requestedWindowMinutes: number | null
    returnedPoints: number
    oldestPointTimestamp: number | null
    newestPointTimestamp: number | null
    latestPointAgeMs: number | null
    requestedWindowCoverage: number | null
  }
  totals: {
    completedInWindow: number
    failedInWindow: number
    finishedInWindow: number
    successRateInWindow: number
    failureRateInWindow: number
    avgCompletedPerMinuteInWindow: number
    avgFailedPerMinuteInWindow: number
    longestFailureStreakMinutesInWindow: number
    longestCompletionStreakMinutesInWindow: number
    completedLifetime: number
    failedLifetime: number
    failureRateLifetime: number
    estimatedDrainMinutes: number | null
  }
  counts: {
    waiting: number
    active: number
    delayed: number
    completed: number
    failed: number
    paused: number
    prioritized: number
    waitingChildren: number
  }
  queue: {
    isPaused: boolean
    isMaxed: boolean
    waitingToProcess: number
    workersCount: number
    schedulersCount: number
  }
  warnings: string[]
}

export interface GetWorkersHandlerInput {
  principal: ListConnectionsHandlerInput['principal']
  connectionId: string
  queueName?: string
  cursor?: string
  pageSize: number
}

export interface GetWorkersHandlerOutput {
  [key: string]: unknown
  connectionId: string
  totalQueues: number
  totalWorkersInPage: number
  workers: Array<{
    id: string
    name: string
    address: string
    ageMs: number
    idleMs: number
    queueName: string
  }>
  queues: Array<{
    name: string
    workerCount: number
    status: 'paused' | 'active'
    jobCounts: {
      active: number
      waiting: number
    }
  }>
  nextCursor: string | null
}

export interface ExplainJobFailureHandlerInput {
  principal: ListConnectionsHandlerInput['principal']
  connectionId: string
  queueName: string
  jobId: string
}

export interface ExplainJobFailureHandlerOutput {
  [key: string]: unknown
  connectionId: string
  queueName: string
  jobId: string
  status: string
  summary: string
  failedReason: string | null
  attemptTimeline: {
    attemptsMade: number
    maxAttempts: number
    processedOn: number | null
    finishedOn: number | null
    timestamp: number | null
  }
  topSignal: {
    source: 'failed_reason' | 'stacktrace' | 'logs' | 'none'
    excerpt: string
  }
  relatedAlertEvents: Array<{
    id: string
    type: string
    status: string
    summary: string
    firedAt: string
    context: Record<string, unknown> | null
  }>
  recentLogLines: string[]
  confidence: 'high' | 'medium' | 'low'
  sources: string[]
}

export interface RegisterReadToolsOptions {
  listConnections?: (input: ListConnectionsHandlerInput) => Promise<ListConnectionsHandlerOutput>
  listQueues?: (input: ListQueuesHandlerInput) => Promise<ListQueuesHandlerOutput>
  getQueue?: (input: GetQueueHandlerInput) => Promise<GetQueueHandlerOutput>
  listJobs?: (input: ListJobsHandlerInput) => Promise<ListJobsHandlerOutput>
  getJob?: (input: GetJobHandlerInput) => Promise<GetJobHandlerOutput>
  getJobLogs?: (input: GetJobLogsHandlerInput) => Promise<GetJobLogsHandlerOutput>
  getJobStacktraces?: (
    input: GetJobStacktracesHandlerInput
  ) => Promise<GetJobStacktracesHandlerOutput>
  getFailureEvents?: (input: GetFailureEventsHandlerInput) => Promise<GetFailureEventsHandlerOutput>
  resolveAlertEvent?: (input: ResolveAlertEventHandlerInput) => Promise<ResolveAlertEventHandlerOutput>
  getQueueMetrics?: (input: GetQueueMetricsHandlerInput) => Promise<GetQueueMetricsHandlerOutput>
  getWorkers?: (input: GetWorkersHandlerInput) => Promise<GetWorkersHandlerOutput>
  explainJobFailure?: (
    input: ExplainJobFailureHandlerInput
  ) => Promise<ExplainJobFailureHandlerOutput>
  onToolInvocationComplete?: (input: McpToolInvocationAuditInput) => void
}

function parsePageSize(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 25
  return Math.min(100, Math.max(1, Math.floor(raw)))
}

function parseCursor(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined
}

type ToolPrincipal = ListConnectionsHandlerInput['principal']

function getPrincipalFromContext(): ToolPrincipal {
  const requestContext = getMcpRequestContext()
  const principal = requestContext?.principal
  if (!principal) {
    throw new Error('MCP principal context is unavailable for this request.')
  }
  if (principal.type === 'delegated_user' && !principal.userId) {
    throw new Error('Delegated principal is missing user id.')
  }
  if (principal.type === 'service_account' && !principal.organizationId) {
    throw new Error('Service account principal is missing organization id.')
  }
  return principal.type === 'delegated_user'
    ? {
        type: 'delegated_user',
        principalId: principal.principalId,
        userId: principal.userId!,
      }
    : {
        type: 'service_account',
        principalId: principal.principalId,
        organizationId: principal.organizationId!,
      }
}

function toToolError(error: unknown): { code: string; message: string } {
  const INTERNAL_ERROR_MESSAGE = 'Tool invocation failed.'
  const KNOWN_MESSAGES: Record<string, string> = {
    not_found: 'Resource not found.',
    validation_error: 'Invalid input.',
    forbidden: 'Forbidden.',
  }

  if (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    const code = (error as { code: string }).code
    if (code in KNOWN_MESSAGES) {
      return { code, message: KNOWN_MESSAGES[code]! }
    }
    return {
      code: 'internal_error',
      message: INTERNAL_ERROR_MESSAGE,
    }
  }

  return {
    code: 'internal_error',
    message: INTERNAL_ERROR_MESSAGE,
  }
}

function mcpToolFailure(toolError: { code: string; message: string }) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify({ error: toolError }) }],
  }
}

function finalizeReadToolSuccess(
  options: RegisterReadToolsOptions,
  toolName: string,
  args: Record<string, unknown>,
  result: Record<string, unknown>
) {
  const { value, redactionCount } = sanitizeMcpOutput(result)
  const sanitizedResult =
    typeof value === 'object' && value != null && !Array.isArray(value)
      ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
      : ({ value } as Record<string, unknown>)

  if (redactionCount > 0) {
    sanitizedResult._mcpSafety = { redactionCount }
    getMcpRequestContext()?.onRedactionApplied?.(redactionCount)
  }

  const auditInput = {
    toolName,
    arguments: args,
    connectionId: typeof args.connectionId === 'string' ? args.connectionId : null,
    responseClass: 'success' as const,
    redactionCount: redactionCount > 0 ? redactionCount : undefined,
  }
  getMcpRequestContext()?.onToolInvocationComplete?.(auditInput)

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(sanitizedResult) }],
  }
}

function finalizeReadToolFailure(
  options: RegisterReadToolsOptions,
  toolName: string,
  args: Record<string, unknown>,
  error: unknown
) {
  const auditInput = {
    toolName,
    arguments: args,
    connectionId: typeof args.connectionId === 'string' ? args.connectionId : null,
    responseClass: 'tool_error' as const,
  }
  getMcpRequestContext()?.onToolInvocationComplete?.(auditInput)
  return mcpToolFailure(toToolError(error))
}

async function runReadTool(
  options: RegisterReadToolsOptions,
  toolName: string,
  args: Record<string, unknown>,
  invoke: () => Promise<Record<string, unknown>>
) {
  try {
    const result = await invoke()
    return finalizeReadToolSuccess(options, toolName, args, result)
  } catch (error) {
    return finalizeReadToolFailure(options, toolName, args, error)
  }
}

export function registerReadTools(server: McpServer, options: RegisterReadToolsOptions): void {
  const listConnections = options.listConnections
  if (listConnections) {
    const listConnectionsSchema = {
      cursor: z.string().optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }

    server.tool(
      'list_connections',
      listConnectionsSchema,
      async (args) =>
        runReadTool(options, 'list_connections', args, () =>
          listConnections({
            principal: getPrincipalFromContext(),
            cursor: parseCursor(args.cursor),
            pageSize: parsePageSize(args.pageSize),
          })
        )
    )
  }

  const listQueues = options.listQueues
  if (listQueues) {
    server.tool(
      'list_queues',
      {
        connectionId: z.string().min(1),
        cursor: z.string().optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
      async (args) =>
        runReadTool(options, 'list_queues', args, () =>
          listQueues({
            principal: getPrincipalFromContext(),
            connectionId: args.connectionId,
            cursor: parseCursor(args.cursor),
            pageSize: parsePageSize(args.pageSize),
          })
        )
    )
  }

  const getQueue = options.getQueue
  if (getQueue) {
    server.tool(
      'get_queue',
      {
        connectionId: z.string().min(1),
        queueName: z.string().min(1),
      },
      async (args) =>
        runReadTool(options, 'get_queue', args, () =>
          getQueue({
            principal: getPrincipalFromContext(),
            connectionId: args.connectionId,
            queueName: args.queueName,
          })
        )
    )
  }

  const listJobs = options.listJobs
  if (listJobs) {
    server.tool(
      'list_jobs',
      {
        connectionId: z.string().min(1),
        queueName: z.string().min(1),
        status: z.string().optional(),
        name: z.string().optional(),
        jobId: z.string().optional(),
        cursor: z.string().optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
      async (args) =>
        runReadTool(options, 'list_jobs', args, () =>
          listJobs({
            principal: getPrincipalFromContext(),
            connectionId: args.connectionId,
            queueName: args.queueName,
            status: args.status,
            name: args.name,
            jobId: args.jobId,
            cursor: parseCursor(args.cursor),
            pageSize: parsePageSize(args.pageSize),
          })
        )
    )
  }

  const getJob = options.getJob
  if (getJob) {
    server.tool(
      'get_job',
      {
        connectionId: z.string().min(1),
        queueName: z.string().min(1),
        jobId: z.string().min(1),
      },
      async (args) =>
        runReadTool(options, 'get_job', args, () =>
          getJob({
            principal: getPrincipalFromContext(),
            connectionId: args.connectionId,
            queueName: args.queueName,
            jobId: args.jobId,
          })
        )
    )
  }

  const getJobLogs = options.getJobLogs
  if (getJobLogs) {
    server.tool(
      'get_job_logs',
      {
        connectionId: z.string().min(1),
        queueName: z.string().min(1),
        jobId: z.string().min(1),
        cursor: z.string().optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
      async (args) =>
        runReadTool(options, 'get_job_logs', args, () =>
          getJobLogs({
            principal: getPrincipalFromContext(),
            connectionId: args.connectionId,
            queueName: args.queueName,
            jobId: args.jobId,
            cursor: parseCursor(args.cursor),
            pageSize: parsePageSize(args.pageSize),
          })
        )
    )
  }

  const getJobStacktraces = options.getJobStacktraces
  if (getJobStacktraces) {
    server.tool(
      'get_job_stacktraces',
      {
        connectionId: z.string().min(1),
        queueName: z.string().min(1),
        jobId: z.string().min(1),
        cursor: z.string().optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
      async (args) =>
        runReadTool(options, 'get_job_stacktraces', args, () =>
          getJobStacktraces({
            principal: getPrincipalFromContext(),
            connectionId: args.connectionId,
            queueName: args.queueName,
            jobId: args.jobId,
            cursor: parseCursor(args.cursor),
            pageSize: parsePageSize(args.pageSize),
          })
        )
    )
  }

  const getFailureEvents = options.getFailureEvents
  if (getFailureEvents) {
    server.tool(
      'get_failure_events',
      {
        connectionId: z.string().min(1),
        queueName: z.string().min(1).optional(),
        jobId: z.string().min(1).optional(),
        status: z.enum(['firing', 'resolved', 'suppressed']).optional(),
        cursor: z.string().optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
      async (args) =>
        runReadTool(options, 'get_failure_events', args, () =>
          getFailureEvents({
            principal: getPrincipalFromContext(),
            connectionId: args.connectionId,
            queueName: args.queueName,
            jobId: args.jobId,
            status: args.status,
            cursor: parseCursor(args.cursor),
            pageSize: parsePageSize(args.pageSize),
          })
        )
    )
  }

  const resolveAlertEvent = options.resolveAlertEvent
  if (resolveAlertEvent) {
    server.tool(
      'resolve_alert_event',
      {
        connectionId: z.string().min(1),
        eventId: z.string().min(1),
      },
      async (args) =>
        runReadTool(options, 'resolve_alert_event', args, () =>
          resolveAlertEvent({
            principal: getPrincipalFromContext(),
            connectionId: args.connectionId,
            eventId: args.eventId,
          })
        )
    )
  }

  const getQueueMetrics = options.getQueueMetrics
  if (getQueueMetrics) {
    server.tool(
      'get_queue_metrics',
      {
        connectionId: z.string().min(1),
        queueName: z.string().min(1),
        windowMinutes: z.number().int().min(1).max(1440).optional(),
      },
      async (args) =>
        runReadTool(options, 'get_queue_metrics', args, () =>
          getQueueMetrics({
            principal: getPrincipalFromContext(),
            connectionId: args.connectionId,
            queueName: args.queueName,
            windowMinutes: args.windowMinutes,
          })
        )
    )
  }

  const getWorkers = options.getWorkers
  if (getWorkers) {
    server.tool(
      'get_workers',
      {
        connectionId: z.string().min(1),
        queueName: z.string().min(1).optional(),
        cursor: z.string().optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
      async (args) =>
        runReadTool(options, 'get_workers', args, () =>
          getWorkers({
            principal: getPrincipalFromContext(),
            connectionId: args.connectionId,
            queueName: args.queueName,
            cursor: parseCursor(args.cursor),
            pageSize: parsePageSize(args.pageSize),
          })
        )
    )
  }

  const explainJobFailure = options.explainJobFailure
  if (explainJobFailure) {
    server.tool(
      'explain_job_failure',
      {
        connectionId: z.string().min(1),
        queueName: z.string().min(1),
        jobId: z.string().min(1),
      },
      async (args) =>
        runReadTool(options, 'explain_job_failure', args, () =>
          explainJobFailure({
            principal: getPrincipalFromContext(),
            connectionId: args.connectionId,
            queueName: args.queueName,
            jobId: args.jobId,
          })
        )
    )
  }
}
