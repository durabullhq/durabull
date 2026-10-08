import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type AlertRule,
  alertCheckCursorRepository,
  alertDeliveryRepository,
  alertEventRepository,
  alertRuleRepository,
  closeDb,
  getDb,
  organization,
  type RedisConnection,
  redisConnectionRepository,
  redisDiscoveredQueue,
  redisHealthSampleRepository,
} from '@durabull/dal'
import { env } from '@durabull/env'
import type { CursorState, QueueSnapshot } from './alert-evaluator'
import * as alertNotifierModule from './alert-notifier'
import * as redisModule from './redis'
import { buildRedisHealthSnapshot } from './redis-health'
import { __redisHealthCleanupTestUtils } from './redis-health-cleanup'
import { getRedisHealthHistory, recordRedisHealthSnapshot } from './redis-health-history'

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
  DURABULL_ALERT_ENABLED?: boolean
  DURABULL_ENV_CONNECTIONS?: boolean
  DURABULL_REDIS_HEALTH_HISTORY_ENABLED?: boolean
  DURABULL_REDIS_HEALTH_RETENTION_DAYS?: number
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalResendKey = mutableEnv.RESEND_API_KEY
const originalAppBaseUrl = mutableEnv.APP_BASE_URL
const originalAlertEnabled = mutableEnv.DURABULL_ALERT_ENABLED
const originalEnvConnections = mutableEnv.DURABULL_ENV_CONNECTIONS
const originalRedisHealthHistoryEnabled = mutableEnv.DURABULL_REDIS_HEALTH_HISTORY_ENABLED
const originalRedisHealthRetentionDays = mutableEnv.DURABULL_REDIS_HEALTH_RETENTION_DAYS
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
    deletionRequestedAt: null,
    deletionRetryAt: null,
    deletionClaimToken: null,
    deletionClaimedAt: null,
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
    mutableEnv.DURABULL_ALERT_ENABLED = true
    mutableEnv.DURABULL_ENV_CONNECTIONS = false
    mutableEnv.DURABULL_REDIS_HEALTH_HISTORY_ENABLED = true
    mutableEnv.DURABULL_REDIS_HEALTH_RETENTION_DAYS = 30
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
    mutableEnv.DURABULL_ALERT_ENABLED = originalAlertEnabled
    mutableEnv.DURABULL_ENV_CONNECTIONS = originalEnvConnections
    mutableEnv.DURABULL_REDIS_HEALTH_HISTORY_ENABLED = originalRedisHealthHistoryEnabled
    mutableEnv.DURABULL_REDIS_HEALTH_RETENTION_DAYS = originalRedisHealthRetentionDays

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

  it('deduplicates overdue connection work while continuing to poll peers', async () => {
    const { __alertMonitorTestUtils } = await loadMonitorModule()
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const stalledWorker = mock(async () => pending)
    const peerWorker = mock(async () => {})
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
    try {
      await __alertMonitorTestUtils.runConnectionPollOnce('overdue', stalledWorker, 1)
      await __alertMonitorTestUtils.runConnectionPollOnce('overdue', stalledWorker, 1)
      await __alertMonitorTestUtils.runConnectionPollOnce('healthy-peer', peerWorker, 1)
      expect(stalledWorker).toHaveBeenCalledTimes(1)
      expect(peerWorker).toHaveBeenCalledTimes(1)
      finish()
      await pending
      // Drain the worker/finally continuations before starting a later cycle.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      await __alertMonitorTestUtils.runConnectionPollOnce('overdue', peerWorker, 1)
      expect(peerWorker).toHaveBeenCalledTimes(2)
    } finally {
      finish()
      errorSpy.mockRestore()
    }
  })

  it('waits for sibling workers after a concurrent worker fails', async () => {
    const { __alertMonitorTestUtils } = await loadMonitorModule()
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    let cycleSettled = false
    const cycle = __alertMonitorTestUtils
      .processWithConcurrency([1, 2], 2, async (item) => {
        if (item === 1) throw new Error('One worker failed')
        await pending
      })
      .catch((error) => {
        cycleSettled = true
        return error
      })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(cycleSettled).toBe(false)
    finish()
    expect((await cycle).message).toBe('One worker failed')
    expect(cycleSettled).toBe(true)
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

  it('repairs a crash between event creation and delivery enqueue on the next evaluation', async () => {
    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'Failure threshold',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      notificationChannels: [{ type: 'email', target: 'alerts@example.test' }],
      cooldownMinutes: 30,
    })
    const cursor = {
      lastCheckedAt: new Date(Date.now() - 5 * 60_000),
      lastFailedCount: 0,
      lastCompletedCount: 100,
    }
    spyOn(alertDeliveryRepository, 'enqueueMany').mockRejectedValueOnce(new Error('Interrupted'))

    await __alertMonitorTestUtils.evaluateAndMaybeAlert(
      rule,
      createSnapshot(),
      cursor,
      createConnection()
    )
    const [event] = await listRuleEvents(rule.id)
    expect(event).toBeDefined()
    expect(await alertDeliveryRepository.listByEvent(event!.id)).toHaveLength(0)

    await __alertMonitorTestUtils.evaluateAndMaybeAlert(
      rule,
      createSnapshot(),
      cursor,
      createConnection()
    )
    expect(await listRuleEvents(rule.id)).toHaveLength(1)
    expect(await alertDeliveryRepository.listByEvent(event!.id)).toHaveLength(1)
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

  it('records a coalesced suppressed event while the cooldown window is active', async () => {
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
      name: 'Failure threshold',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
      notificationChannels: [{ type: 'email', target: 'ops@example.com' }],
    })

    const anchor = await alertEventRepository.create({
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

    const cursor = {
      lastCheckedAt: new Date(Date.now() - 5 * 60_000),
      lastFailedCount: 0,
      lastCompletedCount: 100,
    }

    await __alertMonitorTestUtils.evaluateAndMaybeAlert(
      rule,
      createSnapshot(),
      cursor,
      createConnection()
    )
    await __alertMonitorTestUtils.evaluateAndMaybeAlert(
      rule,
      createSnapshot(),
      cursor,
      createConnection()
    )

    const events = await listRuleEvents(rule.id)
    expect(events).toHaveLength(2)

    const suppressed = events.find((event) => event.status === 'suppressed')
    expect(suppressed?.dedupeKey).toBe(`suppressed:${anchor.id}`)
    expect((suppressed?.context as Record<string, unknown>).suppressedCount).toBe(2)
    expect(suppressed?.notificationSentAt).toBeNull()
    expect(dispatchAlertNotificationMock).not.toHaveBeenCalled()
  })

  it('does not let suppressed events extend the cooldown window', async () => {
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

    // The last real incident fired 31 minutes ago (outside the 30m cooldown)...
    const anchor = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      type: rule.type,
      status: 'resolved',
      summary: 'Older incident',
      context: {},
      firedAt: new Date(Date.now() - 31 * 60_000),
    })

    // ...and a suppression was recorded moments ago. It must not re-anchor
    // the cooldown, or the rule would stay silent forever.
    await alertEventRepository.upsertSuppressed({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      type: rule.type,
      summary: 'Suppressed during cooldown',
      context: {},
      dedupeKey: `suppressed:${anchor.id}`,
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

    const events = await listRuleEvents(rule.id)
    const firing = events.filter((event) => event.status === 'firing')
    expect(firing).toHaveLength(1)
  })

  it('does not carry cooldown across different Redis health metrics', async () => {
    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: null,
      name: 'Redis CPU pressure',
      type: 'redis_health',
      config: { metric: 'cpu_usage_percent', threshold: 80 },
      cooldownMinutes: 30,
    })
    await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'Redis server',
      type: rule.type,
      status: 'resolved',
      summary: 'Previous memory incident',
      context: { metric: 'memory_usage_percent' },
      firedAt: new Date(Date.now() - 5 * 60_000),
      resolvedAt: new Date(),
    })

    await __alertMonitorTestUtils.processAlertEvaluation(
      rule,
      'Redis server',
      {
        triggered: true,
        available: true,
        summary: 'CPU usage is 95% on Primary Redis (threshold: ≥ 80%)',
        context: { metric: 'cpu_usage_percent', value: 95, threshold: 80 },
      },
      createConnection()
    )

    const events = await listRuleEvents(rule.id)
    expect(events.filter((event) => event.status === 'firing')).toHaveLength(1)
    expect(events.filter((event) => event.status === 'suppressed')).toHaveLength(0)
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

  it('replays a pending queue observation using capture time after prolonged downtime', async () => {
    const baselineAt = new Date(Date.now() - 11 * 60_000)
    const pendingAt = new Date(Date.now() - 10 * 60_000)
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'Email queue failures',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })
    await alertCheckCursorRepository.upsert({
      connectionId: testConnectionId,
      queueName: 'email-send',
      lastCheckedAt: pendingAt,
      observationToken: 'pending-queue-observation',
      lastFailedCount: 8,
      lastCompletedCount: 100,
      lastMetricsSnapshot: {
        kind: 'queue',
        queueName: 'email-send',
        connectionName: 'Primary Redis',
        capturedAt: pendingAt.toISOString(),
        jobCounts: { failed: 8, waiting: 0, active: 0, completed: 100 },
        failedMetrics: { count: 8, dataPoints: [8] },
        completedMetrics: { count: 100, dataPoints: [100] },
        evaluationApplied: false,
        evaluationBaseline: {
          lastCheckedAt: baselineAt.toISOString(),
          lastFailedCount: 0,
          lastCompletedCount: 100,
        },
        applicableRuleRevisions: [{ id: rule.id, updatedAt: rule.updatedAt.toISOString() }],
      },
    })
    mock.module('./redis', () => ({
      getQueue: mock(async () => ({
        getJobCounts: mock(async () => ({ failed: 8, waiting: 0, active: 0, completed: 100 })),
        getMetrics: mock(async (metric: string) => ({
          meta: { count: metric === 'failed' ? 8 : 100 },
          data: metric === 'failed' ? [8] : [100],
        })),
      })),
    }))

    const { __alertMonitorTestUtils } = await loadMonitorModule()
    await __alertMonitorTestUtils.processConnection(testConnectionId, [rule])

    const events = await listRuleEvents(rule.id)
    expect(events).toHaveLength(1)
    expect(events[0]?.summary).toContain('8 jobs failed')
    expect(events[0]?.status).toBe('resolved')
    const [cursor] = await alertCheckCursorRepository.findByConnection(testConnectionId)
    expect(cursor?.lastMetricsSnapshot).toMatchObject({ evaluationApplied: true })
  })

  it('does not replay a pre-existing queue observation into a newly created rule', async () => {
    const baselineAt = new Date(Date.now() - 2 * 60_000)
    const pendingAt = new Date(Date.now() - 60_000)
    await alertCheckCursorRepository.upsert({
      connectionId: testConnectionId,
      queueName: 'email-send',
      lastCheckedAt: pendingAt,
      observationToken: 'observation-before-rule',
      lastFailedCount: 8,
      lastCompletedCount: 100,
      lastMetricsSnapshot: {
        kind: 'queue',
        queueName: 'email-send',
        connectionName: 'Primary Redis',
        capturedAt: pendingAt.toISOString(),
        jobCounts: { failed: 8, waiting: 0, active: 0, completed: 100 },
        failedMetrics: { count: 8, dataPoints: [8] },
        completedMetrics: { count: 100, dataPoints: [100] },
        evaluationApplied: false,
        evaluationBaseline: {
          lastCheckedAt: baselineAt.toISOString(),
          lastFailedCount: 0,
          lastCompletedCount: 100,
        },
        applicableRuleRevisions: [],
      },
    })
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'New rule',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })
    mock.module('./redis', () => ({
      getQueue: mock(async () => ({
        getJobCounts: mock(async () => ({ failed: 0, waiting: 0, active: 0, completed: 100 })),
        getMetrics: mock(async (metric: string) => ({
          meta: { count: metric === 'failed' ? 0 : 100 },
          data: metric === 'failed' ? [0] : [100],
        })),
      })),
    }))

    const { __alertMonitorTestUtils } = await loadMonitorModule()
    await __alertMonitorTestUtils.processConnection(testConnectionId, [rule])

    expect(await listRuleEvents(rule.id)).toEqual([])
  })

  it('evaluates Redis health rules once per connection without requiring a discovered queue', async () => {
    const disconnectMock = mock(() => {})
    const infoMock = mock(async () =>
      [
        '# Memory',
        'used_memory:94371840',
        'maxmemory:104857600',
        'total_system_memory:1073741824',
        '# CPU',
        'used_cpu_sys:4',
        'used_cpu_user:6',
        '# Clients',
        'connected_clients:10',
        'maxclients:1000',
        'blocked_clients:0',
        '# Stats',
        'evicted_keys:0',
        'rejected_connections:0',
      ].join('\r\n')
    )
    const getQueueMock = mock(async () => {
      throw new Error('queue polling should not run for a Redis health rule')
    })
    const getRedisMock = mock(
      async (
        _connectionId: string,
        _connectionUrl: string,
        _connectionName?: string,
        _options?: unknown,
        _lifecycle?: unknown
      ) => ({ info: infoMock, disconnect: disconnectMock })
    )
    mock.module('./redis', () => ({
      ...realRedisModule,
      getRedis: getRedisMock,
      getQueue: getQueueMock,
    }))

    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: null,
      queueFilterMode: null,
      filterQueueNames: [],
      name: 'Redis memory pressure',
      type: 'redis_health',
      config: { metric: 'memory_usage_percent', threshold: 80 },
      cooldownMinutes: 30,
    })

    await __alertMonitorTestUtils.processConnection(testConnectionId, [rule])

    expect(infoMock).toHaveBeenCalledTimes(1)
    expect(getRedisMock.mock.calls[0]?.[4]).toEqual({ cache: false })
    expect(disconnectMock).toHaveBeenCalledTimes(1)
    expect(getQueueMock).not.toHaveBeenCalled()

    const cursors = await alertCheckCursorRepository.findByConnection(testConnectionId)
    expect(cursors).toHaveLength(1)
    expect(cursors[0]?.queueName).toBe('__durabull_internal__:redis_health')
    expect(cursors[0]?.lastMetricsSnapshot).toMatchObject({ kind: 'redis_health' })

    const events = await listRuleEvents(rule.id)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      queueName: 'Redis server',
      type: 'redis_health',
      status: 'firing',
    })
  })

  it.each([
    false,
    true,
  ])('replays a pending Redis observation even when history writes fail: %s', async (historyWriteFails) => {
    const baselineAt = new Date(Date.now() - 2 * 60_000)
    const pendingAt = new Date(Date.now() - 60_000)
    const baseline = buildRedisHealthSnapshot(
      ['used_memory:10', 'maxmemory:100', 'evicted_keys:0'].join('\r\n'),
      'Primary Redis',
      baselineAt
    )
    const pending = buildRedisHealthSnapshot(
      ['used_memory:10', 'maxmemory:100', 'evicted_keys:10'].join('\r\n'),
      'Primary Redis',
      pendingAt,
      baseline
    )
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: null,
      name: 'Redis eviction spike',
      type: 'redis_health',
      config: { metric: 'evicted_keys_per_minute', threshold: 5 },
      cooldownMinutes: 30,
    })
    await alertCheckCursorRepository.upsert({
      connectionId: testConnectionId,
      queueName: '__durabull_internal__:redis_health',
      lastCheckedAt: pendingAt,
      observationToken: 'pending-observation',
      lastFailedCount: 0,
      lastCompletedCount: 0,
      lastMetricsSnapshot: {
        ...pending,
        evaluationApplied: false,
        evaluationBaseline: baseline,
        applicableRuleRevisions: [{ id: rule.id, updatedAt: rule.updatedAt.toISOString() }],
      },
    })
    mock.module('./redis', () => ({
      ...realRedisModule,
      getRedis: mock(async () => ({
        info: mock(async () => ['used_memory:10', 'maxmemory:100', 'evicted_keys:10'].join('\r\n')),
        disconnect: mock(() => {}),
      })),
    }))

    if (historyWriteFails) {
      spyOn(redisHealthSampleRepository, 'record').mockRejectedValue(
        new Error('History unavailable')
      )
    }
    const { __alertMonitorTestUtils } = await loadMonitorModule()
    await __alertMonitorTestUtils.processConnection(testConnectionId, [rule], {
      collectRedisHealth: true,
    })

    const events = await listRuleEvents(rule.id)
    expect(events).toHaveLength(1)
    expect(events[0]?.summary).toContain('Key evictions')
    expect(events[0]?.status).toBe('resolved')
    const [cursor] = await alertCheckCursorRepository.findByConnection(testConnectionId)
    expect(cursor?.lastMetricsSnapshot).toMatchObject({ evaluationApplied: true })
  })

  it('records Redis health history without requiring a Redis health alert rule', async () => {
    const infoMock = mock(async () =>
      [
        'used_memory:52428800',
        'used_memory_rss:62914560',
        'maxmemory:104857600',
        'used_cpu_sys:4',
        'used_cpu_user:6',
        'connected_clients:10',
        'maxclients:1000',
        'blocked_clients:0',
        'evicted_keys:0',
        'rejected_connections:0',
      ].join('\r\n')
    )
    mock.module('./redis', () => ({
      ...realRedisModule,
      getRedis: mock(async () => ({ info: infoMock })),
    }))

    const { __alertMonitorTestUtils } = await loadMonitorModule()
    await __alertMonitorTestUtils.processConnection(testConnectionId, [], {
      collectRedisHealth: true,
    })

    const history = await getRedisHealthHistory(testConnectionId, {
      from: new Date(Date.now() - 5 * 60_000),
      to: new Date(),
      targetPoints: 10,
    })
    expect(infoMock).toHaveBeenCalledTimes(1)
    expect(history.latest).toMatchObject({
      memoryUsagePercent: 50,
      usedMemoryBytes: 52_428_800,
      residentMemoryBytes: 62_914_560,
    })
    expect(await alertRuleRepository.findAllActive()).toHaveLength(0)
  })

  it('runs Redis history collection when alert evaluation is disabled', async () => {
    mutableEnv.DURABULL_ALERT_ENABLED = false
    const infoMock = mock(async () =>
      ['used_memory:41943040', 'maxmemory:104857600', 'used_cpu_sys:4', 'used_cpu_user:6'].join(
        '\r\n'
      )
    )
    mock.module('./redis', () => ({
      ...realRedisModule,
      getRedis: mock(async () => ({ info: infoMock })),
    }))

    const { __alertMonitorTestUtils } = await loadMonitorModule()
    await __alertMonitorTestUtils.runPollCycle()

    const history = await getRedisHealthHistory(testConnectionId, {
      from: new Date(Date.now() - 5 * 60_000),
      to: new Date(),
      targetPoints: 10,
    })
    expect(infoMock).toHaveBeenCalledTimes(1)
    expect(history.latest?.memoryUsagePercent).toBe(40)
  })

  it('skips rules whose connections are excluded from the active background set', async () => {
    const staleConnection = await redisConnectionRepository.create({
      name: 'Removed environment connection',
      url: 'redis://localhost:6380/0',
      environment: 'development',
      isDefault: false,
      organizationId: TEST_ORG_ID,
    })
    await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: staleConnection.id,
      queueName: null,
      name: 'Stale Redis memory pressure',
      type: 'redis_health',
      config: { metric: 'memory_usage_percent', threshold: 80 },
      cooldownMinutes: 30,
    })

    const visitedConnectionIds: string[] = []
    mock.module('./redis', () => ({
      ...realRedisModule,
      getRedis: mock(async (connectionId: string) => {
        visitedConnectionIds.push(connectionId)
        return {
          info: mock(async () => ['used_memory:41943040', 'maxmemory:104857600'].join('\r\n')),
        }
      }),
    }))

    const originalFindAllIdsUnsafe = redisConnectionRepository.findAllIdsUnsafe
    redisConnectionRepository.findAllIdsUnsafe = mock(async () => [testConnectionId])
    mutableEnv.DURABULL_ENV_CONNECTIONS = true
    try {
      const { __alertMonitorTestUtils } = await loadMonitorModule()
      await __alertMonitorTestUtils.runPollCycle()
    } finally {
      redisConnectionRepository.findAllIdsUnsafe = originalFindAllIdsUnsafe
    }

    expect(visitedConnectionIds).toEqual([testConnectionId])
  })

  it('prunes expired Redis health history during cleanup in bounded batches', async () => {
    const oldSnapshot = buildRedisHealthSnapshot(
      ['used_memory:1', 'maxmemory:100', 'used_cpu_sys:1', 'used_cpu_user:1'].join('\r\n'),
      'Primary Redis',
      new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      null
    )
    const recentSnapshot = buildRedisHealthSnapshot(
      ['used_memory:2', 'maxmemory:100', 'used_cpu_sys:2', 'used_cpu_user:2'].join('\r\n'),
      'Primary Redis',
      new Date(),
      oldSnapshot
    )
    await recordRedisHealthSnapshot(testConnectionId, oldSnapshot)
    await recordRedisHealthSnapshot(testConnectionId, recentSnapshot)

    await __redisHealthCleanupTestUtils.runRedisHealthCleanup()

    const history = await getRedisHealthHistory(testConnectionId, {
      from: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000),
      to: new Date(),
      targetPoints: 100,
    })
    expect(history.latest?.usedMemoryBytes).toBe(2)
    expect(history.range.sampledBuckets).toBe(1)
  })

  it('continues pruning expired history when collection is disabled', async () => {
    const oldSnapshot = buildRedisHealthSnapshot(
      ['used_memory:1', 'maxmemory:100', 'used_cpu_sys:1', 'used_cpu_user:1'].join('\r\n'),
      'Primary Redis',
      new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      null
    )
    await recordRedisHealthSnapshot(testConnectionId, oldSnapshot)
    mutableEnv.DURABULL_REDIS_HEALTH_HISTORY_ENABLED = false

    await __redisHealthCleanupTestUtils.runRedisHealthCleanup()

    const history = await getRedisHealthHistory(testConnectionId, {
      from: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000),
      to: new Date(),
      targetPoints: 100,
    })
    expect(history.latest).toBeNull()
  })

  it('keeps a firing Redis incident open when a metric sample is unavailable', async () => {
    mock.module('./redis', () => ({
      ...realRedisModule,
      getRedis: mock(async () => ({
        info: mock(async () => ['used_cpu_sys:4', 'used_cpu_user:6'].join('\r\n')),
      })),
    }))

    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: null,
      name: 'Redis CPU pressure',
      type: 'redis_health',
      config: { metric: 'cpu_usage_percent', threshold: 80 },
      cooldownMinutes: 30,
    })
    const event = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'Redis server',
      type: rule.type,
      status: 'firing',
      summary: 'Redis CPU usage is high',
      context: {},
      firedAt: new Date(),
    })

    await __alertMonitorTestUtils.processConnection(testConnectionId, [rule])

    const events = await listRuleEvents(rule.id)
    expect(events).toHaveLength(1)
    expect(events[0]?.id).toBe(event.id)
    expect(events[0]?.status).toBe('firing')
  })

  it.each([
    'disabled',
    'edited',
    'deleting',
  ])('does not create failed-job incidents after the captured rule is %s during the scan', async (change) => {
    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'Failed jobs',
      type: 'job_failed',
      config: {},
      notificationChannels: [],
    })
    const queue = {
      getJobs: mock(async () => {
        await alertRuleRepository.updateIfCurrent(
          rule.id,
          TEST_ORG_ID,
          change === 'disabled'
            ? { enabled: false }
            : change === 'deleting'
              ? { enabled: false, deletionRequestedAt: new Date() }
              : { queueName: 'other-queue' },
          rule,
          { resolveActive: true }
        )
        return [{ id: 'job-racing-update', failedReason: 'Failed', finishedOn: Date.now() }]
      }),
    }
    await __alertMonitorTestUtils.scanFailedJobsAndMaybeAlert(
      rule,
      queue,
      createConnection(),
      'email-send'
    )
    expect(await listRuleEvents(rule.id)).toHaveLength(0)
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

  it('auto-resolves firing job events whose job has completed', async () => {
    const getJobStateMock = mock(async (jobId: string) =>
      jobId === 'job-1' ? 'completed' : 'failed'
    )
    mock.module('./redis', () => ({
      ...realRedisModule,
      getQueue: mock(async () => ({ getJobState: getJobStateMock })),
    }))

    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'Job failures',
      type: 'job_failed',
      config: {},
      cooldownMinutes: 30,
    })

    const completedJobEvent = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Job job-1 failed in email-send',
      context: { jobId: 'job-1' },
      firedAt: new Date(Date.now() - 10 * 60_000),
    })

    const stillFailedJobEvent = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Job job-2 failed in email-send',
      context: { jobId: 'job-2' },
      firedAt: new Date(Date.now() - 10 * 60_000),
    })

    const resolved = await __alertMonitorTestUtils.autoResolveCompletedJobEvents(testConnectionId, [
      completedJobEvent,
      stillFailedJobEvent,
    ])

    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.id).toBe(completedJobEvent.id)

    const events = await listRuleEvents(rule.id)
    const byId = new Map(events.map((event) => [event.id, event]))
    expect(byId.get(completedJobEvent.id)?.status).toBe('resolved')
    expect(byId.get(completedJobEvent.id)?.resolvedAt).toBeInstanceOf(Date)
    expect(byId.get(stillFailedJobEvent.id)?.status).toBe('firing')
  })

  it('job auto-resolve cycle only touches firing events that carry a job id', async () => {
    mock.module('./redis', () => ({
      ...realRedisModule,
      getQueue: mock(async () => ({ getJobState: mock(async () => 'completed') })),
    }))

    const { __alertMonitorTestUtils } = await loadMonitorModule()
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      name: 'Job failures',
      type: 'job_failed',
      config: {},
      cooldownMinutes: 30,
    })

    const jobEvent = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Job job-1 failed in email-send',
      context: { jobId: 'job-1' },
      firedAt: new Date(Date.now() - 10 * 60_000),
    })

    const aggregateEvent = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: testConnectionId,
      queueName: 'email-send',
      type: 'failure_threshold',
      status: 'firing',
      summary: 'Failure spike',
      context: {},
      firedAt: new Date(Date.now() - 10 * 60_000),
    })

    await __alertMonitorTestUtils.runJobAutoResolveCycle()

    const events = await listRuleEvents(rule.id)
    const byId = new Map(events.map((event) => [event.id, event]))
    expect(byId.get(jobEvent.id)?.status).toBe('resolved')
    expect(byId.get(aggregateEvent.id)?.status).toBe('firing')
  })
})
