import { alertEventRepository } from '@durabull/dal'
import type { ExplainJobFailureHandlerInput, ExplainJobFailureHandlerOutput } from '@durabull/mcp'
import { MCP_SCOPE_FAILURES_READ, MCP_SCOPE_LOGS_READ } from '@durabull/mcp/auth'
import { toRedisConnectionOptions } from '../../lib/connection-options'
import { getQueue } from '../../lib/redis'
import { sanitizeMcpText, toMcpAlertEventSummary } from './mcp-sanitize'
import { hasGrantedScope, McpToolError, requireConnectionForPrincipal } from './shared'

interface ExplainJobFailureHandlerDeps {
  getQueue: typeof getQueue
  requireConnectionForPrincipal: typeof requireConnectionForPrincipal
  findAlertEvents: typeof alertEventRepository.findByConnection
  countAlertEvents: typeof alertEventRepository.countByConnection
}

const EXPLAIN_LOG_LINE_COUNT = 5

type SkippedSource = ExplainJobFailureHandlerOutput['skippedSources'][number]

function pickTopSignal(input: {
  failedReason: string | null
  stacktrace: string | null
  logLines: string[]
}): ExplainJobFailureHandlerOutput['topSignal'] {
  const failedReason = sanitizeMcpText(input.failedReason)
  if (failedReason) {
    return {
      source: 'failed_reason',
      excerpt: failedReason,
    }
  }

  const stacktrace = sanitizeMcpText(input.stacktrace)
  if (stacktrace) {
    return {
      source: 'stacktrace',
      excerpt: stacktrace,
    }
  }

  const lastLog = [...input.logLines]
    .reverse()
    .map((line) => sanitizeMcpText(line))
    .find((line): line is string => !!line)
  if (lastLog) {
    return {
      source: 'logs',
      excerpt: lastLog,
    }
  }

  return {
    source: 'none',
    excerpt: 'No failure reason, stacktrace, or logs were available for this job.',
  }
}

function buildSummary(input: {
  queueName: string
  jobId: string
  status: string
  failedReason: string | null
  topSignal: ExplainJobFailureHandlerOutput['topSignal']
  alertCount: number | null
  skipped: SkippedSource[]
}): string {
  if (input.status !== 'failed') {
    return `Job ${input.jobId} in queue ${input.queueName} is currently "${input.status}", not failed.`
  }

  const signalLine =
    input.topSignal.source === 'none'
      ? 'No dominant failure signal was found in job metadata.'
      : `Top signal (${input.topSignal.source}): ${input.topSignal.excerpt}`

  const alertLine =
    input.alertCount === null
      ? 'Related alert events were not checked (missing mcp:failures:read).'
      : input.alertCount > 0
        ? `${input.alertCount} related alert event(s) were found.`
        : 'No related alert events were found.'

  const reasonLine = input.failedReason
    ? `BullMQ failedReason: ${input.failedReason}`
    : 'BullMQ did not provide a failedReason.'

  const skippedLine =
    input.skipped.length > 0
      ? `Skipped evidence: ${input.skipped.map((entry) => entry.source).join(', ')}.`
      : ''

  return (
    sanitizeMcpText([reasonLine, signalLine, alertLine, skippedLine].filter(Boolean).join(' ')) ??
    ''
  )
}

