import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpToolInvocationAuditInput } from '../request-context'
import { getMcpRequestContext } from '../request-context'
import { sanitizeMcpOutput, sanitizeMcpText } from '../safety/sanitize-output'
import {
  type AlertEventMutationHandlerOutput,
  type AlertRuleMutationHandlerOutput,
  type ExplainJobFailureHandlerOutput,
  type FindJobHandlerOutput,
  type GetAlertEventHandlerOutput,
  type GetAlertRuleHandlerOutput,
  type GetAlertSummaryHandlerOutput,
  type GetConnectionOverviewHandlerOutput,
  type GetFailureEventsHandlerOutput,
  type GetJobHandlerOutput,
  type GetJobLogsHandlerOutput,
  type GetJobStacktracesHandlerOutput,
  type GetQueueHandlerOutput,
  type GetQueueMetricsHandlerOutput,
  type GetRedisHealthHandlerOutput,
  type GetScheduledJobHandlerOutput,
  type GetWorkersHandlerOutput,
  getMcpToolDefinition,
  type JobMutationHandlerOutput,
  type ListAlertRulesHandlerOutput,
  type ListConnectionsHandlerOutput,
  type ListJobsHandlerOutput,
  type ListQueuesHandlerOutput,
  type ListScheduledJobsHandlerOutput,
  type McpJobState,
  type McpToolDefinition,
  type QueuePauseHandlerOutput,
} from './tool-catalog'

// ---------------------------------------------------------------------------
// Handler input contracts
// ---------------------------------------------------------------------------

export type ToolPrincipal =
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

interface PrincipalInput {
  principal: ToolPrincipal
}

interface ConnectionInput extends PrincipalInput {
  connectionId: string
}

interface PagedInput {
  cursor?: string
  pageSize: number
}

export interface ListConnectionsHandlerInput extends PrincipalInput, PagedInput {}
export interface ListQueuesHandlerInput extends ConnectionInput, PagedInput {}
export interface GetQueueHandlerInput extends ConnectionInput {
  queueName: string
}
export interface GetConnectionOverviewHandlerInput extends ConnectionInput {
  /** Effective scopes for this call; used to decide which optional sections to include. */
  grantedScopes: readonly string[]
}
export interface ListJobsHandlerInput extends ConnectionInput, PagedInput {
  queueName: string
  status?: McpJobState
  name?: string
  jobId?: string
}
export interface FindJobHandlerInput extends ConnectionInput {
  jobId: string
}
export interface GetJobHandlerInput extends ConnectionInput {
  queueName: string
  jobId: string
}
export interface GetJobLogsHandlerInput extends ConnectionInput, PagedInput {
  queueName: string
  jobId: string
}
export interface GetJobStacktracesHandlerInput extends ConnectionInput, PagedInput {
  queueName: string
  jobId: string
}
export interface ExplainJobFailureHandlerInput extends ConnectionInput {
  queueName: string
  jobId: string
  /** Effective scopes for this call; logs/alerts are consulted only when granted. */
  grantedScopes: readonly string[]
}
export interface ListScheduledJobsHandlerInput extends ConnectionInput, PagedInput {
  queueName?: string
}
export interface GetScheduledJobHandlerInput extends ConnectionInput {
  queueName: string
  schedulerId: string
}
export interface GetWorkersHandlerInput extends ConnectionInput, PagedInput {
  queueName?: string
}
export interface GetQueueMetricsHandlerInput extends ConnectionInput {
  queueName: string
  windowMinutes?: number
}
export interface GetRedisHealthHandlerInput extends ConnectionInput {
  windowMinutes?: number
  targetPoints?: number
}
export interface GetFailureEventsHandlerInput extends ConnectionInput, PagedInput {
  queueName?: string
  jobId?: string
  status?: 'firing' | 'resolved' | 'suppressed'
  acknowledged?: boolean
  alertRuleId?: string
}
export interface GetAlertEventHandlerInput extends ConnectionInput {
  eventId: string
}
export interface GetAlertSummaryHandlerInput extends ConnectionInput {}
export interface ListAlertRulesHandlerInput extends ConnectionInput, PagedInput {}
export interface GetAlertRuleHandlerInput extends ConnectionInput {
  ruleId: string
}
export interface AlertEventMutationHandlerInput extends ConnectionInput {
  eventId: string
}
/** Backwards-compatible alias for the resolve_alert_event handler input. */
export type ResolveAlertEventHandlerInput = AlertEventMutationHandlerInput
export interface SnoozeAlertRuleHandlerInput extends ConnectionInput {
  ruleId: string
  minutes: number
}
export interface AlertRuleMutationHandlerInput extends ConnectionInput {
  ruleId: string
}
export interface JobMutationHandlerInput extends ConnectionInput {
  queueName: string
  jobId: string
}
export interface QueueMutationHandlerInput extends ConnectionInput {
  queueName: string
}

