import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from '@durabull/env'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '../db/client'
import { alertEvent } from '../db/schemas/alert-event/schema'
import type { AlertRule } from '../db/schemas/alert-rule/types'
import { organization } from '../db/schemas/organization/schema'
import { user } from '../db/schemas/user/schema'
import { alertCheckCursorRepository } from './alert-check-cursor'
import { alertEventRepository } from './alert-event'
import { alertRuleRepository } from './alert-rule'
import { linearIssueResolutionRepository } from './linear-issue-resolution'
import { redisConnectionRepository } from './redis-connection'

const TEST_ORG_ID = 'alert-event-org'
const TEST_USER_ID = 'alert-event-user'
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_ENV_CONNECTIONS?: boolean
  DURABULL_REDIS_URL_ENCRYPTION_KEY?: string
  DURABULL_SECRET_ENCRYPTION_KEY?: string
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalEnvConnectionsFlag = mutableEnv.DURABULL_ENV_CONNECTIONS
const originalRedisEncryptionKey = mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY
const originalSecretEncryptionKey = mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

async function seedBase(): Promise<{ connectionId: string; rule: AlertRule }> {
  const db = await getDb()
  const now = new Date()
  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Alert Event Org',
    slug: 'alert-event-org',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(user).values({
    id: TEST_USER_ID,
    name: 'Ada Operator',
    email: 'ada@example.com',
    createdAt: now,
    updatedAt: now,
  })

  const connection = await redisConnectionRepository.create({
    organizationId: TEST_ORG_ID,
    name: 'Primary Redis',
    url: 'redis://localhost:6379/0',
    environment: 'development',
    isDefault: true,
  })

  const rule = await alertRuleRepository.create({
    organizationId: TEST_ORG_ID,
    connectionId: connection.id,
    queueName: 'email-send',
    name: 'Failure threshold',
    type: 'failure_threshold',
    config: { count: 5, windowMinutes: 5 },
    cooldownMinutes: 30,
  })

  return { connectionId: connection.id, rule }
}

async function createFiringEvent(rule: AlertRule, connectionId: string, queueName = 'email-send') {
  return alertEventRepository.create({
    alertRuleId: rule.id,
    organizationId: TEST_ORG_ID,
    connectionId,
    queueName,
    type: rule.type,
    status: 'firing',
    summary: 'Failures crossed the configured threshold.',
    firedAt: new Date(),
  })
}

