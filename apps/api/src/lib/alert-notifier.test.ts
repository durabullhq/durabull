import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type AlertEvent,
  alertDestinationRepository,
  alertWebhookDestination,
  alertWebhookDestinationRepository,
  closeDb,
  eq,
  getDb,
  organization,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { buildAlertAppUrls } from './alert-app-urls'
import { __alertNotifierTestUtils } from './alert-notifier'

const TEST_ORG_ID = 'alert-notifier-org'
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_SECRET_ENCRYPTION_KEY?: string
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalSecretKey = mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

async function seedOrganization() {
  const db = await getDb()
  const now = new Date()
  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Alert Notifier Org',
    slug: 'alert-notifier-org',
    createdAt: now,
    updatedAt: now,
  })
}

describe('buildAlertAppUrls', () => {
  it('builds app routes that match the current web router', () => {
    const urls = buildAlertAppUrls({
      appBaseUrl: 'https://app.durabull.io/',
      organizationSlug: 'acme-inc',
      connectionId: 'conn_123',
      queueName: 'email-send',
      alertRuleId: 'rule_456',
    })

    expect(urls.dashboardUrl).toBe('https://app.durabull.io/acme-inc/c/conn_123/queues/email-send')
    expect(urls.jobUrl).toBe('https://app.durabull.io/acme-inc/c/conn_123/queues/email-send')
    expect(urls.muteUrl).toBe('https://app.durabull.io/acme-inc/c/conn_123/alerts?ruleId=rule_456')
  })

  it('builds job-specific urls when a job id is supplied', () => {
    const urls = buildAlertAppUrls({
      appBaseUrl: 'https://app.durabull.io/',
      organizationSlug: 'acme-inc',
      connectionId: 'conn_123',
      queueName: 'email-send',
      alertRuleId: 'rule_456',
      jobId: 'job_789',
    })

    expect(urls.dashboardUrl).toBe('https://app.durabull.io/acme-inc/c/conn_123/queues/email-send')
    expect(urls.jobUrl).toBe(
      'https://app.durabull.io/acme-inc/c/conn_123/queues/email-send/jobs/job_789'
    )
    expect(urls.jobUrl).not.toBe(urls.dashboardUrl)
  })

  it('falls back to the app root if the organization slug is unavailable', () => {
    const urls = buildAlertAppUrls({
      appBaseUrl: 'https://app.durabull.io',
      organizationSlug: null,
      connectionId: 'conn_123',
      queueName: 'email-send',
      alertRuleId: 'rule_456',
    })

    expect(urls).toEqual({
      dashboardUrl: 'https://app.durabull.io',
      jobUrl: 'https://app.durabull.io',
      muteUrl: 'https://app.durabull.io',
    })
  })

  it('encodes route segments and trims trailing slashes from the base url', () => {
    const urls = buildAlertAppUrls({
      appBaseUrl: 'https://app.durabull.io///',
      organizationSlug: 'acme ops',
      connectionId: 'conn/123',
      queueName: 'email/send jobs',
      alertRuleId: 'rule:456',
    })

    expect(urls.dashboardUrl).toBe(
      'https://app.durabull.io/acme%20ops/c/conn%2F123/queues/email%2Fsend%20jobs'
    )
    expect(urls.jobUrl).toBe(
      'https://app.durabull.io/acme%20ops/c/conn%2F123/queues/email%2Fsend%20jobs'
    )
    expect(urls.muteUrl).toBe(
      'https://app.durabull.io/acme%20ops/c/conn%2F123/alerts?ruleId=rule%3A456'
    )
  })
})

function makeAlertEvent(overrides: Partial<AlertEvent> = {}): AlertEvent {
  const now = new Date('2026-07-01T12:00:00.000Z')
  return {
    id: 'f2f9a2f4-0000-4000-8000-000000000001',
    createdAt: now,
    updatedAt: now,
    alertRuleId: 'f2f9a2f4-0000-4000-8000-000000000002',
    organizationId: TEST_ORG_ID,
    connectionId: 'f2f9a2f4-0000-4000-8000-000000000003',
    queueName: 'conversation-background',
    type: 'job_failed',
    status: 'firing',
    summary: 'Job refresh-summary failed after 3 attempts',
    context: null,
    dedupeKey: null,
    firedAt: now,
    resolvedAt: null,
    notificationSentAt: null,
    ...overrides,
  } as AlertEvent
}

