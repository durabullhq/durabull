import { env } from '@durabull/env'
import type { McpToolInvocationAuditInput } from '@durabull/mcp'
import { createMcpRoutes, getDefaultAllowedHosts, getProductionAllowedHosts } from '@durabull/mcp'

import { APP_VERSION } from '../lib/build-info'
import { hashMcpToolInput, writeMcpAuditEventNonBlocking } from './audit/mcp-audit'
import { assertMcpAuthConfiguration } from './auth/mcp-auth-config'
import { createMcpSessionMiddleware } from './auth/mcp-session-middleware'
import { createMcpToolRateLimitMiddleware } from './middleware/mcp-tool-rate-limit'
import { recordMcpTelemetry } from './observability/mcp-telemetry'
import { createMcpPolicyMiddleware } from './policy/mcp-policy-middleware'
import {
  acknowledgeAlertEventHandler,
  getAlertEventHandler,
  getAlertSummaryHandler,
  unacknowledgeAlertEventHandler,
} from './tools/alert-event-handlers'
import {
  getAlertRuleHandler,
  listAlertRulesHandler,
  snoozeAlertRuleHandler,
  unsnoozeAlertRuleHandler,
} from './tools/alert-rule-handlers'
import { explainJobFailureHandler } from './tools/explain-job-failure-handler'
import { findJobHandler } from './tools/find-job-handler'
import { getConnectionOverviewHandler } from './tools/get-connection-overview-handler'
import { getFailureEventsHandler } from './tools/get-failure-events-handler'
import { getJobHandler } from './tools/get-job-handler'
import { getJobLogsHandler } from './tools/get-job-logs-handler'
import { getJobStacktracesHandler } from './tools/get-job-stacktraces-handler'
import { getQueueHandler } from './tools/get-queue-handler'
import { getQueueMetricsHandler } from './tools/get-queue-metrics-handler'
import { getRedisHealthHandler } from './tools/get-redis-health-handler'
import { getWorkersHandler } from './tools/get-workers-handler'
import { promoteJobHandler, retryJobHandler } from './tools/job-mutation-handlers'
import { listConnectionsHandler } from './tools/list-connections-handler'
import { listJobsHandler } from './tools/list-jobs-handler'
import { listQueuesHandler } from './tools/list-queues-handler'
import { pauseQueueHandler, resumeQueueHandler } from './tools/queue-mutation-handlers'
import { resolveAlertEventHandler } from './tools/resolve-alert-event-handler'
import { getScheduledJobHandler, listScheduledJobsHandler } from './tools/scheduled-jobs-handlers'

/**
 * Thin API ingress: mounts MCP Streamable HTTP transport at `/mcp`.
 * Protocol, transport, the tool/resource/prompt catalog, and schemas live in `@durabull/mcp`;
 * this module supplies the domain handlers and the auth/policy/audit middleware chain.
 */
export async function mountMcpIngress() {
  assertMcpAuthConfiguration()

  const appBaseUrl = env.APP_BASE_URL ?? 'http://localhost:5173'
  const isProduction = env.NODE_ENV === 'production'
  const authMiddleware = await createMcpSessionMiddleware(appBaseUrl)
  const policyMiddleware = createMcpPolicyMiddleware()
  const toolRateLimitMiddleware = createMcpToolRateLimitMiddleware()

  return createMcpRoutes({
    version: APP_VERSION,
    allowedHosts: isProduction
      ? getProductionAllowedHosts(appBaseUrl)
      : getDefaultAllowedHosts({ appBaseUrl, includeDevHosts: true }),
    corsOrigins: [appBaseUrl],
    allowHostnameWithoutPort: !isProduction,
    toolHandlers: {
      // Connections & queues
      listConnections: listConnectionsHandler,
      listQueues: listQueuesHandler,
      getQueue: getQueueHandler,
      getConnectionOverview: getConnectionOverviewHandler,
      // Jobs
      listJobs: listJobsHandler,
      findJob: findJobHandler,
      getJob: getJobHandler,
      getJobLogs: getJobLogsHandler,
      getJobStacktraces: getJobStacktracesHandler,
      explainJobFailure: explainJobFailureHandler,
      // Scheduled jobs
      listScheduledJobs: listScheduledJobsHandler,
      getScheduledJob: getScheduledJobHandler,
      // Workers & metrics
      getWorkers: getWorkersHandler,
      getQueueMetrics: getQueueMetricsHandler,
      getRedisHealth: getRedisHealthHandler,
      // Alerts (read)
      getFailureEvents: getFailureEventsHandler,
      getAlertEvent: getAlertEventHandler,
      getAlertSummary: getAlertSummaryHandler,
      listAlertRules: listAlertRulesHandler,
      getAlertRule: getAlertRuleHandler,
      // Alerts (write)
      resolveAlertEvent: resolveAlertEventHandler,
      acknowledgeAlertEvent: acknowledgeAlertEventHandler,
      unacknowledgeAlertEvent: unacknowledgeAlertEventHandler,
      snoozeAlertRule: snoozeAlertRuleHandler,
      unsnoozeAlertRule: unsnoozeAlertRuleHandler,
      // Jobs & queues (write)
      retryJob: retryJobHandler,
      promoteJob: promoteJobHandler,
      pauseQueue: pauseQueueHandler,
      resumeQueue: resumeQueueHandler,
    },
    requestContextResolver: (c) => {
      const principal = c.get('mcpPrincipal')
      const decision = c.get('mcpPolicyDecision')
      if (!principal) {
        return undefined
      }

      const recordToolInvocation = (input: McpToolInvocationAuditInput) => {
        if (!decision) return

        recordMcpTelemetry({
          signal: input.responseClass === 'success' ? 'tool_success' : 'tool_error',
          toolName: input.toolName,
          principalId: decision.principalId,
          principalType: decision.principalType,
          userId: principal.type === 'delegated_user' ? principal.userId : null,
          organizationId: decision.organizationId,
          correlationId: decision.correlationId,
          redactionCount: input.redactionCount,
        })

        writeMcpAuditEventNonBlocking({
          correlationId: decision.correlationId,
          principalType: decision.principalType,
          principalId: decision.principalId,
          organizationId: decision.organizationId,
          connectionId: input.connectionId ?? decision.connectionId,
          toolName: input.toolName,
          requiredScopes: decision.requiredScopes,
          granted: true,
          inputHash: c.get('mcpToolInputHash') ?? hashMcpToolInput(input.arguments),
          responseClass: input.responseClass,
        })
      }

      return {
        principal:
          principal.type === 'delegated_user'
            ? {
                type: 'delegated_user' as const,
                principalId: principal.principalId,
                userId: principal.userId,
              }
            : {
                type: 'service_account' as const,
                principalId: principal.principalId,
                organizationId: principal.organizationId,
              },
        correlationId: decision?.correlationId,
        grantedScopes: c.get('mcpGrantedScopes'),
        resolvedConnection: c.get('mcpResolvedConnection'),
        onToolInvocationComplete: recordToolInvocation,
        onRedactionApplied: (redactionCount) => {
          recordMcpTelemetry({
            signal: 'redaction_applied',
            count: redactionCount,
            toolName: decision?.toolName,
            principalId: decision?.principalId,
            principalType: decision?.principalType,
            userId: principal.type === 'delegated_user' ? principal.userId : null,
            organizationId: decision?.organizationId,
            correlationId: decision?.correlationId,
          })
        },
      }
    },
    middleware: [authMiddleware, toolRateLimitMiddleware, policyMiddleware],
  })
}