export function createExplainJobFailureHandler(
  deps: ExplainJobFailureHandlerDeps = {
    getQueue,
    requireConnectionForPrincipal,
    findAlertEvents: alertEventRepository.findByConnection,
    countAlertEvents: alertEventRepository.countByConnection,
  }
) {
  return async function explainJobFailureHandler(
    input: ExplainJobFailureHandlerInput
  ): Promise<ExplainJobFailureHandlerOutput> {
    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)

    const includeLogs = hasGrantedScope(input.grantedScopes, MCP_SCOPE_LOGS_READ)
    const includeAlerts = hasGrantedScope(input.grantedScopes, MCP_SCOPE_FAILURES_READ)
    const skippedSources: SkippedSource[] = []
    if (!includeLogs) {
      skippedSources.push(
        { source: 'job.stacktrace', reason: `missing_scope:${MCP_SCOPE_LOGS_READ}` },
        { source: 'queue.getJobLogs', reason: `missing_scope:${MCP_SCOPE_LOGS_READ}` }
      )
    }
    if (!includeAlerts) {
      skippedSources.push({
        source: 'alert_event',
        reason: `missing_scope:${MCP_SCOPE_FAILURES_READ}`,
      })
    }

    const queue = await deps.getQueue(
      connection.id,
      connection.url,
      input.queueName,
      connection.prefix,
      toRedisConnectionOptions(connection.allowSelfSignedCerts)
    )
    const job = await queue.getJob(input.jobId)
    if (!job) {
      throw new McpToolError(
        'not_found',
        `Job ${input.jobId} not found in queue ${input.queueName}.`
      )
    }

    const alertFilters = {
      queueName: input.queueName,
      jobId: input.jobId,
    }

    const [status, logProbe, alertEvents, relatedAlertCount] = await Promise.all([
      job.getState(),
      includeLogs ? queue.getJobLogs(input.jobId, 0, 0) : Promise.resolve({ logs: [], count: 0 }),
      includeAlerts
        ? deps.findAlertEvents(connection.id, connection.organizationId, {
            offset: 0,
            limit: 5,
            ...alertFilters,
          })
        : Promise.resolve([]),
      includeAlerts
        ? deps.countAlertEvents(connection.id, connection.organizationId, alertFilters)
        : Promise.resolve(null),
    ])

    const logCount = logProbe.count ?? logProbe.logs?.length ?? 0
    const logStart = Math.max(0, logCount - EXPLAIN_LOG_LINE_COUNT)
    const logEnd = Math.max(0, logCount - 1)
    const logs =
      !includeLogs || logCount === 0
        ? logProbe
        : await queue.getJobLogs(input.jobId, logStart, logEnd)

    const logLines = (logs.logs ?? [])
      .map((line) => sanitizeMcpText(line))
      .filter((line): line is string => !!line)

    const isFailed = status === 'failed'
    const failedReason = isFailed ? sanitizeMcpText(job.failedReason ?? null) : null
    const stacktraces = isFailed && includeLogs ? (job.stacktrace ?? []) : []
    const latestStacktrace =
      stacktraces.length > 0 ? sanitizeMcpText(stacktraces[stacktraces.length - 1] ?? null) : null

    const topSignal = isFailed
      ? pickTopSignal({
          failedReason,
          stacktrace: latestStacktrace,
          logLines,
        })
      : {
          source: 'none' as const,
          excerpt: 'Job is not in failed state.',
        }

    const confidence: ExplainJobFailureHandlerOutput['confidence'] = !isFailed
      ? 'low'
      : topSignal.source === 'failed_reason' || topSignal.source === 'stacktrace'
        ? 'high'
        : topSignal.source === 'logs'
          ? 'medium'
          : 'low'

    const relatedAlertEvents = isFailed
      ? alertEvents.map((event) => {
          const summary = toMcpAlertEventSummary(event)
          return {
            id: summary.id,
            type: summary.type,
            status: summary.status,
            summary: summary.summary,
            firedAt: summary.firedAt,
            context: summary.context,
          }
        })
      : []

    const sources = isFailed
      ? [
          'job.failedReason',
          ...(includeLogs ? ['job.stacktrace', 'queue.getJobLogs'] : []),
          ...(includeAlerts ? ['alert_event'] : []),
        ]
      : ['job.state']

    return {
      connectionId: connection.id,
      queueName: input.queueName,
      jobId: input.jobId,
      status,
      summary: buildSummary({
        queueName: input.queueName,
        jobId: input.jobId,
        status,
        failedReason,
        topSignal,
        alertCount: relatedAlertCount,
        skipped: isFailed ? skippedSources : [],
      }),
      failedReason,
      attemptTimeline: {
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts ?? 1,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
        timestamp: job.timestamp ?? null,
      },
      topSignal,
      relatedAlertEvents,
      recentLogLines: isFailed ? logLines.slice(-EXPLAIN_LOG_LINE_COUNT) : [],
      confidence,
      sources,
      skippedSources: isFailed ? skippedSources : [],
    }
  }
}

export const explainJobFailureHandler = createExplainJobFailureHandler()