type Handler<Input, Output> = (input: Input) => Promise<Output>

export interface RegisterToolsOptions {
  listConnections?: Handler<ListConnectionsHandlerInput, ListConnectionsHandlerOutput>
  listQueues?: Handler<ListQueuesHandlerInput, ListQueuesHandlerOutput>
  getQueue?: Handler<GetQueueHandlerInput, GetQueueHandlerOutput>
  getConnectionOverview?: Handler<
    GetConnectionOverviewHandlerInput,
    GetConnectionOverviewHandlerOutput
  >
  listJobs?: Handler<ListJobsHandlerInput, ListJobsHandlerOutput>
  findJob?: Handler<FindJobHandlerInput, FindJobHandlerOutput>
  getJob?: Handler<GetJobHandlerInput, GetJobHandlerOutput>
  getJobLogs?: Handler<GetJobLogsHandlerInput, GetJobLogsHandlerOutput>
  getJobStacktraces?: Handler<GetJobStacktracesHandlerInput, GetJobStacktracesHandlerOutput>
  explainJobFailure?: Handler<ExplainJobFailureHandlerInput, ExplainJobFailureHandlerOutput>
  listScheduledJobs?: Handler<ListScheduledJobsHandlerInput, ListScheduledJobsHandlerOutput>
  getScheduledJob?: Handler<GetScheduledJobHandlerInput, GetScheduledJobHandlerOutput>
  getWorkers?: Handler<GetWorkersHandlerInput, GetWorkersHandlerOutput>
  getQueueMetrics?: Handler<GetQueueMetricsHandlerInput, GetQueueMetricsHandlerOutput>
  getRedisHealth?: Handler<GetRedisHealthHandlerInput, GetRedisHealthHandlerOutput>
  getFailureEvents?: Handler<GetFailureEventsHandlerInput, GetFailureEventsHandlerOutput>
  getAlertEvent?: Handler<GetAlertEventHandlerInput, GetAlertEventHandlerOutput>
  getAlertSummary?: Handler<GetAlertSummaryHandlerInput, GetAlertSummaryHandlerOutput>
  listAlertRules?: Handler<ListAlertRulesHandlerInput, ListAlertRulesHandlerOutput>
  getAlertRule?: Handler<GetAlertRuleHandlerInput, GetAlertRuleHandlerOutput>
  resolveAlertEvent?: Handler<AlertEventMutationHandlerInput, AlertEventMutationHandlerOutput>
  acknowledgeAlertEvent?: Handler<AlertEventMutationHandlerInput, AlertEventMutationHandlerOutput>
  unacknowledgeAlertEvent?: Handler<AlertEventMutationHandlerInput, AlertEventMutationHandlerOutput>
  snoozeAlertRule?: Handler<SnoozeAlertRuleHandlerInput, AlertRuleMutationHandlerOutput>
  unsnoozeAlertRule?: Handler<AlertRuleMutationHandlerInput, AlertRuleMutationHandlerOutput>
  retryJob?: Handler<JobMutationHandlerInput, JobMutationHandlerOutput>
  promoteJob?: Handler<JobMutationHandlerInput, JobMutationHandlerOutput>
  pauseQueue?: Handler<QueueMutationHandlerInput, QueuePauseHandlerOutput>
  resumeQueue?: Handler<QueueMutationHandlerInput, QueuePauseHandlerOutput>
  onToolInvocationComplete?: (input: McpToolInvocationAuditInput) => void
}