describe('linear issue formatting', () => {
  const connection = { id: 'conn_1', name: 'Marketplace (Production)' }

  it('builds a plain-text title without the connection name or markdown escapes', () => {
    const title = __alertNotifierTestUtils.buildLinearIssueTitle(
      makeAlertEvent(),
      'Job failures',
      'refresh-summary'
    )

    expect(title).toBe('[Durabull] conversation-background job failed: refresh-summary')
    expect(title).not.toContain('\\')
  })

  it('does not escape markdown characters in non-job-failed titles', () => {
    const title = __alertNotifierTestUtils.buildLinearIssueTitle(
      makeAlertEvent({ type: 'queue_depth' }),
      'Queue depth > 1.000 (critical)',
      null
    )

    expect(title).toBe(
      '[Durabull] Queue depth > 1.000 (critical) fired for conversation-background'
    )
    expect(title).not.toContain('\\')
  })

  it('formats descriptions with inline code and a failure-reason code block', () => {
    const description = __alertNotifierTestUtils.buildLinearIssueDescription({
      event: makeAlertEvent(),
      connection,
      ruleName: 'Job failures',
      jobUrl: 'https://app.durabull.io/acme/c/conn_1/queues/conversation-background/jobs/job_9',
      jobContext: {
        jobId: 'job_9',
        jobName: 'refresh-summary',
        failedReason: 'Error: boom\n    at handler (worker.ts:10:3)',
        attemptsMade: 3,
        attempts: 5,
        failedAt: '2026-07-01T11:59:58.000Z',
      },
    })

    expect(description).toContain('- **Job name:** `refresh-summary`')
    expect(description).toContain('- **Queue:** `conversation-background`')
    expect(description).toContain(
      '**Failure reason:**\n\n```\nError: boom\n    at handler (worker.ts:10:3)\n```'
    )
    expect(description).toContain(
      '[Open in Durabull](https://app.durabull.io/acme/c/conn_1/queues/conversation-background/jobs/job_9)'
    )
    expect(description).not.toContain('\\-')
    expect(description).not.toContain('\\.')
  })

  it('neutralizes backticks and code fences inside dynamic values', () => {
    const description = __alertNotifierTestUtils.buildLinearIssueDescription({
      event: makeAlertEvent(),
      connection,
      ruleName: 'Job failures',
      jobUrl: 'https://app.durabull.io',
      jobContext: {
        jobId: null,
        jobName: 'weird`name',
        failedReason: 'before ``` after',
        attemptsMade: null,
        attempts: null,
        failedAt: null,
      },
    })

    expect(description).toContain("- **Job name:** `weird'name`")
    expect(description).toContain("```\nbefore ''' after\n```")
  })
})

