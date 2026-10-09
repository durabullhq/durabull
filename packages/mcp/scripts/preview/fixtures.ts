const counts = {
  waiting: 128,
  active: 12,
  delayed: 8,
  completed: 84592,
  failed: 7,
  paused: 0,
  prioritized: 3,
}
const job = {
  id: 'job-1042',
  name: 'send-receipt',
  status: 'failed',
  attemptsMade: 3,
  maxAttempts: 3,
  failedReason: 'Upstream email provider returned HTTP 503.',
  processedOn: 1791367000000,
  finishedOn: 1791367000300,
  timestamp: 1791366990000,
  delay: 0,
  priority: 0,
}
const event = {
  id: 'evt-1',
  alertRuleId: 'rule-1',
  queueName: 'email:receipts',
  type: 'job_failed',
  status: 'firing',
  summary: 'Email delivery failing',
  context: null,
  firedAt: '2026-10-07T10:05:00Z',
  resolvedAt: null,
  acknowledgedAt: null,
}
const rule = {
  id: 'rule-1',
  name: 'Receipt delivery failures',
  type: 'job_failed',
  state: 'active',
  enabled: true,
  mutedUntil: null,
  queueName: 'email:receipts',
  queueFilterMode: null,
  filterQueueNames: [],
  cooldownMinutes: 15,
  config: { threshold: 5 },
  notificationChannels: [{ type: 'webhook' }],
  openEventCount: 2,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-07T00:00:00Z',
}
const schedule = {
  schedulerId: 'daily-receipts',
  queueName: 'email:receipts',
  jobName: 'Receipt digest',
  pattern: '0 9 * * *',
  everyMs: null,
  timezone: 'America/Los_Angeles',
  nextRunAt: '2026-10-08T16:00:00Z',
  startDate: null,
  endDate: null,
  limit: null,
  iterationCount: 31,
  recentFailedCount: 1,
  lastFailedAt: '2026-10-07T16:00:00Z',
  data: { template: 'daily-digest', apiKey: '[redacted]' },
  templateOptions: { attempts: 3 },
}
const health = {
  memoryUsagePercent: 75.6,
  usedMemoryBytes: 811748818,
  residentMemoryBytes: 891748818,
  memoryCapacityBytes: 1073741824,
  cpuUsagePercent: 12.4,
  memoryFragmentationRatio: 1.1,
  memoryFragmentationBytes: 80000000,
  connectedClientsPercent: 4.2,
  connectedClients: 42,
  maxClients: 1000,
  blockedClients: 12,
  evictedKeysPerMinute: 0,
  rejectedConnectionsPerMinute: 0,
}
/** Schema-checked demo data that preserves the connection selected by the host. */
export const fixture = (name: string, args: Record<string, unknown>) => {
  const connectionId = args.connectionId
  if (
    name !== 'list_connections' &&
    connectionId !== 'preview-production' &&
    connectionId !== 'preview-staging'
  ) {
    throw new Error('Unknown preview connection')
  }
  const isStaging = connectionId === 'preview-staging'
  switch (name) {
    case 'list_connections':
      return {
        connections: [
          {
            id: 'preview-production',
            name: 'Production',
            environment: 'production',
            prefix: 'bull',
            isDefault: true,
            organizationId: 'preview',
          },
          {
            id: 'preview-staging',
            name: 'Staging',
            environment: 'staging',
            prefix: 'bull',
            isDefault: false,
            organizationId: 'preview',
          },
        ],
        nextCursor: null,
      }
    case 'get_connection_overview':
      return {
        connectionId,
        name: isStaging ? 'Staging' : 'Production',
        environment: isStaging ? 'staging' : 'production',
        prefix: 'bull',
        discovery: { totalQueues: 3, confirmed: 3, pending: 0, lastDiscoveredAt: null },
        queues: {
          scanned: 3,
          truncated: false,
          totals: counts,
          paused: [],
          withoutWorkers: [],
          topFailed: [{ name: 'email:receipts', failed: 7 }],
          topBacklog: [
            { name: 'email:receipts', waiting: 128 },
            { name: 'image:resize', waiting: 26 },
          ],
        },
        workers: { total: 12 },
        alerts: { open: 2, firing: 2, acknowledged: 0 },
        redisHealth: null,
        warnings: [],
      }
    case 'list_queues':
      return {
        connectionId,
        total: 3,
        queues: (args.cursor
          ? ['<img src=x onerror=alert(1)>']
          : ['email:receipts', 'image:resize']
        ).map((name) => ({
          name,
          status: 'active',
          isPaused: false,
          discoveryState: 'confirmed',
          jobCounts: counts,
        })),
        nextCursor: args.cursor ? null : 'page-2',
      }
    case 'get_queue':
      return {
        connectionId,
        name: args.queueName,
        status: 'active',
        isPaused: false,
        scheduledJobsCount: 2,
        jobCounts: counts,
        workers: [
          { id: 'w1', name: 'worker-us-west', address: '10.0.0.1', ageMs: 8640000, idleMs: 250 },
        ],
      }
    case 'list_jobs':
      return { connectionId, queueName: args.queueName, total: 1, jobs: [job], nextCursor: null }
    case 'get_job':
      return {
        connectionId,
        queueName: args.queueName,
        job: {
          ...job,
          data: { orderId: 'ord-9281', apiKey: '[redacted]', subject: '<script>alert(1)</script>' },
          progress: 0,
          opts: {},
          returnvalue: null,
          stacktraceCount: 3,
        },
      }
    case 'get_job_logs':
      return {
        connectionId,
        queueName: args.queueName,
        jobId: job.id,
        logs: [
          'Preparing receipt for order ord-9281',
          'Provider request returned 503',
          'Retries exhausted',
        ],
        total: 3,
        nextCursor: null,
      }
    case 'get_job_stacktraces':
      return {
        connectionId,
        queueName: args.queueName,
        jobId: job.id,
        stacktraces: [
          {
            attemptNumber: 3,
            stacktrace: 'Error: upstream unavailable\n at sendReceipt (worker.ts:42)',
            isLatest: true,
          },
        ],
        total: 1,
        nextCursor: null,
      }
    case 'get_failure_events':
      return {
        connectionId,
        total: 1,
        events: [
          {
            id: 'evt-1',
            alertRuleId: 'rule-1',
            queueName: 'email:receipts',
            type: 'job_failed',
            status: 'firing',
            summary: 'Email delivery failing',
            context: null,
            firedAt: '2026-10-07T10:05:00Z',
            resolvedAt: null,
            acknowledgedAt: null,
          },
        ],
        nextCursor: null,
      }
    case 'get_alert_event':
      return {
        connectionId,
        event: {
          ...event,
          notificationSentAt: null,
          deliveries: [
            {
              id: 'delivery-1',
              channelType: 'webhook',
              status: 'failed',
              attemptCount: 3,
              lastError: 'Notification endpoint returned 503',
              externalIdentifier: null,
              externalUrl: null,
              nextRetryAt: '2026-10-07T10:15:00Z',
              updatedAt: '2026-10-07T10:10:00Z',
            },
          ],
        },
      }
    case 'get_alert_summary':
      return {
        connectionId,
        open: 2,
        firing: 2,
        acknowledged: 0,
        byQueue: [{ queueName: 'email:receipts', open: 2 }],
        byRule: [{ alertRuleId: rule.id, ruleName: rule.name, open: 2 }],
        rules: { total: 1, active: 1, snoozed: 0, disabled: 0 },
        truncated: false,
      }
    case 'list_alert_rules':
      return { connectionId, total: 1, rules: [rule], nextCursor: null }
    case 'get_alert_rule':
      return { connectionId, rule, recentEvents: [event] }
    case 'list_scheduled_jobs':
      return {
        connectionId,
        queueName: args.queueName ?? null,
        scheduledJobs: [schedule],
        total: args.queueName ? 1 : null,
        queuesScanned: 3,
        totalQueues: 3,
        nextCursor: null,
      }
    case 'get_scheduled_job':
      return { connectionId, scheduledJob: schedule }
    case 'find_job':
      return {
        connectionId,
        jobId: args.jobId,
        matches: args.jobId === job.id ? [{ queueName: 'email:receipts', job }] : [],
        queuesScanned: 3,
        totalQueues: 3,
        truncated: false,
      }
    case 'explain_job_failure':
      return {
        connectionId,
        queueName: args.queueName,
        jobId: job.id,
        status: job.status,
        summary: 'Email provider returned 503 on the final attempt.',
        failedReason: job.failedReason,
        attemptTimeline: {
          attemptsMade: 3,
          maxAttempts: 3,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          timestamp: job.timestamp,
        },
        topSignal: { source: 'failed_reason', excerpt: job.failedReason },
        relatedAlertEvents: [event],
        recentLogLines: ['Provider request returned 503'],
        confidence: 'high',
        sources: ['failed_reason', 'logs'],
        skippedSources: [],
      }
    case 'get_queue_metrics':
      return {
        connectionId,
        queueName: args.queueName,
        range: {
          requestedWindowMinutes: 60,
          returnedPoints: 60,
          oldestPointTimestamp: job.timestamp,
          newestPointTimestamp: job.timestamp + 3540000,
          latestPointAgeMs: 30000,
          requestedWindowCoverage: 1,
        },
        totals: {
          completedInWindow: 2400,
          failedInWindow: 7,
          finishedInWindow: 2407,
          successRateInWindow: 0.997,
          failureRateInWindow: 0.003,
          avgCompletedPerMinuteInWindow: 40,
          avgFailedPerMinuteInWindow: 0.12,
          longestFailureStreakMinutesInWindow: 2,
          longestCompletionStreakMinutesInWindow: 60,
          completedLifetime: 84592,
          failedLifetime: 100,
          failureRateLifetime: 0.0012,
          estimatedDrainMinutes: 3.2,
        },
        counts: { ...counts, waitingChildren: 0 },
        queue: {
          isPaused: false,
          isMaxed: false,
          waitingToProcess: 131,
          workersCount: 1,
          schedulersCount: 1,
        },
        warnings: [],
      }
    case 'get_redis_health': {
      const series = Array.from({ length: 24 }, (_, index) => ({
        ...health,
        memoryUsagePercent: index === 9 ? null : 48 + index * 1.2,
        capturedAt: new Date(Date.UTC(2026, 9, 7, index)).toISOString(),
        sampleCount: index === 9 ? 0 : 60,
      }))
      return {
        connectionId,
        collectionEnabled: true,
        retentionDays: 7,
        staleAfterMs: 120000,
        latest: {
          ...health,
          capturedAt: '2026-10-07T23:00:00Z',
          memoryCapacitySource: 'maxmemory',
          isStale: false,
        },
        thresholds: [
          { ruleId: rule.id, name: 'Memory pressure', metric: 'memoryUsagePercent', threshold: 85 },
        ],
        range: {
          from: '2026-10-07T00:00:00Z',
          to: '2026-10-08T00:00:00Z',
          bucketMinutes: 60,
          aggregation: 'max',
          totalBuckets: 24,
          sampledBuckets: 23,
          coveragePercent: 95.8,
        },
        series,
      }
    }
    case 'get_workers':
      return {
        connectionId,
        totalQueues: 3,
        totalWorkersInPage: 1,
        workers: [
          {
            id: 'w1',
            name: 'worker-us-west',
            address: '10.0.0.1',
            ageMs: 8640000,
            idleMs: 250,
            queueName: 'email:receipts',
          },
        ],
        queues: [],
        nextCursor: null,
      }
    default:
      throw new Error('No fixture for this view')
  }
}