// ---------------------------------------------------------------------------
// Argument helpers
// ---------------------------------------------------------------------------

type RawArgs = Record<string, unknown>

function parsePageSize(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 25
  return Math.min(100, Math.max(1, Math.floor(raw)))
}

function parseCursor(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined
}

function str(raw: unknown): string {
  return typeof raw === 'string' ? raw : String(raw ?? '')
}

function optStr(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined
}

function optNum(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

function optBool(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined
}

export function getPrincipalFromContext(): ToolPrincipal {
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

function getGrantedScopesFromContext(): readonly string[] {
  return getMcpRequestContext()?.grantedScopes ?? []
}

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

export const MCP_TOOL_ERROR_CODES = [
  'not_found',
  'validation_error',
  'forbidden',
  'conflict',
  'internal_error',
] as const
export type McpToolErrorCode = (typeof MCP_TOOL_ERROR_CODES)[number]

const DEFAULT_ERROR_MESSAGES: Record<McpToolErrorCode, string> = {
  not_found: 'Resource not found.',
  validation_error: 'Invalid input.',
  forbidden: 'Forbidden.',
  conflict: 'The resource is not in a state that allows this operation.',
  internal_error: 'Tool invocation failed.',
}

/**
 * Maps a thrown error to the `{ code, message }` envelope returned to clients.
 *
 * Errors carrying a known `code` are treated as curated domain errors and their message is
 * passed through (after secret redaction and truncation) so clients can act on it. Anything
 * else is collapsed to `internal_error` with a generic message.
 */
export function toToolError(error: unknown): { code: McpToolErrorCode; message: string } {
  if (typeof error === 'object' && error != null && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string' && code !== 'internal_error' && isKnownErrorCode(code)) {
      const rawMessage = (error as { message?: unknown }).message
      const message = typeof rawMessage === 'string' ? sanitizeMcpText(rawMessage) : null
      return { code, message: message ?? DEFAULT_ERROR_MESSAGES[code] }
    }
  }
  return { code: 'internal_error', message: DEFAULT_ERROR_MESSAGES.internal_error }
}

function isKnownErrorCode(code: string): code is McpToolErrorCode {
  return (MCP_TOOL_ERROR_CODES as readonly string[]).includes(code)
}

const safetySchema = z.object({ redactionCount: z.number() }).optional()

export function withSafetyMetadata(schema: z.ZodObject): z.ZodObject {
  return schema.extend({ _mcpSafety: safetySchema })
}

function mcpToolFailure(toolError: { code: string; message: string }) {
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: JSON.stringify({ error: toolError }) }],
  }
}

function auditConnectionId(args: RawArgs): string | null {
  return typeof args.connectionId === 'string' ? args.connectionId : null
}

function finalizeToolSuccess(toolName: string, args: RawArgs, result: Record<string, unknown>) {
  const { value, redactionCount } = sanitizeMcpOutput(result)
  const sanitizedResult =
    typeof value === 'object' && value != null && !Array.isArray(value)
      ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
      : ({ value } as Record<string, unknown>)

  if (redactionCount > 0) {
    sanitizedResult._mcpSafety = { redactionCount }
    getMcpRequestContext()?.onRedactionApplied?.(redactionCount)
  }

  getMcpRequestContext()?.onToolInvocationComplete?.({
    toolName,
    arguments: args,
    connectionId: auditConnectionId(args),
    responseClass: 'success',
    redactionCount: redactionCount > 0 ? redactionCount : undefined,
  })

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(sanitizedResult) }],
    structuredContent: sanitizedResult,
  }
}

function finalizeToolFailure(toolName: string, args: RawArgs, error: unknown) {
  getMcpRequestContext()?.onToolInvocationComplete?.({
    toolName,
    arguments: args,
    connectionId: auditConnectionId(args),
    responseClass: 'tool_error',
  })
  return mcpToolFailure(toToolError(error))
}