describe('alert notifier webhook delivery inputs', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-alert-notifier-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    await closeDb()
    await seedOrganization()
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY = originalSecretKey

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

  it('uses destination-scoped targets for saved webhook deliveries', async () => {
    const destination = await alertWebhookDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Incident intake',
      url: 'https://example.com/durabull',
    })

    const input = await __alertNotifierTestUtils.buildDeliveryInput(
      { type: 'webhook', destinationId: destination.id },
      'alert-event-id',
      TEST_ORG_ID
    )

    expect(input.target).toBe(`destination:${destination.id}`)
    expect(input.providerMetadata).toMatchObject({
      type: 'webhook',
      destinationId: destination.id,
      url: 'https://example.com/durabull',
    })
  })

  it('turns unreadable destination secrets into retryable delivery metadata', async () => {
    const destination = await alertWebhookDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Corrupt secret',
      url: 'https://example.com/durabull',
      signingSecret: 'super-secret-webhook-value',
    })
    const db = await getDb()
    await db
      .update(alertWebhookDestination)
      .set({ encryptedSigningSecret: 'enc:v1:corrupt' })
      .where(eq(alertWebhookDestination.id, destination.id))

    const input = await __alertNotifierTestUtils.buildDeliveryInput(
      { type: 'webhook', destinationId: destination.id },
      'alert-event-id',
      TEST_ORG_ID
    )

    expect(input.target).toBe(`destination:${destination.id}`)
    expect(input.providerMetadata).toMatchObject({
      type: 'webhook',
      destinationId: destination.id,
      url: 'https://example.com/durabull',
      secretConfigured: true,
      deliveryError: 'Webhook destination "Corrupt secret" signing secret could not be decrypted.',
      deliveryErrorRetryable: true,
    })
  })

  it('refreshes enqueue-time delivery errors from the current destination on retry', async () => {
    const destination = await alertWebhookDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Retryable destination',
      url: 'https://example.com/durabull',
      signingSecret: 'super-secret-webhook-value',
    })
    const db = await getDb()
    await db
      .update(alertWebhookDestination)
      .set({ encryptedSigningSecret: 'enc:v1:corrupt' })
      .where(eq(alertWebhookDestination.id, destination.id))
    const failedInput = await __alertNotifierTestUtils.buildDeliveryInput(
      { type: 'webhook', destinationId: destination.id },
      'alert-event-id',
      TEST_ORG_ID
    )

    await alertWebhookDestinationRepository.update(destination.id, TEST_ORG_ID, {
      signingSecret: 'fixed-secret-webhook-value',
    })
    const refreshed = await __alertNotifierTestUtils.resolveWebhookMetadataForDispatch(
      failedInput.providerMetadata,
      TEST_ORG_ID
    )

    expect(refreshed).toMatchObject({
      type: 'webhook',
      destinationId: destination.id,
      url: 'https://example.com/durabull',
      secretConfigured: true,
      secretLast4: 'alue',
    })
    expect(refreshed).not.toHaveProperty('deliveryError')
  })

  it('stores only the destination reference for generalized destination channels', async () => {
    const destination = await alertDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'On-call email',
      type: 'email',
      config: { target: 'oncall@example.com' },
    })

    const input = await __alertNotifierTestUtils.buildDeliveryInput(
      { type: 'destination', destinationId: destination.id },
      'alert-event-id',
      TEST_ORG_ID
    )

    expect(input.channelType).toBe('destination')
    expect(input.target).toBe(`destination:${destination.id}`)
    // No embedded config — the destination is resolved fresh at dispatch time
    // so edits apply to queued deliveries.
    expect(input.providerMetadata).toEqual({
      type: 'destination',
      destinationId: destination.id,
    })
  })

  it('fails destination dispatch non-retryably when the destination is gone and retryably when disabled', async () => {
    const destination = await alertDestinationRepository.create({
      organizationId: TEST_ORG_ID,
      name: 'Ephemeral email',
      type: 'email',
      config: { target: 'oncall@example.com' },
    })

    const event = {
      id: 'event-1',
      organizationId: TEST_ORG_ID,
      queueName: 'email-send',
      alertRuleId: 'rule-1',
      type: 'failure_threshold',
      summary: 'Failures crossed the threshold.',
      firedAt: new Date(),
      context: {},
    } as never
    const connection = { id: 'conn-1', name: 'Primary Redis' }
    const makeDelivery = () =>
      ({
        id: 'delivery-1',
        alertEventId: 'event-1',
        organizationId: TEST_ORG_ID,
        channelType: 'destination',
        target: `destination:${destination.id}`,
        providerMetadata: { type: 'destination', destinationId: destination.id },
        attemptCount: 0,
        claimedAt: new Date(),
        createdAt: new Date(),
      }) as never

    await alertDestinationRepository.update(destination.id, TEST_ORG_ID, { enabled: false })
    await expect(
      __alertNotifierTestUtils.sendDestinationAlert(makeDelivery(), event, connection, 'Rule', null)
    ).rejects.toMatchObject({ retryable: true })

    await alertDestinationRepository.delete(destination.id, TEST_ORG_ID)
    await expect(
      __alertNotifierTestUtils.sendDestinationAlert(makeDelivery(), event, connection, 'Rule', null)
    ).rejects.toMatchObject({ name: 'NonRetryableDeliveryError' })
  })
})
