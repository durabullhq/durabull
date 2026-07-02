import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  alertDeliveryRepository,
  type AlertRule,
  alertCheckCursorRepository,
  alertEventRepository,
  alertRuleRepository,
  closeDb,
  getDb,
  organization,
  type RedisConnection,
  redisConnectionRepository,
  redisDiscoveredQueue,
} from '@durabull/dal'
import { env } from '@durabull/env'
import type { CursorState, QueueSnapshot } from './alert-evaluator'
import * as alertNotifierModule from './alert-notifier'
import * as redisModule from './redis'

// `mock.module` is process-global and is NOT reverted by `mock.restore()`, so the
// notifier/redis mocks below would leak into other test files (e.g. the alerts
// route tests rely on the real `processAlertDeliveries`). Snapshot the real
// modules now and reinstall them after every test to keep the suite isolated.
const realAlertNotifierModule = { ...alertNotifierModule }
const realRedisModule = { ...redisModule }

const TEST_ORG_ID = 'alert-monitor-org'

const mutableEnv = env as {
  DATABASE_URL?: string
  RESEND_API_KEY?: string
  APP_BASE_URL?: string
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalResendKey = mutableEnv.RESEND_API_KEY
const originalAppBaseUrl = mutableEnv.APP_BASE_URL
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''
let testConnectionId = ''

function createRule(overrides: Partial<AlertRule> = {}): AlertRule {
  const now = new Date()

  return {
    id: '44444444-4444-4444-8444-444444444444',
    organizationId: TEST_ORG_ID,
    connectionId: testConnectionId,
    queueName: null,
    queueFilterMode: null,
    filterQueueNames: [],
    name: 'Queue failures',
    type: 'failure_threshold',
    config: { count: 5, windowMinutes: 5 },
    enabled: true,
    notificationChannels: [],
    cooldownMinutes: 30,
    mutedUntil: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function createConnection(): RedisConnection {
  const now = new Date()

  return {
    id: testConnectionId,
    organizationId: TEST_ORG_ID,
    name: 'Primary Redis',
    url: 'redis://localhost:6379/0',
    environment: 'development',
    isDefault: true,
    prefix: 'bull',
    allowSelfSignedCerts: false,
    createdAt: now,
    updatedAt: now,
  }
}

function createSnapshot(overrides: Partial<QueueSnapshot> = {}): QueueSnapshot {
  return {
    queueName: 'email-send',
    connectionName: 'Primary Redis',
    jobCounts: {
      failed: 12,
      waiting: 0,
      active: 0,
      completed: 100,
    },
    failedMetrics: {
      count: 12,
      dataPoints: [5, 4, 3],
    },
    completedMetrics: {
      count: 100,
      dataPoints: [50, 25, 25],
    },
    ...overrides,
  }
}

async function seedBaseConnection() {
  const db = await getDb()
  const now = new Date()

  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Alert Monitor Org',
    slug: 'alert-monitor-org',
    createdAt: now,
    updatedAt: now,
  })

  const connection = await redisConnectionRepository.create({
    name: 'Primary Redis',
    url: 'redis://localhost:6379/0',
    environment: 'development',
    isDefault: true,
    organizationId: TEST_ORG_ID,
  })

  testConnectionId = connection.id
}

async function seedDiscoveredQueues(queueNames: string[]) {
  const db = await getDb()
  const now = new Date()

  if (queueNames.length === 0) return

  await db.insert(redisDiscoveredQueue).values(
    queueNames.map((name) => ({
      connectionId: testConnectionId,
      name,
      state: 'confirmed' as const,
      lastDiscoveredAt: now,
      createdAt: now,
      updatedAt: now,
    }))
  )
}

async function listRuleEvents(ruleId: string) {
  return alertEventRepository.findByRule(ruleId, { offset: 0, limit: 20 })
}

async function loadMonitorModule() {
  return import('./alert-monitor')
}

describe('alert monitor', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-alert-monitor-'))
    testConnectionId = ''
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.RESEND_API_KEY = undefined
    mutableEnv.APP_BASE_URL = 'https://app.durabull.io'
    await closeDb()
    await seedBaseConnection()
  })

  afterEach(async () => {
    mock.restore()
    mock.module('./alert-notifier', () => realAlertNotifierModule)
    mock.module('./redis', () => realRedisModule)
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.RESEND_API_KEY = originalResendKey
    mutableEnv.APP_BASE_URL = originalAppBaseUrl

    if (originalPgliteDir) {
      process.env.DURABULL_PGLITE_DIR = originalPgliteDir
    } else {
      delete process.env.DURABULL_PGLITE_DIR
    }

    if (tempPgliteDir) {
      await rm(tempPgliteDir, { recursive: true, force: true })
      tempPgliteDir = ''
    }
  })

  it('collects unique queue names from explicit, include, and discovered rules', async () => {
    const { __alertMonitorTestUtils } = await loadMonitorModule()

    const queueNames = __alertMonitorTestUtils
      .getUniqueQueueNames(
        [
          createRule({ queueName: 'payments' }),
          createRule({
            id: 'rule-include',
            queueName: null,
            queueFilterMode: 'include',
            filterQueueNames: ['email-send', 'sms-send'],
          }),
          createRule({
            id: 'rule-exclude',
            queueName: null,
            queueFilterMode: 'exclude',
            filterQueueNames: ['debug-queue'],
          }),
        ],
        ['email-send', 'sms-send', 'debug-queue', 'bulk-import']
      )
      .sort()

    expect(queueNames).toEqual(['bulk-import', 'debug-queue', 'email-send', 'payments', 'sms-send'])
  })

  it('evaluates queue applicability for include, exclude, and direct rules', async () => {
    const { __alertMonitorTestUtils } = await loadMonitorModule()

    expect(
      __alertMonitorTestUtils.isRuleApplicableToQueue(
        createRule({
          queueName: null,
          queueFilterMode: 'include',
          filterQueueNames: ['email-send'],
        }),
        'email-send'
      )
    ).toBe(true)

    expect(
      __alertMonitorTestUtils.isRuleApplicableToQueue(
        createRule({
          queueName: null,
          queueFilterMode: 'include',
          filterQueueNames: ['email-send'],
        }),
        'sms-send'
      )
    ).toBe(false)

    expect(
      __alertMonitorTestUtils.isRuleApplicableToQueue(
        createRule({
          queueName: null,
          queueFilterMode: 'exclude',
          filterQueueNames: ['debug-queue'],
        }),
        'email-send'
      )
    ).toBe(true)

    expect(
      __alertMonitorTestUtils.isRuleApplicableToQueue(
        createRule({
          queueName: null,
          queueFilterMode: 'exclude',
          filterQueueNames: ['debug-queue'],
        }),
        'debug-queue'
      )
    ).toBe(false)

    expect(
      __alertMonitorTestUtils.isRuleApplicableToQueue(
        createRule({ queueName: 'payments' }),
        'payments'
      )
    ).toBe(true)
  })

  it('resolves an active firing event when the rule no longer triggers', async () => {
    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'Failure threshold',
      type: 'failure_threshold',
      config: { count: 50, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    const event = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Still firing',
      context: {},
      firedAt: new Date(Date.now() - 10 * 60_000),
    })

    const cursor: CursorState = {
      lastCheckedAt: new Date(Date.now() - 5 * 60_000),
      lastFailedCount: 10,
      lastCompletedCount: 100,
    }

    await __alertMonitorTestUtils.evaluateAndMaybeAlert(
      rule,
      createSnapshot({
        jobCounts: { failed: 12, waiting: 0, active: 0, completed: 100 },
      }),
      cursor,
      createConnection()
    )

    const events = await listRuleEvents(rule.id)
    expect(events).toHaveLength(1)
    expect(events[0]?.id).toBe(event.id)
    expect(events[0]?.status).toBe('resolved')
    expect(events[0]?.resolvedAt).toBeInstanceOf(Date)
  })

  it('does not create a duplicate event when one is already firing', async () => {
    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'Failure threshold',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Already firing',
      context: {},
      firedAt: new Date(Date.now() - 5 * 60_000),
    })

    await __alertMonitorTestUtils.evaluateAndMaybeAlert(
      rule,
      createSnapshot(),
      {
        lastCheckedAt: new Date(Date.now() - 5 * 60_000),
        lastFailedCount: 0,
        lastCompletedCount: 100,
      },
      createConnection()
    )

    expect(await listRuleEvents(rule.id)).toHaveLength(1)
  })

  it('retries due deliveries when an aggregate rule is still firing', async () => {
    const processAlertDeliveriesMock = mock(
      async (_event: { id: string }, _connection: RedisConnection, _ruleName: string) => {}
    )
    mock.module('./alert-notifier', () => ({
      dispatchAlertNotification: mock(async () => {}),
      processAlertDeliveries: processAlertDeliveriesMock,
    }))

    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'Failure threshold',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    const activeEvent = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Already firing',
      context: {},
      firedAt: new Date(Date.now() - 5 * 60_000),
    })

    await __alertMonitorTestUtils.evaluateAndMaybeAlert(
      rule,
      createSnapshot(),
      {
        lastCheckedAt: new Date(Date.now() - 5 * 60_000),
        lastFailedCount: 0,
        lastCompletedCount: 100,
      },
      createConnection()
    )

    expect(processAlertDeliveriesMock).toHaveBeenCalledTimes(1)
    expect(processAlertDeliveriesMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: activeEvent.id }),
      expect.anything(),
      expect.anything()
    )
    expect(await listRuleEvents(rule.id)).toHaveLength(1)
  })

  it('claims due deliveries and hands them to the notifier with event context', async () => {
    const processAlertDeliveriesMock = mock(async () => {})
    mock.module('./alert-notifier', () => ({
      ...realAlertNotifierModule,
      processAlertDeliveries: processAlertDeliveriesMock,
    }))
    const { __alertMonitorTestUtils } = await loadMonitorModule()

    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'Webhook retry',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      notificationChannels: [],
      cooldownMinutes: 30,
    })
    const event = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Retry pending delivery',
      context: {},
      firedAt: new Date(),
    })
    await alertDeliveryRepository.enqueueMany([
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'webhook',
        target: 'destination:webhook-destination-id',
        providerMetadata: {
          type: 'webhook',
          destinationId: 'webhook-destination-id',
          url: 'https://example.com/durabull',
        },
      },
    ])

    await __alertMonitorTestUtils.processDueAlertDeliveries()

    expect(processAlertDeliveriesMock).toHaveBeenCalledTimes(1)
    expect(processAlertDeliveriesMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: event.id }),
      expect.objectContaining({ id: testConnectionId }),
      'Webhook retry',
      {
        claimedDeliveries: [
          expect.objectContaining({
            alertEventId: event.id,
            channelType: 'webhook',
            status: 'claimed',
          }),
        ],
      }
    )
  })

  it('suppresses new events while the cooldown window is still active', async () => {
    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'Failure threshold',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      type: rule.type,
      status: 'resolved',
      summary: 'Recent incident',
      context: {},
      firedAt: new Date(Date.now() - 5 * 60_000),
    })

    await __alertMonitorTestUtils.evaluateAndMaybeAlert(
      rule,
      createSnapshot(),
      {
        lastCheckedAt: new Date(Date.now() - 5 * 60_000),
        lastFailedCount: 0,
        lastCompletedCount: 100,
      },
      createConnection()
    )

    expect(await listRuleEvents(rule.id)).toHaveLength(1)
  })

  it('marks notifications as sent when dispatch succeeds', async () => {
    const dispatchAlertNotificationMock = mock(async () => {})
    mock.module('./alert-notifier', () => ({
      dispatchAlertNotification: dispatchAlertNotificationMock,
    }))

    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'Failure threshold',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
      notificationChannels: [{ type: 'email', target: 'ops@example.com' }],
    })

    await __alertMonitorTestUtils.evaluateAndMaybeAlert(
      rule,
      createSnapshot(),
      {
        lastCheckedAt: new Date(Date.now() - 5 * 60_000),
        lastFailedCount: 0,
        lastCompletedCount: 100,
      },
      createConnection()
    )

    expect(dispatchAlertNotificationMock).toHaveBeenCalledTimes(1)
    const events = await listRuleEvents(rule.id)
    expect(events).toHaveLength(1)
    expect(events[0]?.notificationSentAt).toBeInstanceOf(Date)
  })

  it('keeps the event unsent when notification dispatch throws', async () => {
    const dispatchAlertNotificationMock = mock(async () => {
      throw new Error('email provider unavailable')
    })
    mock.module('./alert-notifier', () => ({
      dispatchAlertNotification: dispatchAlertNotificationMock,
    }))

    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'Failure threshold',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
      notificationChannels: [{ type: 'email', target: 'ops@example.com' }],
    })

    await __alertMonitorTestUtils.evaluateAndMaybeAlert(
      rule,
      createSnapshot(),
      {
        lastCheckedAt: new Date(Date.now() - 5 * 60_000),
        lastFailedCount: 0,
        lastCompletedCount: 100,
      },
      createConnection()
    )

    expect(dispatchAlertNotificationMock).toHaveBeenCalledTimes(1)
    const events = await listRuleEvents(rule.id)
    expect(events).toHaveLength(1)
    expect(events[0]?.status).toBe('firing')
    expect(events[0]?.notificationSentAt).toBeNull()
  })

  it('processes only the unique applicable queues and upserts cursors', async () => {
    const getQueueMock = mock(async (_connectionId: string, _url: string, queueName: string) => ({
      getJobCounts: mock(async () => ({
        failed: queueName === 'email-send' ? 8 : 0,
        waiting: 0,
        active: 0,
        completed: queueName === 'email-send' ? 100 : 25,
      })),
      getMetrics: mock(async (metric: string) => ({
        meta: { count: metric === 'failed' ? (queueName === 'email-send' ? 8 : 0) : 100 },
        data: metric === 'failed' ? [8] : [100],
      })),
    }))
    mock.module('./redis', () => ({
      getQueue: getQueueMock,
    }))

    const { __alertMonitorTestUtils } = await loadMonitorModule()
    await seedDiscoveredQueues(['email-send', 'debug-queue'])

    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: null,
      queueFilterMode: 'include',
      filterQueueNames: ['email-send'],
      name: 'Email queue failures',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    await __alertMonitorTestUtils.processConnection(testConnectionId, [rule])

    expect(getQueueMock).toHaveBeenCalledTimes(1)
    expect(getQueueMock.mock.calls[0]?.[2]).toBe('email-send')

    const cursors = await alertCheckCursorRepository.findByConnection(testConnectionId)
    expect(cursors).toHaveLength(1)
    expect(cursors[0]?.queueName).toBe('email-send')
    expect(cursors[0]?.lastFailedCount).toBe(8)

    const events = await listRuleEvents(rule.id)
    expect(events).toHaveLength(1)
    expect(events[0]?.queueName).toBe('email-send')
  })

  it('creates at most one job_failed event per failed job id', async () => {
    const dispatchAlertNotificationMock = mock(async () => {})
    mock.module('./alert-notifier', () => ({
      dispatchAlertNotification: dispatchAlertNotificationMock,
      processAlertDeliveries: mock(async () => {}),
    }))

    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'Failed job issues',
      type: 'job_failed',
      config: { maxIssuesPerPoll: 100 },
      cooldownMinutes: 30,
      notificationChannels: [{ type: 'linear', target: 'org-default', teamId: 'team-1' }],
    })

    const failedJob = {
      id: 'job-1',
      name: 'send-email',
      failedReason: 'SMTP rejected recipient',
      attemptsMade: 2,
      finishedOn: Date.now(),
      opts: { attempts: 3 },
    }
    const queue = {
      getJobs: mock(async () => [failedJob]),
    }
    const connection = createConnection()

    await __alertMonitorTestUtils.scanFailedJobsAndMaybeAlert(rule, queue, connection, 'email-send')
    await __alertMonitorTestUtils.scanFailedJobsAndMaybeAlert(rule, queue, connection, 'email-send')

    const events = await listRuleEvents(rule.id)
    expect(events).toHaveLength(1)
    expect(events[0]?.dedupeKey).toBe(`job:${testConnectionId}:email-send:job-1`)
    expect(events[0]?.context).toMatchObject({
      jobId: 'job-1',
      jobName: 'send-email',
      failedReason: 'SMTP rejected recipient',
      attemptsMade: 2,
      attempts: 3,
    })
    expect(dispatchAlertNotificationMock).toHaveBeenCalledTimes(1)
  })
})