export async function runTool(
  toolName: string,
  args: RawArgs,
  invoke: () => Promise<Record<string, unknown>>
) {
  try {
    const result = await invoke()
    return finalizeToolSuccess(toolName, args, result)
  } catch (error) {
    return finalizeToolFailure(toolName, args, error)
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

function registerFromCatalog<Input, Output extends Record<string, unknown>>(
  server: McpServer,
  name: string,
  handler: Handler<Input, Output> | undefined,
  toInput: (args: RawArgs) => Input
): void {
  if (!handler) return
  const definition = requireDefinition(name)
  if (!definition.outputSchema) {
    throw new Error(`MCP tool ${name} must declare an output schema.`)
  }

  server.registerTool(
    name,
    {
      title: definition.title,
      description: buildDescription(definition),
      inputSchema: definition.inputSchema,
      outputSchema: withSafetyMetadata(definition.outputSchema),
      annotations: definition.annotations,
    },
    async (args) => runTool(name, args as RawArgs, () => handler(toInput(args as RawArgs)))
  )
}

function requireDefinition(name: string): McpToolDefinition {
  const definition = getMcpToolDefinition(name)
  if (!definition) {
    throw new Error(`MCP tool ${name} is not in the catalog.`)
  }
  return definition
}

function buildDescription(definition: McpToolDefinition): string {
  const scopes = `Requires scope${definition.requiredScopes.length === 1 ? '' : 's'}: ${definition.requiredScopes.join(', ')}.`
  const optional =
    definition.optionalScopes.length > 0
      ? ` Optional scopes that add detail: ${definition.optionalScopes.join(', ')}.`
      : ''
  return `${definition.description} ${scopes}${optional}`
}

function registerPing(server: McpServer): void {
  const definition = requireDefinition('ping')
  server.registerTool(
    'ping',
    {
      title: definition.title,
      description: buildDescription(definition),
      annotations: definition.annotations,
    },
    async () => ({ content: [{ type: 'text' as const, text: 'pong' }] })
  )
}

export function registerTools(server: McpServer, options: RegisterToolsOptions): void {
  registerPing(server)

  const principal = getPrincipalFromContext
  const connection = (args: RawArgs) => ({
    principal: principal(),
    connectionId: str(args.connectionId),
  })
  const paged = (args: RawArgs) => ({
    cursor: parseCursor(args.cursor),
    pageSize: parsePageSize(args.pageSize),
  })

  registerFromCatalog(server, 'list_connections', options.listConnections, (args) => ({
    principal: principal(),
    ...paged(args),
  }))
  registerFromCatalog(server, 'list_queues', options.listQueues, (args) => ({
    ...connection(args),
    ...paged(args),
  }))
  registerFromCatalog(server, 'get_queue', options.getQueue, (args) => ({
    ...connection(args),
    queueName: str(args.queueName),
  }))
  registerFromCatalog(server, 'get_connection_overview', options.getConnectionOverview, (args) => ({
    ...connection(args),
    grantedScopes: getGrantedScopesFromContext(),
  }))
  registerFromCatalog(server, 'list_jobs', options.listJobs, (args) => ({
    ...connection(args),
    ...paged(args),
    queueName: str(args.queueName),
    status: optStr(args.status) as McpJobState | undefined,
    name: optStr(args.name),
    jobId: optStr(args.jobId),
  }))
  registerFromCatalog(server, 'find_job', options.findJob, (args) => ({
    ...connection(args),
    jobId: str(args.jobId),
  }))
  registerFromCatalog(server, 'get_job', options.getJob, (args) => ({
    ...connection(args),
    queueName: str(args.queueName),
    jobId: str(args.jobId),
  }))
  registerFromCatalog(server, 'get_job_logs', options.getJobLogs, (args) => ({
    ...connection(args),
    ...paged(args),
    queueName: str(args.queueName),
    jobId: str(args.jobId),
  }))
  registerFromCatalog(server, 'get_job_stacktraces', options.getJobStacktraces, (args) => ({
    ...connection(args),
    ...paged(args),
    queueName: str(args.queueName),
    jobId: str(args.jobId),
  }))
  registerFromCatalog(server, 'explain_job_failure', options.explainJobFailure, (args) => ({
    ...connection(args),
    queueName: str(args.queueName),
    jobId: str(args.jobId),
    grantedScopes: getGrantedScopesFromContext(),
  }))
  registerFromCatalog(server, 'list_scheduled_jobs', options.listScheduledJobs, (args) => ({
    ...connection(args),
    ...paged(args),
    queueName: optStr(args.queueName),
  }))
  registerFromCatalog(server, 'get_scheduled_job', options.getScheduledJob, (args) => ({
    ...connection(args),
    queueName: str(args.queueName),
    schedulerId: str(args.schedulerId),
  }))
  registerFromCatalog(server, 'get_workers', options.getWorkers, (args) => ({
    ...connection(args),
    ...paged(args),
    queueName: optStr(args.queueName),
  }))
  registerFromCatalog(server, 'get_queue_metrics', options.getQueueMetrics, (args) => ({
    ...connection(args),
    queueName: str(args.queueName),
    windowMinutes: optNum(args.windowMinutes),
  }))
  registerFromCatalog(server, 'get_redis_health', options.getRedisHealth, (args) => ({
    ...connection(args),
    windowMinutes: optNum(args.windowMinutes),
    targetPoints: optNum(args.targetPoints),
  }))
  registerFromCatalog(server, 'get_failure_events', options.getFailureEvents, (args) => ({
    ...connection(args),
    ...paged(args),
    queueName: optStr(args.queueName),
    jobId: optStr(args.jobId),
    status: optStr(args.status) as GetFailureEventsHandlerInput['status'],
    acknowledged: optBool(args.acknowledged),
    alertRuleId: optStr(args.alertRuleId),
  }))
  registerFromCatalog(server, 'get_alert_event', options.getAlertEvent, (args) => ({
    ...connection(args),
    eventId: str(args.eventId),
  }))
  registerFromCatalog(server, 'get_alert_summary', options.getAlertSummary, (args) =>
    connection(args)
  )
  registerFromCatalog(server, 'list_alert_rules', options.listAlertRules, (args) => ({
    ...connection(args),
    ...paged(args),
  }))
  registerFromCatalog(server, 'get_alert_rule', options.getAlertRule, (args) => ({
    ...connection(args),
    ruleId: str(args.ruleId),
  }))

  const eventMutation = (args: RawArgs) => ({
    ...connection(args),
    eventId: str(args.eventId),
  })
  registerFromCatalog(server, 'resolve_alert_event', options.resolveAlertEvent, eventMutation)
  registerFromCatalog(
    server,
    'acknowledge_alert_event',
    options.acknowledgeAlertEvent,
    eventMutation
  )
  registerFromCatalog(
    server,
    'unacknowledge_alert_event',
    options.unacknowledgeAlertEvent,
    eventMutation
  )
  registerFromCatalog(server, 'snooze_alert_rule', options.snoozeAlertRule, (args) => ({
    ...connection(args),
    ruleId: str(args.ruleId),
    minutes: optNum(args.minutes) ?? 60,
  }))
  registerFromCatalog(server, 'unsnooze_alert_rule', options.unsnoozeAlertRule, (args) => ({
    ...connection(args),
    ruleId: str(args.ruleId),
  }))

  const jobMutation = (args: RawArgs) => ({
    ...connection(args),
    queueName: str(args.queueName),
    jobId: str(args.jobId),
  })
  registerFromCatalog(server, 'retry_job', options.retryJob, jobMutation)
  registerFromCatalog(server, 'promote_job', options.promoteJob, jobMutation)

  const queueMutation = (args: RawArgs) => ({
    ...connection(args),
    queueName: str(args.queueName),
  })
  registerFromCatalog(server, 'pause_queue', options.pauseQueue, queueMutation)
  registerFromCatalog(server, 'resume_queue', options.resumeQueue, queueMutation)
}
