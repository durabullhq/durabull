import { describe, expect, it } from 'bun:test'
import {
  findJobOutputSchema,
  getAlertEventOutputSchema,
  getAlertSummaryOutputSchema,
  getConnectionOverviewOutputSchema,
  getRedisHealthOutputSchema,
  getScheduledJobOutputSchema,
  listAlertRulesOutputSchema,
  listScheduledJobsOutputSchema,
} from '@durabull/mcp'

import { createGetAlertEventHandler, createGetAlertSummaryHandler } from './alert-event-handlers'
import { createListAlertRulesHandler } from './alert-rule-handlers'
import { createFindJobHandler } from './find-job-handler'
import { createGetConnectionOverviewHandler } from './get-connection-overview-handler'
import { createGetRedisHealthHandler } from './get-redis-health-handler'
import {
  createGetScheduledJobHandler,
  createListScheduledJobsHandler,
} from './scheduled-jobs-handlers'

const principal = {
  type: 'service_account' as const,
  principalId: 'principal-1',
  organizationId: 'org-1',
}

const connection = {
  id: 'conn-1',
  organizationId: 'org-1',
  name: 'Primary',
  environment: 'production',
  url: 'redis://localhost:6379',
  prefix: 'bull',
  allowSelfSignedCerts: false,
}

const requireConnectionForPrincipal = async () => connection

function bullJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    name: 'send-email',
    attemptsMade: 1,
    opts: { attempts: 3, priority: 0 },
    failedReason: null,
    processedOn: 10,
    finishedOn: 20,
    timestamp: 1,
    delay: 0,
    async getState() {
      return 'completed'
    },
    ...overrides,
  }
}

describe('find_job', () => {
  it('reports every queue containing the job id and whether the scan was truncated', async () => {
    const findJob = createFindJobHandler({
      requireConnectionForPrincipal,
      countQueues: async () => 150,
      listQueues: async () =>
        [{ name: 'email' }, { name: 'billing' }, { name: 'reports' }] as never,
      getQueueForConnection: async (_connection, queueName) =>
        ({
          async getJob(id: string) {
            return queueName !== 'billing' && id === 'job-1' ? bullJob() : null
          },
        }) as never,
    })

    const result = await findJob({ principal, connectionId: 'conn-1', jobId: 'job-1' })
    expect(result.matches.map((match) => match.queueName)).toEqual(['email', 'reports'])
    expect(result.matches[0]?.job.status).toBe('completed')
    expect(result.queuesScanned).toBe(3)
    expect(result.totalQueues).toBe(150)
    expect(result.truncated).toBe(true)
    expect(findJobOutputSchema.safeParse(result).success).toBe(true)
  })
})

