/**
 * Marketing fixtures for the embedded Queue Explorer MCP App. Each read tool answers with
 * data shaped exactly like the server's output schema (checked in mcp-demo-fixtures.test.ts)
 * and tells one story: email:receipts is failing because the SMTP provider is rate limiting.
 * Timestamps are relative to "now" so the cards never look stale.
 */

type Args = Record<string, unknown>
type Data = Record<string, unknown>

export const DEMO_CONNECTION_ID = 'demo-production'

const MINUTE = 60_000
const ago = (minutes: number, now: number) => new Date(now - minutes * MINUTE).toISOString()
const ahead = (minutes: number, now: number) => new Date(now + minutes * MINUTE).toISOString()

const counts = (waiting: number, active: number, failed: number, delayed = 0, completed = 0) => ({
  waiting,
  active,
  delayed,
  completed,
  failed,
  paused: 0,
  prioritized: 0,
})

const QUEUES = [
  { name: 'email:receipts', isPaused: false, jobCounts: counts(128, 4, 7, 0, 84_592) },
  { name: 'image:resize', isPaused: false, jobCounts: counts(26, 6, 0, 2, 412_118) },
  { name: 'webhooks:stripe', isPaused: false, jobCounts: counts(3, 2, 0, 0, 1_204_337) },
  { name: 'reports:nightly', isPaused: true, jobCounts: counts(0, 0, 0, 1, 311) },
  { name: 'search:reindex', isPaused: false, jobCounts: counts(0, 0, 0, 0, 7_420) },
]

const WORKERS = [
  {
    id: 'w-7f3a',
    name: 'receipts-1',
    address: '10.0.4.12',
    ageMs: 192 * MINUTE,
    idleMs: 0,
    queueName: 'email:receipts',
  },
  {
    id: 'w-91bc',
    name: 'receipts-2',
    address: '10.0.4.13',
    ageMs: 192 * MINUTE,
    idleMs: 2_000,
    queueName: 'email:receipts',
  },
  {
    id: 'w-c044',
    name: 'resize-1',
    address: '10.0.6.21',
    ageMs: 48 * MINUTE,
    idleMs: 0,
    queueName: 'image:resize',
  },
  {
    id: 'w-c045',
    name: 'resize-2',
    address: '10.0.6.22',
    ageMs: 48 * MINUTE,
    idleMs: 1_000,
    queueName: 'image:resize',
  },
  {
    id: 'w-2e18',
    name: 'stripe-1',
    address: '10.0.2.7',
    ageMs: 8_760 * MINUTE,
    idleMs: 4_000,
    queueName: 'webhooks:stripe',
  },
]

const FAILED_REASON = '421 4.7.0 Try again later, rate limited'

const job = (now: number) => ({
  id: '48213',
  name: 'send-receipt',
  status: 'failed',
  attemptsMade: 3,
  maxAttempts: 3,
  failedReason: FAILED_REASON,
  processedOn: now - 18 * MINUTE,
  finishedOn: now - 18 * MINUTE + 1_400,
  timestamp: now - 20 * MINUTE,
  delay: 0,
  priority: 0,
})

const events = (now: number) => [
  {
    id: 'evt_8c21',
    alertRuleId: 'rule-receipts',
    queueName: 'email:receipts',
    type: 'failure_threshold',
    status: 'firing',
    summary: '7 failed jobs in 15 minutes (threshold 5)',
    context: null,
    firedAt: ago(8, now),
    resolvedAt: null,
    acknowledgedAt: null,
  },
  {
    id: 'evt_8c1f',
    alertRuleId: 'rule-receipts',
    queueName: 'email:receipts',
    type: 'failure_threshold',
    status: 'firing',
    summary: '5 failed jobs in 15 minutes (threshold 5)',
    context: null,
    firedAt: ago(19, now),
    resolvedAt: null,
    acknowledgedAt: null,
  },
  {
    id: 'evt_8b90',
    alertRuleId: 'rule-resize',
    queueName: 'image:resize',
    type: 'queue_stalled',
    status: 'resolved',
    summary: 'Backlog above 500 for 10 minutes',
    context: null,
    firedAt: ago(170, now),
    resolvedAt: ago(142, now),
    acknowledgedAt: ago(165, now),
  },
]

const rule = (
  now: number,
  id: string,
  name: string,
  type: string,
  queueName: string,
  extra: Partial<{
    state: 'active' | 'snoozed'
    openEventCount: number
    cooldownMinutes: number
    config: Data
  }> = {}
) => ({
  id,
  name,
  type,
  state: extra.state ?? 'active',
  enabled: true,
  mutedUntil: extra.state === 'snoozed' ? ahead(45, now) : null,
  queueName,
  queueFilterMode: null,
  filterQueueNames: [],
  cooldownMinutes: extra.cooldownMinutes ?? 15,
  config: extra.config ?? {},
  notificationChannels: [{ type: 'slack' }],
  openEventCount: extra.openEventCount ?? 0,
  createdAt: ago(60 * 24 * 30, now),
  updatedAt: ago(60 * 24 * 2, now),
})

