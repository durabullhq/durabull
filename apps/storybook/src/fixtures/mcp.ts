import { fixture as baseFixture } from '../../../../packages/mcp/scripts/preview/fixtures'
import { getMcpToolDefinition } from '../../../../packages/mcp/src/tools/tool-catalog'

const time = '2026-10-08T12:00:00Z'
const healthMetrics = {
  memoryUsagePercent: 62,
  usedMemoryBytes: 665719930,
  residentMemoryBytes: 730144440,
  memoryCapacityBytes: 1073741824,
  cpuUsagePercent: 18,
  memoryFragmentationRatio: 1.1,
  memoryFragmentationBytes: 64424510,
  connectedClientsPercent: 12,
  connectedClients: 120,
  maxClients: 1000,
  blockedClients: 0,
  evictedKeysPerMinute: 0,
  rejectedConnectionsPerMinute: 0,
}
const scheduledJob = {
  schedulerId: 'daily-summary',
  queueName: 'email:receipts',
  jobName: 'send-summary',
  pattern: '0 9 * * *',
  everyMs: null,
  timezone: 'UTC',
  nextRunAt: '2026-10-09T09:00:00Z',
  startDate: null,
  endDate: null,
  limit: null,
  iterationCount: 32,
  recentFailedCount: 1,
  lastFailedAt: time,
  data: { report: 'daily' },
  templateOptions: { attempts: 3 },
}
export function mcpFixture(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const connectionId = args.connectionId ?? 'preview-production'
  const queueName = args.queueName ?? 'email:receipts'
  let data: Record<string, unknown>
  switch (name) {
    case 'list_scheduled_jobs':
      data = {
        connectionId,
        queueName,
        scheduledJobs: [scheduledJob],
        total: 1,
        queuesScanned: 1,
        totalQueues: 3,
        nextCursor: null,
      }
      break
    case 'get_scheduled_job':
      data = { connectionId, scheduledJob }
      break
    case 'get_queue_metrics':
      data = {
        connectionId,
        queueName,
        range: {
          requestedWindowMinutes: 60,
          returnedPoints: 60,
          oldestPointTimestamp: 1791457200000,
          newestPointTimestamp: 1791460800000,
          latestPointAgeMs: 0,
          requestedWindowCoverage: 1,
        },
        totals: {
          completedInWindow: 1200,
          failedInWindow: 7,
          finishedInWindow: 1207,
          successRateInWindow: 0.994,
          failureRateInWindow: 0.006,
          avgCompletedPerMinuteInWindow: 20,
          avgFailedPerMinuteInWindow: 0.12,
          longestFailureStreakMinutesInWindow: 1,
          longestCompletionStreakMinutesInWindow: 60,
          completedLifetime: 84592,
          failedLifetime: 7,
          failureRateLifetime: 0.00008,
          estimatedDrainMinutes: 6.4,
        },
        counts: {
          waiting: 128,
          active: 12,
          delayed: 8,
          completed: 84592,
          failed: 7,
          paused: 0,
          prioritized: 3,
          waitingChildren: 0,
        },
        queue: {
          isPaused: false,
          isMaxed: false,
          waitingToProcess: 131,
          workersCount: 3,
          schedulersCount: 1,
        },
        warnings: [],
      }
      break
    case 'get_redis_health':
      data = {
        connectionId,
        collectionEnabled: true,
        retentionDays: 30,
        staleAfterMs: 120000,
        latest: {
          ...healthMetrics,
          capturedAt: time,
          memoryCapacitySource: 'maxmemory',
          isStale: false,
        },
        thresholds: [
          {
            ruleId: 'demo-rule',
            name: 'Memory pressure',
            metric: 'memory_usage_percent',
            threshold: 85,
          },
        ],
        range: {
          from: '2026-10-08T11:00:00Z',
          to: time,
          bucketMinutes: 1,
          aggregation: 'max',
          totalBuckets: 60,
          sampledBuckets: 60,
          coveragePercent: 100,
        },
        series: Array.from({ length: 60 }, (_, i) => ({
          ...healthMetrics,
          memoryUsagePercent: 55 + (i % 10),
          capturedAt: new Date(Date.parse(time) - (59 - i) * 60000).toISOString(),
          sampleCount: 1,
        })),
      }
      break
    case 'explain_job_failure':
      data = {
        connectionId,
        queueName,
        jobId: 'job-1042',
        status: 'failed',
        summary: 'The demo email provider returned HTTP 503 after three attempts.',
        failedReason: 'Upstream provider unavailable',
        attemptTimeline: {
          attemptsMade: 3,
          maxAttempts: 3,
          processedOn: 1791460800000,
          finishedOn: 1791460801000,
          timestamp: 1791460799000,
        },
        topSignal: { source: 'failed_reason', excerpt: 'HTTP 503' },
        relatedAlertEvents: [],
        recentLogLines: ['Provider returned 503', 'Retries exhausted'],
        confidence: 'high',
        sources: ['failed_reason', 'logs'],
        skippedSources: [],
      }
      break
    case 'get_alert_summary':
      data = {
        connectionId,
        open: 2,
        firing: 1,
        acknowledged: 1,
        byQueue: [{ queueName, open: 2 }],
        byRule: [{ alertRuleId: 'rule-1', ruleName: 'Receipt failures', open: 2 }],
        rules: { total: 3, active: 2, snoozed: 1, disabled: 0 },
        truncated: false,
      }
      break
    default:
      data = baseFixture(name, args)
  }
  return getMcpToolDefinition(name)!.outputSchema!.parse(data) as Record<string, unknown>
}