describe('scheduled jobs', () => {
  const scheduler = {
    key: 'nightly-report',
    name: 'report',
    pattern: '0 2 * * *',
    tz: 'UTC',
    next: 1_800_000_000_000,
    iterationCount: 12,
    template: { data: { kind: 'nightly' }, opts: { attempts: 2 } },
  }

  const queue = {
    async getJobSchedulers() {
      return [scheduler]
    },
    async getJobs() {
      return [bullJob({ name: 'report', finishedOn: 1_700_000_000_000 })]
    },
  } as never

  it('lists schedulers for one queue with failure stats', async () => {
    const list = createListScheduledJobsHandler({
      requireConnectionForPrincipal,
      getQueueForConnection: async () => queue,
      findQueue: async () => ({ name: 'reports' }) as never,
      countQueues: async () => 1,
      listQueues: async () => [] as never,
    })

    const result = await list({
      principal,
      connectionId: 'conn-1',
      queueName: 'reports',
      pageSize: 25,
    })
    expect(result.total).toBe(1)
    expect(result.scheduledJobs[0]).toMatchObject({
      schedulerId: 'nightly-report',
      queueName: 'reports',
      jobName: 'report',
      pattern: '0 2 * * *',
      everyMs: null,
      timezone: 'UTC',
      nextRunAt: new Date(1_800_000_000_000).toISOString(),
      iterationCount: 12,
      recentFailedCount: 1,
      lastFailedAt: new Date(1_700_000_000_000).toISOString(),
    })
    expect(listScheduledJobsOutputSchema.safeParse(result).success).toBe(true)
  })

  it('pages across queues when no queue is given', async () => {
    const list = createListScheduledJobsHandler({
      requireConnectionForPrincipal,
      getQueueForConnection: async () => queue,
      findQueue: async () => null,
      countQueues: async () => 60,
      listQueues: async (_id, options) =>
        Array.from({ length: Math.min(options.limit, 60 - options.offset) }, (_, index) => ({
          name: `queue-${options.offset + index}`,
        })) as never,
    })

    const first = await list({ principal, connectionId: 'conn-1', pageSize: 25 })
    expect(first.queuesScanned).toBe(25)
    expect(first.totalQueues).toBe(60)
    expect(first.total).toBeNull()
    expect(first.nextCursor).toBe('25:0')
    expect(first.scheduledJobs.length).toBe(25)
    expect(first.scheduledJobs[0]?.queueName).toBe('queue-0')

    const last = await list({ principal, connectionId: 'conn-1', pageSize: 25, cursor: '50:0' })
    expect(last.queuesScanned).toBe(10)
    expect(last.nextCursor).toBeNull()
  })

  it('splits a queue with more schedulers than a page across pages', async () => {
    const manySchedulers = Array.from({ length: 7 }, (_, index) => ({
      ...scheduler,
      key: `sched-${index}`,
    }))
    const bigQueue = {
      async getJobSchedulers() {
        return manySchedulers
      },
      async getJobs() {
        return []
      },
    } as never
    const list = createListScheduledJobsHandler({
      requireConnectionForPrincipal,
      getQueueForConnection: async () => bigQueue,
      findQueue: async () => null,
      countQueues: async () => 2,
      listQueues: async (_id, options) => [{ name: `queue-${options.offset}` }] as never,
    })

    const first = await list({ principal, connectionId: 'conn-1', pageSize: 5 })
    expect(first.scheduledJobs.map((job) => job.schedulerId)).toEqual([
      'sched-0',
      'sched-1',
      'sched-2',
      'sched-3',
      'sched-4',
    ])
    expect(first.nextCursor).toBe('0:5')

    const second = await list({ principal, connectionId: 'conn-1', pageSize: 5, cursor: '0:5' })
    expect(second.scheduledJobs.map((job) => `${job.queueName}/${job.schedulerId}`)).toEqual([
      'queue-0/sched-5',
      'queue-0/sched-6',
      'queue-1/sched-0',
      'queue-1/sched-1',
      'queue-1/sched-2',
    ])
    expect(second.nextCursor).toBe('1:3')

    const third = await list({ principal, connectionId: 'conn-1', pageSize: 5, cursor: '1:3' })
    expect(third.scheduledJobs.length).toBe(4)
    expect(third.nextCursor).toBeNull()
  })

  it('loads one scheduler and 404s unknown ids', async () => {
    const get = createGetScheduledJobHandler({
      requireConnectionForPrincipal,
      getQueueForConnection: async () => queue,
      findQueue: async () => ({ name: 'reports' }) as never,
      countQueues: async () => 1,
      listQueues: async () => [] as never,
    })
    const result = await get({
      principal,
      connectionId: 'conn-1',
      queueName: 'reports',
      schedulerId: 'nightly-report',
    })
    expect(result.scheduledJob.data).toEqual({ kind: 'nightly' })
    expect(getScheduledJobOutputSchema.safeParse(result).success).toBe(true)

    await expect(
      get({ principal, connectionId: 'conn-1', queueName: 'reports', schedulerId: 'missing' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('alert read handlers', () => {
  const firing = (id: string, queueName: string, alertRuleId: string, acknowledged = false) => ({
    id,
    alertRuleId,
    organizationId: 'org-1',
    connectionId: 'conn-1',
    queueName,
    type: 'failure_threshold',
    status: 'firing',
    summary: 'Too many failures',
    context: { count: 12, redis_url: 'redis://user:pass@host' },
    firedAt: new Date('2026-09-01T00:00:00.000Z'),
    resolvedAt: null,
    acknowledgedAt: acknowledged ? new Date('2026-09-01T01:00:00.000Z') : null,
    acknowledgedBy: acknowledged ? 'user-1' : null,
    notificationSentAt: new Date('2026-09-01T00:00:05.000Z'),
    linearResolutionReason: null,
  })

  const rules = [
    { id: 'rule-1', name: 'Failures', enabled: true, mutedUntil: null },
    { id: 'rule-2', name: 'Stalls', enabled: true, mutedUntil: new Date(Date.now() + 60_000) },
    { id: 'rule-3', name: 'Old', enabled: false, mutedUntil: null },
  ]

  it('summarizes open alerts by queue and rule', async () => {
    const summary = createGetAlertSummaryHandler({
      requireConnectionForPrincipal,
      findEvent: async () => null,
      findEvents: async () =>
        [
          firing('e1', 'email', 'rule-1'),
          firing('e2', 'email', 'rule-1', true),
          firing('e3', 'billing', 'rule-2'),
        ] as never,
      countEvents: async (_conn, _org, filters) => (filters.acknowledged ? 1 : 2),
      acknowledge: async () => null,
      unacknowledge: async () => null,
      listDeliveries: async () => [],
      findRules: async () => rules as never,
    })

    const result = await summary({ principal, connectionId: 'conn-1' })
    expect(result).toMatchObject({
      open: 3,
      firing: 2,
      acknowledged: 1,
      byQueue: [
        { queueName: 'email', open: 2 },
        { queueName: 'billing', open: 1 },
      ],
      byRule: [
        { alertRuleId: 'rule-1', ruleName: 'Failures', open: 2 },
        { alertRuleId: 'rule-2', ruleName: 'Stalls', open: 1 },
      ],
      rules: { total: 3, active: 1, snoozed: 1, disabled: 1 },
      truncated: false,
    })
    expect(getAlertSummaryOutputSchema.safeParse(result).success).toBe(true)
  })

  it('returns event detail with sanitized deliveries and no targets', async () => {
    const get = createGetAlertEventHandler({
      requireConnectionForPrincipal,
      findEvent: async () => firing('e1', 'email', 'rule-1', true) as never,
      findEvents: async () => [] as never,
      countEvents: async () => 0,
      acknowledge: async () => null,
      unacknowledge: async () => null,
      listDeliveries: async () =>
        [
          {
            id: 'd1',
            alertEventId: 'e1',
            organizationId: 'org-1',
            channelType: 'webhook',
            target: 'https://hooks.example.com/secret-path',
            status: 'failed',
            attemptCount: 3,
            nextRetryAt: new Date('2026-09-01T02:00:00.000Z'),
            claimedAt: null,
            lastError: 'HTTP 500 from https://hooks.example.com/secret-path token=Bearer abc.def',
            providerMetadata: { api_key: 'x' },
            externalId: null,
            externalIdentifier: 'LIN-42',
            externalUrl: 'https://linear.app/x/issue/LIN-42',
            createdAt: new Date('2026-09-01T00:00:01.000Z'),
            updatedAt: new Date('2026-09-01T01:30:00.000Z'),
          },
        ] as never,
      findRules: async () => [] as never,
    })

    const result = await get({ principal, connectionId: 'conn-1', eventId: 'e1' })
    expect(result.event.acknowledgedAt).toBe('2026-09-01T01:00:00.000Z')
    expect(result.event.context).toEqual({ count: 12 })
    expect(result.event.deliveries).toHaveLength(1)
    const delivery = result.event.deliveries[0]!
    expect('target' in delivery).toBe(false)
    expect('providerMetadata' in delivery).toBe(false)
    expect(delivery.lastError).not.toContain('Bearer abc')
    expect(delivery.externalIdentifier).toBe('LIN-42')
    expect(getAlertEventOutputSchema.safeParse(result).success).toBe(true)
  })

  it('lists rules with state and open counts', async () => {
    const list = createListAlertRulesHandler({
      requireConnectionForPrincipal,
      findRules: async () =>
        rules.map((rule) => ({
          ...rule,
          organizationId: 'org-1',
          connectionId: 'conn-1',
          type: 'failure_threshold',
          config: { count: 3 },
          notificationChannels: [],
          cooldownMinutes: 15,
          queueName: null,
          queueFilterMode: null,
          filterQueueNames: null,
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        })) as never,
      findRule: async () => null,
      setMutedUntil: async () => null,
      countEvents: async (_conn, _org, filters) => (filters.alertRuleId === 'rule-1' ? 4 : 0),
      findEvents: async () => [] as never,
    })

    const result = await list({ principal, connectionId: 'conn-1', pageSize: 2 })
    expect(result.total).toBe(3)
    expect(result.rules.map((rule) => [rule.id, rule.state, rule.openEventCount])).toEqual([
      ['rule-1', 'active', 4],
      ['rule-2', 'snoozed', 0],
    ])
    expect(result.nextCursor).toBe('2')
    expect(listAlertRulesOutputSchema.safeParse(result).success).toBe(true)
  })
})

describe('get_redis_health', () => {
  it('combines the live snapshot, thresholds, and bounded history', async () => {
    const now = Date.parse('2026-09-09T12:00:00.000Z')
    const handler = createGetRedisHealthHandler({
      requireConnectionForPrincipal,
      findCursor: async () =>
        ({
          lastMetricsSnapshot: {
            kind: 'redis_health',
            connectionName: 'Primary',
            capturedAt: '2026-09-09T11:59:30.000Z',
            historyPersisted: true,
            memoryCapacitySource: 'maxmemory',
            metrics: {
              memoryUsagePercent: 81.5,
              cpuUsagePercent: 12,
              memoryFragmentationRatio: 1.1,
              memoryFragmentationBytes: 1024,
              connectedClientsPercent: 5,
              blockedClients: 0,
              evictedKeysPerMinute: 0,
              rejectedConnectionsPerMinute: 0,
              usedMemoryBytes: 815_000_000,
              memoryCapacityBytes: 1_000_000_000,
              connectedClients: 50,
              maxClients: 1000,
            },
            raw: { cpuSeconds: 100, evictedKeys: 0, rejectedConnections: 0 },
          },
        }) as never,
      findRules: async () =>
        [
          {
            id: 'rule-h',
            name: 'Memory',
            type: 'redis_health',
            enabled: true,
            mutedUntil: null,
            config: { metric: 'memory_usage_percent', threshold: 80 },
          },
          {
            id: 'rule-muted',
            name: 'Muted',
            type: 'redis_health',
            enabled: true,
            mutedUntil: new Date(now + 60_000),
            config: { metric: 'cpu_usage_percent', threshold: 90 },
          },
        ] as never,
      getHistory: async () =>
        ({
          latest: null,
          range: {
            from: '2026-09-09T11:00:00.000Z',
            to: '2026-09-09T12:00:00.000Z',
            bucketMinutes: 1,
            expectedSampleIntervalMinutes: 1,
            aggregation: 'max' as const,
            totalBuckets: 2,
            sampledBuckets: 1,
            coveragePercent: 50,
          },
          series: [
            {
              capturedAt: '2026-09-09T11:58:00.000Z',
              sampleCount: 1,
              memoryUsagePercent: 80,
              usedMemoryBytes: 800,
              residentMemoryBytes: null,
              memoryCapacityBytes: 1000,
              cpuUsagePercent: 10,
              memoryFragmentationRatio: 1,
              memoryFragmentationBytes: 0,
              connectedClientsPercent: 5,
              connectedClients: 50,
              maxClients: 1000,
              blockedClients: 0,
              evictedKeysPerMinute: 0,
              rejectedConnectionsPerMinute: 0,
            },
            {
              capturedAt: '2026-09-09T11:59:00.000Z',
              sampleCount: 0,
              memoryUsagePercent: null,
              usedMemoryBytes: null,
              residentMemoryBytes: null,
              memoryCapacityBytes: null,
              cpuUsagePercent: null,
              memoryFragmentationRatio: null,
              memoryFragmentationBytes: null,
              connectedClientsPercent: null,
              connectedClients: null,
              maxClients: null,
              blockedClients: null,
              evictedKeysPerMinute: null,
              rejectedConnectionsPerMinute: null,
            },
          ],
        }) as never,
      sampleIntervalMs: () => 60_000,
      historyEnabled: () => true,
      retentionDays: () => 30,
      now: () => now,
    })

    const result = await handler({ principal, connectionId: 'conn-1', windowMinutes: 60 })
    expect(result.latest?.memoryUsagePercent).toBe(81.5)
    expect(result.latest?.isStale).toBe(false)
    expect(result.thresholds).toEqual([
      { ruleId: 'rule-h', name: 'Memory', metric: 'memory_usage_percent', threshold: 80 },
    ])
    expect(result.series).toHaveLength(2)
    expect(result.range.aggregation).toBe('max')
    expect(getRedisHealthOutputSchema.safeParse(result).success).toBe(true)
  })
})

describe('get_connection_overview', () => {
  function queueFor(sample: { waiting: number; failed: number; paused: boolean; workers: number }) {
    return {
      async getJobCounts() {
        return {
          waiting: sample.waiting,
          active: 0,
          delayed: 0,
          completed: 1,
          failed: sample.failed,
          paused: 0,
          prioritized: 0,
        }
      },
      async isPaused() {
        return sample.paused
      },
      async getWorkersCount() {
        return sample.workers
      },
    } as never
  }

  const samples: Record<
    string,
    { waiting: number; failed: number; paused: boolean; workers: number }
  > = {
    email: { waiting: 40, failed: 7, paused: false, workers: 0 },
    billing: { waiting: 0, failed: 1, paused: true, workers: 2 },
    reports: { waiting: 3, failed: 0, paused: false, workers: 1 },
  }

  function deps(grantedScopes: string[]) {
    return {
      handler: createGetConnectionOverviewHandler({
        requireConnectionForPrincipal,
        getQueueForConnection: async (_connection, name) => queueFor(samples[name]!),
        discoverySummary: async () => ({
          total: 3,
          confirmed: 3,
          pending: 0,
          lastDiscoveredAt: new Date('2026-09-09T10:00:00.000Z'),
        }),
        listQueues: async () => Object.keys(samples).map((name) => ({ name })) as never,
        summarizeOpenAlerts: async () => [
          { connectionId: 'conn-1', firing: 2, acknowledged: 1, open: 3 },
        ],
        findCursor: async () =>
          ({
            lastMetricsSnapshot: {
              kind: 'redis_health',
              connectionName: 'Primary',
              capturedAt: '2026-09-09T11:59:30.000Z',
              memoryCapacitySource: 'maxmemory',
              metrics: {
                memoryUsagePercent: 42,
                cpuUsagePercent: 3,
                memoryFragmentationRatio: 1,
                memoryFragmentationBytes: 0,
                connectedClientsPercent: 1,
                blockedClients: 0,
                evictedKeysPerMinute: 0,
                rejectedConnectionsPerMinute: 0,
                usedMemoryBytes: 1,
                memoryCapacityBytes: 2,
                connectedClients: 10,
                maxClients: 1000,
              },
              raw: { cpuSeconds: 1, evictedKeys: 0, rejectedConnections: 0 },
            },
          }) as never,
      }),
      input: { principal, connectionId: 'conn-1', grantedScopes },
    }
  }

  it('aggregates queues, flags risks, and includes optional sections when scopes allow', async () => {
    const { handler, input } = deps(['mcp:jobs:read', 'mcp:failures:read', 'mcp:diagnostics:read'])
    const result = await handler(input)

    expect(result.name).toBe('Primary')
    expect(result.queues.totals.waiting).toBe(43)
    expect(result.queues.totals.failed).toBe(8)
    expect(result.queues.paused).toEqual(['billing'])
    expect(result.queues.withoutWorkers).toEqual(['email'])
    expect(result.queues.topFailed[0]).toEqual({ name: 'email', failed: 7 })
    expect(result.queues.topBacklog.map((entry) => entry.name)).toEqual(['email', 'reports'])
    expect(result.workers.total).toBe(3)
    expect(result.alerts).toEqual({ open: 3, firing: 2, acknowledged: 1 })
    expect(result.redisHealth?.memoryUsagePercent).toBe(42)
    expect(result.queues.truncated).toBe(false)
    expect(getConnectionOverviewOutputSchema.safeParse(result).success).toBe(true)
  })

  it('omits alert and Redis sections without the corresponding scopes', async () => {
    const { handler, input } = deps(['mcp:jobs:read'])
    const result = await handler(input)
    expect(result.alerts).toBeNull()
    expect(result.redisHealth).toBeNull()
    expect(getConnectionOverviewOutputSchema.safeParse(result).success).toBe(true)
  })
})