const rules = (now: number) => [
  rule(now, 'rule-receipts', 'Receipt delivery failures', 'failure_threshold', 'email:receipts', {
    openEventCount: 2,
    config: { threshold: 5, windowMinutes: 15 },
  }),
  rule(now, 'rule-resize', 'Resize backlog > 500', 'queue_stalled', 'image:resize', {
    cooldownMinutes: 30,
    config: { backlog: 500 },
  }),
  rule(now, 'rule-stripe', 'Stripe webhook failure rate', 'failure_rate', 'webhooks:stripe', {
    state: 'snoozed',
    cooldownMinutes: 10,
    config: { rate: 0.02 },
  }),
]

const schedules = (now: number) => [
  {
    schedulerId: 'nightly-rollup',
    queueName: 'reports:nightly',
    jobName: 'rollup',
    pattern: '0 2 * * *',
    everyMs: null,
    timezone: 'America/New_York',
    nextRunAt: ahead(11 * 60, now),
    startDate: null,
    endDate: null,
    limit: null,
    iterationCount: 212,
    recentFailedCount: 0,
    lastFailedAt: null,
    data: { report: 'daily-revenue' },
    templateOptions: { attempts: 3 },
  },
  {
    schedulerId: 'digest-weekly',
    queueName: 'email:receipts',
    jobName: 'send-digest',
    pattern: '0 9 * * MON',
    everyMs: null,
    timezone: 'UTC',
    nextRunAt: ahead(3 * 24 * 60, now),
    startDate: null,
    endDate: null,
    limit: null,
    iterationCount: 41,
    recentFailedCount: 1,
    lastFailedAt: ago(4 * 24 * 60, now),
    data: { template: 'weekly-digest', apiKey: '[redacted]' },
    templateOptions: { attempts: 3 },
  },
  {
    schedulerId: 'reindex-hourly',
    queueName: 'search:reindex',
    jobName: 'reindex',
    pattern: null,
    everyMs: 60 * MINUTE,
    timezone: null,
    nextRunAt: ahead(22, now),
    startDate: null,
    endDate: null,
    limit: null,
    iterationCount: 7_420,
    recentFailedCount: 0,
    lastFailedAt: null,
    data: {},
    templateOptions: {},
  },
]

const redis = {
  memoryUsagePercent: 64,
  usedMemoryBytes: 687_194_767,
  residentMemoryBytes: 742_000_000,
  memoryCapacityBytes: 1_073_741_824,
  cpuUsagePercent: 18,
  memoryFragmentationRatio: 1.08,
  memoryFragmentationBytes: 55_000_000,
  connectedClientsPercent: 4.1,
  connectedClients: 41,
  maxClients: 1000,
  blockedClients: 0,
  evictedKeysPerMinute: 0,
  rejectedConnectionsPerMinute: 0,
}

/** Six hours of Redis memory, peaking at 78% with one unsampled gap. */
const REDIS_SERIES = [
  41,
  42,
  44,
  45,
  47,
  48,
  null,
  51,
  53,
  55,
  58,
  61,
  63,
  64,
  66,
  68,
  71,
  72,
  74,
  76,
  78,
  74,
  70,
  67,
  64,
]