describe('alertEventRepository', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-alert-event-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_ENV_CONNECTIONS = false
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    await closeDb()
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DURABULL_ENV_CONNECTIONS = originalEnvConnectionsFlag
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = originalRedisEncryptionKey
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY = originalSecretEncryptionKey

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

  it('acknowledges firing events with who and when, and only once', async () => {
    const { connectionId, rule } = await seedBase()
    const event = await createFiringEvent(rule, connectionId)

    const acknowledged = await alertEventRepository.acknowledge(event.id, TEST_ORG_ID, TEST_USER_ID)

    expect(acknowledged?.acknowledgedBy).toBe(TEST_USER_ID)
    expect(acknowledged?.acknowledgedAt).toBeInstanceOf(Date)
    expect(acknowledged?.status).toBe('firing')

    // Second acknowledge is a no-op (already acknowledged).
    await expect(
      alertEventRepository.acknowledge(event.id, TEST_ORG_ID, TEST_USER_ID)
    ).resolves.toBeNull()
  })

  it('creates only one active incident when evaluators race', async () => {
    const { connectionId, rule } = await seedBase()
    const input = {
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId,
      queueName: 'email-send',
      type: rule.type,
      summary: 'Failures crossed the configured threshold.',
      context: { value: 12, threshold: 5 },
      firedAt: new Date(),
    }

    const results = await Promise.all([
      alertEventRepository.createOrGetActive(input),
      alertEventRepository.createOrGetActive(input),
    ])

    expect(results.filter((result) => result.created)).toHaveLength(1)
    const eventIds = results.flatMap((result) => (result.event ? [result.event.id] : []))
    expect(new Set(eventIds).size).toBe(1)
    expect(await alertEventRepository.findActiveFiring(rule.id, 'email-send')).toMatchObject({
      id: eventIds[0],
      status: 'firing',
    })
  })

  it('does not create an incident from a stale rule snapshot', async () => {
    const { connectionId, rule } = await seedBase()
    await alertRuleRepository.update(rule.id, TEST_ORG_ID, { enabled: false })

    const result = await alertEventRepository.createOrGetActive(
      {
        alertRuleId: rule.id,
        organizationId: TEST_ORG_ID,
        connectionId,
        queueName: 'email-send',
        type: rule.type,
        summary: 'Stale evaluation',
        context: {},
        firedAt: new Date(),
      },
      { expectedRule: rule }
    )

    expect(result).toMatchObject({ event: null, created: false, staleRule: true })
    expect(await alertEventRepository.findActiveFiring(rule.id, 'email-send')).toBeNull()
  })

  it('does not resolve a newer incident from a stale rule evaluation', async () => {
    const { connectionId, rule } = await seedBase()
    const event = await createFiringEvent(rule, connectionId)
    await alertRuleRepository.update(rule.id, TEST_ORG_ID, {
      config: { count: 10, windowMinutes: 5 },
    })

    const result = await alertEventRepository.resolveActiveIfRuleCurrent(
      event.id,
      TEST_ORG_ID,
      rule
    )

    expect(result).toEqual({ event: null, staleRule: true })
    expect(await alertEventRepository.findActiveFiring(rule.id, 'email-send')).toMatchObject({
      id: event.id,
      status: 'firing',
    })
  })

  it('does not create an incident from an observation superseded by another replica', async () => {
    const { connectionId, rule } = await seedBase()
    const olderAt = new Date('2026-09-02T18:04:00.000Z')
    const newerAt = new Date('2026-09-02T18:05:00.000Z')
    await alertCheckCursorRepository.upsert({
      connectionId,
      queueName: 'email-send',
      lastCheckedAt: newerAt,
      observationToken: 'newer-observation',
      lastFailedCount: 10,
      lastCompletedCount: 0,
    })

    const result = await alertEventRepository.createOrGetActive(
      {
        alertRuleId: rule.id,
        organizationId: TEST_ORG_ID,
        connectionId,
        queueName: 'email-send',
        type: rule.type,
        summary: 'Stale observation',
        firedAt: olderAt,
      },
      {
        expectedRule: rule,
        latestEvaluation: {
          connectionId,
          queueName: 'email-send',
          capturedAt: olderAt,
          observationToken: 'older-observation',
        },
      }
    )

    expect(result).toEqual({ event: null, created: false, staleRule: true })
    expect(await alertEventRepository.findActiveFiring(rule.id, 'email-send')).toBeNull()
  })

  it('does not resolve an incident from an observation superseded by another replica', async () => {
    const { connectionId, rule } = await seedBase()
    const event = await createFiringEvent(rule, connectionId)
    const olderAt = new Date('2026-09-02T18:04:00.000Z')
    const newerAt = new Date('2026-09-02T18:05:00.000Z')
    await alertCheckCursorRepository.upsert({
      connectionId,
      queueName: 'email-send',
      lastCheckedAt: newerAt,
      observationToken: 'newer-observation',
      lastFailedCount: 0,
      lastCompletedCount: 10,
    })

    const result = await alertEventRepository.resolveActiveIfRuleCurrent(
      event.id,
      TEST_ORG_ID,
      rule,
      {
        connectionId,
        queueName: 'email-send',
        capturedAt: olderAt,
        observationToken: 'older-observation',
      }
    )

    expect(result).toEqual({ event: null, staleRule: true })
    expect(await alertEventRepository.findActiveFiring(rule.id, 'email-send')).toMatchObject({
      id: event.id,
      status: 'firing',
    })
  })

  it('keeps the newest cursor when monitor replicas finish out of order', async () => {
    const { connectionId } = await seedBase()
    const newerAt = new Date('2026-09-02T18:05:00.000Z')
    const olderAt = new Date('2026-09-02T18:04:00.000Z')

    await alertCheckCursorRepository.upsert({
      connectionId,
      queueName: '__durabull_internal__:redis_health',
      lastCheckedAt: newerAt,
      lastFailedCount: 2,
      lastCompletedCount: 3,
      lastMetricsSnapshot: { capturedAt: newerAt.toISOString() },
    })
    const result = await alertCheckCursorRepository.upsert({
      connectionId,
      queueName: '__durabull_internal__:redis_health',
      lastCheckedAt: olderAt,
      lastFailedCount: 99,
      lastCompletedCount: 99,
      lastMetricsSnapshot: { capturedAt: olderAt.toISOString() },
    })

    expect(result.lastCheckedAt).toEqual(newerAt)
    expect(result.lastFailedCount).toBe(2)
    expect(result.lastMetricsSnapshot).toEqual({ capturedAt: newerAt.toISOString() })
  })

  it('uses an observation token to arbitrate samples captured in the same millisecond', async () => {
    const { connectionId, rule } = await seedBase()
    const capturedAt = new Date('2026-09-02T18:05:00.000Z')
    await alertCheckCursorRepository.upsert({
      connectionId,
      queueName: 'email-send',
      lastCheckedAt: capturedAt,
      observationToken: 'observation-a',
      lastFailedCount: 1,
      lastCompletedCount: 1,
    })
    const winner = await alertCheckCursorRepository.upsert({
      connectionId,
      queueName: 'email-send',
      lastCheckedAt: capturedAt,
      observationToken: 'observation-z',
      lastFailedCount: 9,
      lastCompletedCount: 9,
    })

    expect(winner.lastObservationToken).toBe('observation-z')
    const staleResult = await alertEventRepository.createOrGetActive(
      {
        alertRuleId: rule.id,
        organizationId: TEST_ORG_ID,
        connectionId,
        queueName: 'email-send',
        type: rule.type,
        summary: 'Same-millisecond stale observation',
        firedAt: capturedAt,
      },
      {
        expectedRule: rule,
        latestEvaluation: {
          connectionId,
          queueName: 'email-send',
          capturedAt,
          observationToken: 'observation-a',
        },
      }
    )
    expect(staleResult).toEqual({ event: null, created: false, staleRule: true })
  })

  it('does not record a suppression from an observation superseded by another replica', async () => {
    const { connectionId, rule } = await seedBase()
    const olderAt = new Date('2026-09-02T18:05:00.000Z')
    const newerAt = new Date('2026-09-02T18:06:00.000Z')
    await alertCheckCursorRepository.upsert({
      connectionId,
      queueName: 'email-send',
      lastCheckedAt: newerAt,
      observationToken: 'newer-observation',
      lastFailedCount: 10,
      lastCompletedCount: 100,
    })

    const result = await alertEventRepository.upsertSuppressed(
      {
        alertRuleId: rule.id,
        organizationId: TEST_ORG_ID,
        connectionId,
        queueName: 'email-send',
        type: rule.type,
        summary: 'Stale suppression',
        context: {},
        dedupeKey: 'suppressed:anchor',
        observationToken: 'older-observation',
      },
      {
        latestEvaluation: {
          connectionId,
          queueName: 'email-send',
          capturedAt: olderAt,
          observationToken: 'older-observation',
        },
      }
    )

    expect(result).toBeNull()
    expect(await alertEventRepository.findByRule(rule.id, { offset: 0, limit: 10 })).toEqual([])
  })

  it('durably tracks external resolution work until it is cleared', async () => {
    const { connectionId, rule } = await seedBase()
    const firing = await createFiringEvent(rule, connectionId)
    const resolved = await alertEventRepository.resolve(firing.id, TEST_ORG_ID)
    expect(resolved).toMatchObject({
      linearResolutionSyncPending: true,
      linearResolutionReason: 'manual',
    })

    expect(await alertEventRepository.findPendingLinearResolutionSyncForRule(rule.id)).toEqual([
      expect.objectContaining({ id: firing.id, status: 'resolved' }),
    ])

    expect(
      await alertEventRepository.claimLinearResolutionSync(firing.id, 'worker-a')
    ).toMatchObject({ id: firing.id, linearResolutionSyncClaimToken: 'worker-a' })
    expect(await alertEventRepository.claimLinearResolutionSync(firing.id, 'worker-b')).toBeNull()

    await alertEventRepository.releaseLinearResolutionSyncClaims(
      [firing.id],
      'worker-a',
      new Date()
    )
    expect(
      await alertEventRepository.claimLinearResolutionSync(firing.id, 'worker-b')
    ).toMatchObject({ id: firing.id, linearResolutionSyncClaimToken: 'worker-b' })

    await alertEventRepository.clearLinearResolutionSyncPending([firing.id], 'worker-b')
    expect(await alertEventRepository.findPendingLinearResolutionSyncForRule(rule.id)).toEqual([])
  })

  it('promotes legacy rolling-deployment resolution markers into the typed outbox', async () => {
    const { connectionId, rule } = await seedBase()
    const firing = await createFiringEvent(rule, connectionId)
    const db = await getDb()
    await db
      .update(alertEvent)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        linearResolutionSyncPending: false,
        context: { linearResolutionSyncPending: true },
      })
      .where(eq(alertEvent.id, firing.id))

    const pending = await alertEventRepository.findPendingLinearResolutionSync(10)
    expect(pending).toEqual([
      expect.objectContaining({
        id: firing.id,
        linearResolutionSyncPending: true,
        linearResolutionReason: 'legacy',
      }),
    ])
    expect(
      await alertEventRepository.claimLinearResolutionSync(firing.id, 'rolling-upgrade-worker')
    ).toMatchObject({
      id: firing.id,
      linearResolutionSyncPending: true,
      linearResolutionSyncClaimToken: 'rolling-upgrade-worker',
    })
  })

  it('claims a legacy marker directly with a neutral reason', async () => {
    const { connectionId, rule } = await seedBase()
    const event = await createFiringEvent(rule, connectionId)
    const db = await getDb()
    await db
      .update(alertEvent)
      .set({ status: 'resolved', context: { migrationLinearSyncPending: true } })
      .where(eq(alertEvent.id, event.id))
    expect(
      await alertEventRepository.claimLinearResolutionSync(event.id, 'direct-legacy')
    ).toMatchObject({ linearResolutionReason: 'legacy', linearResolutionSyncPending: true })
  })

  it('persists terminal failure and removes legacy markers only for the current claim', async () => {
    const { connectionId, rule } = await seedBase()
    const event = await createFiringEvent(rule, connectionId)
    await alertEventRepository.resolve(event.id, TEST_ORG_ID)
    const db = await getDb()
    await db
      .update(alertEvent)
      .set({
        context: {
          linearResolutionSyncPending: true,
          migrationLinearSyncPending: true,
          evidence: 'retained',
        },
      })
      .where(eq(alertEvent.id, event.id))
    await alertEventRepository.claimLinearResolutionSync(event.id, 'terminal-worker')
    await alertEventRepository.abandonLinearResolutionSync(
      [event.id],
      'stale-worker',
      'Stale failure'
    )
    expect(await alertEventRepository.findById(event.id, TEST_ORG_ID)).toMatchObject({
      linearResolutionSyncPending: true,
      linearResolutionFailedAt: null,
    })
    await alertEventRepository.abandonLinearResolutionSync(
      [event.id],
      'terminal-worker',
      'Integration disconnected'
    )
    expect(await alertEventRepository.findById(event.id, TEST_ORG_ID)).toMatchObject({
      linearResolutionSyncPending: false,
      linearResolutionFailedAt: expect.any(Date),
      linearResolutionLastError: 'Integration disconnected',
      linearResolutionAttempts: 1,
      context: { evidence: 'retained' },
    })
    expect(await alertEventRepository.findPendingLinearResolutionSync()).toEqual([])
    expect(await alertEventRepository.claimLinearResolutionSync(event.id, 'new-worker')).toBeNull()
    await alertRuleRepository.update(rule.id, TEST_ORG_ID, {
      enabled: false,
      deletionRequestedAt: new Date(),
    })
    await alertRuleRepository.claimDeletionRequested(1, 'delete-worker')
    expect(await alertRuleRepository.deleteIfDeletionRequested(rule.id, 'delete-worker')).toBe(true)
    expect(await redisConnectionRepository.deleteIfNoAlertRules(connectionId, TEST_ORG_ID)).toBe(
      'deleted'
    )
  })

  it('persists a stable comment ID across a released issue lease and fences stale workers', async () => {
    await seedBase()
    await linearIssueResolutionRepository.claim(TEST_ORG_ID, 'interrupted-issue', 'worker-a')
    expect(
      await linearIssueResolutionRepository.findCommentId('interrupted-issue', 'worker-a')
    ).toBeNull()
    const commentId = await linearIssueResolutionRepository.prepareComment(
      'interrupted-issue',
      'worker-a'
    )
    expect(commentId).toMatch(/^[0-9a-f-]{36}$/)
    expect(
      await linearIssueResolutionRepository.prepareComment('interrupted-issue', 'worker-a')
    ).toBe(commentId)
    await linearIssueResolutionRepository.release('interrupted-issue', 'worker-a')
    await linearIssueResolutionRepository.claim(TEST_ORG_ID, 'interrupted-issue', 'worker-b')
    expect(
      await linearIssueResolutionRepository.prepareComment('interrupted-issue', 'worker-a')
    ).toBeNull()
    expect(
      await linearIssueResolutionRepository.findCommentId('interrupted-issue', 'worker-b')
    ).toBe(commentId)
    expect(
      await linearIssueResolutionRepository.markCompleted('interrupted-issue', 'worker-a')
    ).toBe(false)
    expect(
      await linearIssueResolutionRepository.markCompleted('interrupted-issue', 'worker-b')
    ).toBe(true)
  })

  it('refuses job-failure inserts from a stale rule evaluation after edits, disable, snooze, or tenant mismatch', async () => {
    const { connectionId, rule } = await seedBase()
    const input = {
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId,
      queueName: 'jobs',
      type: 'job_failed',
      summary: 'Failed job',
      firedAt: new Date(),
      dedupeKey: 'job:1',
    }
    const first = await alertEventRepository.createOrGetByDedupeKey(input, { expectedRule: rule })
    expect(first?.created).toBe(true)
    expect(
      await alertEventRepository.createOrGetByDedupeKey(input, { expectedRule: rule })
    ).toMatchObject({ created: false, event: { id: first?.event.id } })
    for (const patch of [
      { enabled: false },
      { enabled: true, queueName: 'different' },
      { mutedUntil: new Date(Date.now() + 60_000) },
    ]) {
      await alertRuleRepository.update(rule.id, TEST_ORG_ID, patch)
      expect(
        await alertEventRepository.createOrGetByDedupeKey(
          { ...input, dedupeKey: JSON.stringify(patch) },
          { expectedRule: rule }
        )
      ).toBeNull()
    }
    expect(
      await alertEventRepository.createOrGetByDedupeKey(
        { ...input, organizationId: 'another-tenant' },
        { expectedRule: rule }
      )
    ).toBeNull()
    expect(await alertEventRepository.findByRule(rule.id, { offset: 0, limit: 10 })).toHaveLength(1)
  })

  it('backs off failed external sync work until its next retry time', async () => {
    const { connectionId, rule } = await seedBase()
    const firing = await createFiringEvent(rule, connectionId)
    await alertEventRepository.resolve(firing.id, TEST_ORG_ID)
    await alertEventRepository.claimLinearResolutionSync(firing.id, 'backoff-worker')
    await alertEventRepository.releaseLinearResolutionSyncClaims(
      [firing.id],
      'backoff-worker',
      new Date(Date.now() + 60_000)
    )

    expect(await alertEventRepository.findPendingLinearResolutionSync(10)).toEqual([])
    expect(
      await alertEventRepository.claimLinearResolutionSync(firing.id, 'early-worker')
    ).toBeNull()
    expect(await alertEventRepository.findPendingLinearResolutionSyncForRule(rule.id, 1)).toEqual([
      expect.objectContaining({ id: firing.id, linearResolutionAttempts: 1 }),
    ])
  })

  it('deduplicates Linear issue resolution across workers and completed events', async () => {
    await seedBase()
    expect(
      await linearIssueResolutionRepository.claim(TEST_ORG_ID, 'linear-issue-1', 'worker-a')
    ).toBe('claimed')
    expect(
      await linearIssueResolutionRepository.claim(TEST_ORG_ID, 'linear-issue-1', 'worker-b')
    ).toBe('busy')
    expect(await linearIssueResolutionRepository.markCompleted('linear-issue-1', 'worker-a')).toBe(
      true
    )
    expect(
      await linearIssueResolutionRepository.claim(TEST_ORG_ID, 'linear-issue-1', 'worker-b')
    ).toBe('completed')
  })

  it('deletes ordinary expired events without treating missing legacy flags as pending sync', async () => {
    const { connectionId, rule } = await seedBase()
    const firedAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    const events = []
    for (const status of ['resolved', 'suppressed'] as const) {
      for (const context of [null, {}, { linearResolutionSyncPending: false }]) {
        events.push(
          await alertEventRepository.create({
            alertRuleId: rule.id,
            organizationId: TEST_ORG_ID,
            connectionId,
            queueName: 'expired-event',
            type: rule.type,
            status,
            summary: 'Expired event without pending external sync.',
            context,
            firedAt,
          })
        )
      }
    }

    expect(await alertEventRepository.deleteOlderThan(90, 365)).toBe(events.length)
    for (const event of events) {
      expect(await alertEventRepository.findById(event.id, TEST_ORG_ID)).toBeNull()
    }
  })

  it('retains pending external sync work temporarily but enforces a hard retention cap', async () => {
    const { connectionId, rule } = await seedBase()
    const now = Date.now()
    const retained = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId,
      queueName: 'retained-pending-sync',
      type: rule.type,
      status: 'resolved',
      summary: 'Pending external sync within the hard cap.',
      firedAt: new Date(now - 100 * 24 * 60 * 60 * 1000),
      resolvedAt: new Date(now - 100 * 24 * 60 * 60 * 1000),
      linearResolutionSyncPending: true,
    })
    const expired = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId,
      queueName: 'expired-pending-sync',
      type: rule.type,
      status: 'resolved',
      summary: 'Pending external sync beyond the hard cap.',
      firedAt: new Date(now - 400 * 24 * 60 * 60 * 1000),
      resolvedAt: new Date(now - 400 * 24 * 60 * 60 * 1000),
      linearResolutionSyncPending: true,
    })
    const stillFiring = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId,
      queueName: 'long-running-firing-incident',
      type: rule.type,
      status: 'firing',
      summary: 'A long-running incident must never be removed by retention.',
      firedAt: new Date(now - 400 * 24 * 60 * 60 * 1000),
    })

    expect(await alertEventRepository.deleteOlderThan(90, 365)).toBe(1)
    expect(await alertEventRepository.findById(retained.id, TEST_ORG_ID)).not.toBeNull()
    expect(await alertEventRepository.findById(expired.id, TEST_ORG_ID)).toBeNull()
    expect(await alertEventRepository.findById(stillFiring.id, TEST_ORG_ID)).not.toBeNull()
  })

  it('does not hard-delete pending external sync work while its lease is active', async () => {
    const { connectionId, rule } = await seedBase()
    const now = Date.now()
    const claimed = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId,
      queueName: 'actively-claimed-sync',
      type: rule.type,
      status: 'resolved',
      summary: 'Actively claimed external sync beyond the hard cap.',
      firedAt: new Date(now - 400 * 24 * 60 * 60 * 1000),
      resolvedAt: new Date(now - 400 * 24 * 60 * 60 * 1000),
      linearResolutionSyncPending: true,
    })
    await alertEventRepository.claimLinearResolutionSync(claimed.id, 'active-worker')

    expect(await alertEventRepository.deleteOlderThan(90, 365)).toBe(0)
    expect(await alertEventRepository.findById(claimed.id, TEST_ORG_ID)).not.toBeNull()
  })

  it('rejects acknowledging resolved events and preserves ack through resolve', async () => {
    const { connectionId, rule } = await seedBase()

    const resolvedFirst = await createFiringEvent(rule, connectionId)
    await alertEventRepository.resolve(resolvedFirst.id, TEST_ORG_ID)
    await expect(
      alertEventRepository.acknowledge(resolvedFirst.id, TEST_ORG_ID, TEST_USER_ID)
    ).resolves.toBeNull()

    const ackedThenResolved = await createFiringEvent(rule, connectionId, 'reports')
    await alertEventRepository.acknowledge(ackedThenResolved.id, TEST_ORG_ID, TEST_USER_ID)
    const resolved = await alertEventRepository.resolve(ackedThenResolved.id, TEST_ORG_ID)

    expect(resolved?.status).toBe('resolved')
    expect(resolved?.acknowledgedBy).toBe(TEST_USER_ID)
    expect(resolved?.acknowledgedAt).toBeInstanceOf(Date)
  })

  it('unacknowledges a firing event', async () => {
    const { connectionId, rule } = await seedBase()
    const event = await createFiringEvent(rule, connectionId)

    await alertEventRepository.acknowledge(event.id, TEST_ORG_ID, TEST_USER_ID)
    const cleared = await alertEventRepository.unacknowledge(event.id, TEST_ORG_ID)
    expect(cleared?.acknowledgedAt).toBeNull()
    expect(cleared?.acknowledgedBy).toBeNull()
  })

  it('coalesces repeated suppressions into one event with a running count', async () => {
    const { connectionId, rule } = await seedBase()
    const anchor = await createFiringEvent(rule, connectionId)

    const base = {
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId,
      queueName: 'email-send',
      type: rule.type,
      summary: 'Still failing during cooldown.',
      context: { failedDelta: 12 },
      dedupeKey: `suppressed:${anchor.id}`,
    }

    const first = await alertEventRepository.upsertSuppressed(base)
    if (!first) throw new Error('Expected first suppression result')
    expect(first.created).toBe(true)
    expect(first.event.status).toBe('suppressed')
    expect((first.event.context as Record<string, unknown>).suppressedCount).toBe(1)

    const second = await alertEventRepository.upsertSuppressed(base)
    if (!second) throw new Error('Expected second suppression result')
    expect(second.created).toBe(false)
    expect(second.event.id).toBe(first.event.id)
    expect((second.event.context as Record<string, unknown>).suppressedCount).toBe(2)

    const third = await alertEventRepository.upsertSuppressed(base)
    if (!third) throw new Error('Expected third suppression result')
    expect((third.event.context as Record<string, unknown>).suppressedCount).toBe(3)

    const replayed = await alertEventRepository.upsertSuppressed({
      ...base,
      observationToken: 'durable-observation',
    })
    const duplicateReplay = await alertEventRepository.upsertSuppressed({
      ...base,
      observationToken: 'durable-observation',
    })
    if (!replayed) throw new Error('Expected replayed suppression result')
    expect((replayed.event.context as Record<string, unknown>).suppressedCount).toBe(4)
    if (!duplicateReplay) throw new Error('Expected duplicateReplay suppression result')
    expect((duplicateReplay.event.context as Record<string, unknown>).suppressedCount).toBe(4)
  })

  it('anchors cooldown lookups to non-suppressed events', async () => {
    const { connectionId, rule } = await seedBase()
    const anchor = await createFiringEvent(rule, connectionId)

    await alertEventRepository.upsertSuppressed({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId,
      queueName: 'email-send',
      type: rule.type,
      summary: 'Suppressed during cooldown.',
      context: {},
      dedupeKey: `suppressed:${anchor.id}`,
    })

    const mostRecentAny = await alertEventRepository.findMostRecentForRule(rule.id, 'email-send')
    expect(mostRecentAny?.status).toBe('suppressed')

    const mostRecentFired = await alertEventRepository.findMostRecentFiredForRule(
      rule.id,
      'email-send'
    )
    expect(mostRecentFired?.id).toBe(anchor.id)
    expect(mostRecentFired?.status).toBe('firing')
  })

  it('summarizes open events per connection split by acknowledgement', async () => {
    const { connectionId, rule } = await seedBase()

    const acked = await createFiringEvent(rule, connectionId, 'queue-a')
    await alertEventRepository.acknowledge(acked.id, TEST_ORG_ID, TEST_USER_ID)
    await createFiringEvent(rule, connectionId, 'queue-b')
    await createFiringEvent(rule, connectionId, 'queue-c')

    const resolved = await createFiringEvent(rule, connectionId, 'queue-d')
    await alertEventRepository.resolve(resolved.id, TEST_ORG_ID)

    const summary = await alertEventRepository.summarizeOpenByOrganization(TEST_ORG_ID)
    expect(summary).toEqual([{ connectionId, firing: 2, acknowledged: 1, open: 3 }])
  })

  it('filters by acknowledgement and returns the acknowledging user name', async () => {
    const { connectionId, rule } = await seedBase()

    const acked = await createFiringEvent(rule, connectionId, 'queue-a')
    await alertEventRepository.acknowledge(acked.id, TEST_ORG_ID, TEST_USER_ID)
    await createFiringEvent(rule, connectionId, 'queue-b')

    const ackedRows = await alertEventRepository.findByConnection(connectionId, TEST_ORG_ID, {
      offset: 0,
      limit: 10,
      acknowledged: true,
    })
    expect(ackedRows).toHaveLength(1)
    expect(ackedRows[0].id).toBe(acked.id)
    expect(ackedRows[0].acknowledgedByName).toBe('Ada Operator')

    const unackedRows = await alertEventRepository.findByConnection(connectionId, TEST_ORG_ID, {
      offset: 0,
      limit: 10,
      acknowledged: false,
    })
    expect(unackedRows).toHaveLength(1)
    expect(unackedRows[0].acknowledgedByName).toBeNull()

    await expect(
      alertEventRepository.countByConnection(connectionId, TEST_ORG_ID, { acknowledged: true })
    ).resolves.toBe(1)
  })
})