/** The structured result a read tool would return, or null when the demo has no answer. */
export function demoToolResult(name: string, args: Args, now = Date.now()): Data | null {
  const connectionId =
    typeof args.connectionId === 'string' ? args.connectionId : DEMO_CONNECTION_ID
  const queueName = typeof args.queueName === 'string' ? args.queueName : 'email:receipts'
  const queue = QUEUES.find((q) => q.name === queueName) ?? QUEUES[0]
  const failed = job(now)
  switch (name) {
    case 'list_connections':
      return {
        connections: [
          {
            id: DEMO_CONNECTION_ID,
            name: 'Production',
            environment: 'production',
            prefix: 'bull',
            isDefault: true,
            organizationId: 'acme',
          },
          {
            id: 'demo-staging',
            name: 'Staging',
            environment: 'staging',
            prefix: 'bull',
            isDefault: false,
            organizationId: 'acme',
          },
        ],
        nextCursor: null,
      }
    case 'get_connection_overview':
      return {
        connectionId,
        name: connectionId === 'demo-staging' ? 'Staging' : 'Production',
        environment: connectionId === 'demo-staging' ? 'staging' : 'production',
        prefix: 'bull',
        discovery: {
          totalQueues: QUEUES.length,
          confirmed: QUEUES.length,
          pending: 0,
          lastDiscoveredAt: ago(3, now),
        },
        queues: {
          scanned: QUEUES.length,
          truncated: false,
          totals: { ...counts(157, 12, 7, 3, 1_705_778) },
          paused: ['reports:nightly'],
          withoutWorkers: [],
          topFailed: [{ name: 'email:receipts', failed: 7 }],
          topBacklog: [
            { name: 'email:receipts', waiting: 128 },
            { name: 'image:resize', waiting: 26 },
          ],
        },
        workers: { total: 12 },
        alerts: { open: 2, firing: 2, acknowledged: 0 },
        redisHealth: {
          capturedAt: ago(1, now),
          memoryUsagePercent: redis.memoryUsagePercent,
          cpuUsagePercent: redis.cpuUsagePercent,
          connectedClients: redis.connectedClients,
          blockedClients: redis.blockedClients,
        },
        warnings: [],
      }
    case 'list_queues':
      return {
        connectionId,
        total: QUEUES.length,
        queues: QUEUES.map((q) => ({
          name: q.name,
          status: q.isPaused ? 'paused' : 'active',
          isPaused: q.isPaused,
          discoveryState: 'confirmed',
          jobCounts: q.jobCounts,
        })),
        nextCursor: null,
      }
    case 'get_queue':
      return {
        connectionId,
        name: queue.name,
        status: queue.isPaused ? 'paused' : 'active',
        isPaused: queue.isPaused,
        scheduledJobsCount: schedules(now).filter((s) => s.queueName === queue.name).length,
        jobCounts: queue.jobCounts,
        workers: WORKERS.filter((w) => w.queueName === queue.name).map(
          ({ queueName: _, ...w }) => w
        ),
      }
    case 'get_workers':
      return {
        connectionId,
        totalQueues: QUEUES.length,
        totalWorkersInPage: WORKERS.length,
        workers: WORKERS,
        queues: QUEUES.map((q) => ({
          name: q.name,
          workerCount: WORKERS.filter((w) => w.queueName === q.name).length,
          status: q.isPaused ? 'paused' : 'active',
          jobCounts: { active: q.jobCounts.active, waiting: q.jobCounts.waiting },
        })),
        nextCursor: null,
      }
    case 'get_queue_metrics':
      return {
        connectionId,
        queueName: queue.name,
        range: {
          requestedWindowMinutes: 60,
          returnedPoints: 60,
          oldestPointTimestamp: now - 60 * MINUTE,
          newestPointTimestamp: now,
          latestPointAgeMs: 0,
          requestedWindowCoverage: 1,
        },
        totals: {
          completedInWindow: 1_200,
          failedInWindow: 7,
          finishedInWindow: 1_207,
          successRateInWindow: 0.994,
          failureRateInWindow: 0.006,
          avgCompletedPerMinuteInWindow: 20,
          avgFailedPerMinuteInWindow: 0.12,
          longestFailureStreakMinutesInWindow: 3,
          longestCompletionStreakMinutesInWindow: 41,
          completedLifetime: queue.jobCounts.completed,
          failedLifetime: 212,
          failureRateLifetime: 0.0025,
          estimatedDrainMinutes: 6.4,
        },
        counts: { ...queue.jobCounts, waitingChildren: 0 },
        queue: {
          isPaused: queue.isPaused,
          isMaxed: false,
          waitingToProcess: queue.jobCounts.waiting,
          workersCount: WORKERS.filter((w) => w.queueName === queue.name).length,
          schedulersCount: 1,
        },
        warnings: [],
      }
    case 'list_jobs':
      return {
        connectionId,
        queueName: queue.name,
        total: 3,
        jobs: [
          failed,
          {
            ...failed,
            id: '48207',
            processedOn: now - 26 * MINUTE,
            finishedOn: now - 26 * MINUTE + 1_200,
            timestamp: now - 28 * MINUTE,
          },
          {
            ...failed,
            id: '48198',
            processedOn: now - 34 * MINUTE,
            finishedOn: now - 34 * MINUTE + 1_100,
            timestamp: now - 36 * MINUTE,
          },
        ],
        nextCursor: null,
      }
    case 'find_job':
      return {
        connectionId,
        jobId: String(args.jobId ?? ''),
        matches: args.jobId === failed.id ? [{ queueName: 'email:receipts', job: failed }] : [],
        queuesScanned: QUEUES.length,
        totalQueues: QUEUES.length,
        truncated: false,
      }
    case 'get_job':
      return {
        connectionId,
        queueName: 'email:receipts',
        job: {
          ...failed,
          data: { orderId: 'ord_9281', to: '[redacted]', template: 'receipt' },
          progress: 0,
          opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
          returnvalue: null,
          stacktraceCount: 3,
        },
      }
    case 'get_job_logs':
      return {
        connectionId,
        queueName: 'email:receipts',
        jobId: failed.id,
        logs: [
          'Rendering receipt for order ord_9281',
          `SMTP send rejected: ${FAILED_REASON}`,
          'Attempt 3 of 3 failed, retries exhausted',
        ],
        total: 3,
        nextCursor: null,
      }
    case 'get_job_stacktraces':
      return {
        connectionId,
        queueName: 'email:receipts',
        jobId: failed.id,
        total: 1,
        stacktraces: [
          {
            attemptNumber: 3,
            stacktrace: `Error: ${FAILED_REASON}\n    at SmtpTransport.send (mailer/transport.ts:88)\n    at sendReceipt (workers/receipts.ts:41)`,
            isLatest: true,
          },
        ],
        nextCursor: null,
      }
    case 'explain_job_failure':
      return {
        connectionId,
        queueName: 'email:receipts',
        jobId: failed.id,
        status: 'failed',
        summary:
          'All three attempts failed with the same SMTP rejection. The provider is throttling sends from this account.',
        failedReason: FAILED_REASON,
        attemptTimeline: {
          attemptsMade: 3,
          maxAttempts: 3,
          processedOn: failed.processedOn,
          finishedOn: failed.finishedOn,
          timestamp: failed.timestamp,
        },
        topSignal: { source: 'failed_reason', excerpt: FAILED_REASON },
        relatedAlertEvents: events(now)
          .slice(0, 1)
          .map(({ id, type, status, summary, firedAt, context }) => ({
            id,
            type,
            status,
            summary,
            firedAt,
            context,
          })),
        recentLogLines: [
          `SMTP send rejected: ${FAILED_REASON}`,
          'Attempt 3 of 3 failed, retries exhausted',
        ],
        confidence: 'high',
        sources: ['failed_reason', 'logs', 'stacktrace'],
        skippedSources: [],
      }
    case 'list_scheduled_jobs':
      return {
        connectionId,
        queueName: null,
        scheduledJobs: schedules(now),
        total: null,
        queuesScanned: QUEUES.length,
        totalQueues: QUEUES.length,
        nextCursor: null,
      }
    case 'get_scheduled_job':
      return {
        connectionId,
        scheduledJob:
          schedules(now).find((s) => s.schedulerId === args.schedulerId) ?? schedules(now)[0],
      }
    case 'get_alert_summary':
      return {
        connectionId,
        open: 2,
        firing: 2,
        acknowledged: 0,
        byQueue: [{ queueName: 'email:receipts', open: 2 }],
        byRule: [{ alertRuleId: 'rule-receipts', ruleName: 'Receipt delivery failures', open: 2 }],
        rules: { total: 3, active: 2, snoozed: 1, disabled: 0 },
        truncated: false,
      }
    case 'get_failure_events':
      return { connectionId, total: 3, events: events(now), nextCursor: null }
    case 'get_alert_event': {
      const event = events(now).find((e) => e.id === args.eventId) ?? events(now)[0]
      return {
        connectionId,
        event: {
          ...event,
          notificationSentAt: event.firedAt,
          deliveries: [
            {
              id: 'dlv_1',
              channelType: 'slack',
              status: 'delivered',
              attemptCount: 1,
              lastError: null,
              externalIdentifier: '#ops-alerts',
              externalUrl: null,
              nextRetryAt: null,
              updatedAt: event.firedAt,
            },
          ],
        },
      }
    }
    case 'list_alert_rules':
      return { connectionId, total: 3, rules: rules(now), nextCursor: null }
    case 'get_alert_rule': {
      const match = rules(now).find((r) => r.id === args.ruleId) ?? rules(now)[0]
      return {
        connectionId,
        rule: match,
        recentEvents: events(now).filter((e) => e.alertRuleId === match.id),
      }
    }
    case 'get_redis_health':
      return {
        connectionId,
        collectionEnabled: true,
        retentionDays: 7,
        staleAfterMs: 120_000,
        latest: {
          ...redis,
          capturedAt: ago(1, now),
          memoryCapacitySource: 'maxmemory',
          isStale: false,
        },
        thresholds: [
          {
            ruleId: 'rule-redis',
            name: 'Memory pressure',
            metric: 'memoryUsagePercent',
            threshold: 80,
          },
        ],
        range: {
          from: ago(6 * 60, now),
          to: new Date(now).toISOString(),
          bucketMinutes: 15,
          aggregation: 'max',
          totalBuckets: REDIS_SERIES.length,
          sampledBuckets: REDIS_SERIES.filter((v) => v !== null).length,
          coveragePercent: 96,
        },
        series: REDIS_SERIES.map((memoryUsagePercent, i) => ({
          ...redis,
          memoryUsagePercent,
          capturedAt: ago((REDIS_SERIES.length - 1 - i) * 15, now),
          sampleCount: memoryUsagePercent === null ? 0 : 15,
        })),
      }
    default:
      return null
  }
}
