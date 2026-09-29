import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from '@durabull/env'
import { closeDb, getDb } from '../db/client'
import { organization } from '../db/schemas/organization/schema'
import { alertEventRepository } from './alert-event'
import { alertRuleRepository } from './alert-rule'
import { linearIssueResolutionRepository } from './linear-issue-resolution'
import { linearJobIssueRepository } from './linear-job-issue'
import { redisConnectionRepository } from './redis-connection'

const TEST_ORG_ID = 'linear-job-issue-org'
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_ENV_CONNECTIONS?: boolean
  DURABULL_REDIS_URL_ENCRYPTION_KEY?: string
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalEnvConnectionsFlag = mutableEnv.DURABULL_ENV_CONNECTIONS
const originalEncryptionKey = mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

async function seedBase() {
  const db = await getDb()
  const now = new Date()

  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Linear Job Issue Org',
    slug: 'linear-job-issue-org',
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

  const rule = await alertRuleRepository.create({
    organizationId: TEST_ORG_ID,
    connectionId: connection.id,
    queueName: 'email-send',
    name: 'Job failed',
    type: 'job_failed',
    config: { maxIssuesPerPoll: 100 },
    cooldownMinutes: 30,
  })

  return { connection, rule }
}

describe('linearJobIssueRepository', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-linear-job-issue-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_ENV_CONNECTIONS = false
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    await closeDb()
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DURABULL_ENV_CONNECTIONS = originalEnvConnectionsFlag
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = originalEncryptionKey

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

  it('invalidates an in-flight resolution only when a new incident links to the issue', async () => {
    const { connection, rule } = await seedBase()
    const eventInput = {
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: connection.id,
      queueName: 'email-send',
      type: 'job_failed',
      status: 'firing' as const,
      summary: 'Failed job',
      context: { jobId: 'job-1' },
      firedAt: new Date(),
    }
    const firstEvent = await alertEventRepository.create(eventInput)
    const issueInput = {
      organizationId: TEST_ORG_ID,
      connectionId: connection.id,
      queueName: 'email-send',
      jobId: 'job-1',
      alertEventId: firstEvent.id,
      linearIssueId: 'issue-1',
      linearIssueIdentifier: 'OPS-1',
      linearIssueUrl: 'https://linear.app/acme/issue/OPS-1',
    }
    await linearJobIssueRepository.createOrGet(issueInput)
    expect(await linearIssueResolutionRepository.claim(TEST_ORG_ID, 'issue-1', 'old-worker')).toBe(
      'claimed'
    )
    // An idempotent link replay must leave an existing worker's lease intact.
    await linearJobIssueRepository.createOrGet(issueInput)
    expect(
      await linearIssueResolutionRepository.claim(TEST_ORG_ID, 'issue-1', 'other-worker')
    ).toBe('busy')

    const secondEvent = await alertEventRepository.create(eventInput)
    await linearJobIssueRepository.createOrGet({ ...issueInput, alertEventId: secondEvent.id })
    // A worker that checked peers before the new link cannot complete its ledger.
    expect(await linearIssueResolutionRepository.markCompleted('issue-1', 'old-worker')).toBe(false)
    expect(await linearIssueResolutionRepository.claim(TEST_ORG_ID, 'issue-1', 'new-worker')).toBe(
      'claimed'
    )
  })

  it('links reused job issues to every alert event that reused them', async () => {
    const { connection, rule } = await seedBase()
    const firstEvent = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: connection.id,
      queueName: 'email-send',
      type: 'job_failed',
      status: 'firing',
      summary: 'First alert',
      context: { jobId: 'job-1' },
      firedAt: new Date(),
    })
    const secondEvent = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: connection.id,
      queueName: 'email-send',
      type: 'job_failed',
      status: 'firing',
      summary: 'Second alert',
      context: { jobId: 'job-1' },
      firedAt: new Date(),
    })

    const firstIssue = await linearJobIssueRepository.createOrGet({
      organizationId: TEST_ORG_ID,
      connectionId: connection.id,
      queueName: 'email-send',
      jobId: 'job-1',
      alertEventId: firstEvent.id,
      linearIssueId: 'issue-1',
      linearIssueIdentifier: 'OPS-1',
      linearIssueUrl: 'https://linear.app/acme/issue/OPS-1',
    })
    expect(
      await linearIssueResolutionRepository.claim(TEST_ORG_ID, 'issue-1', 'first-worker')
    ).toBe('claimed')
    await linearIssueResolutionRepository.markCompleted('issue-1', 'first-worker')
    // Replaying the first event does not invalidate its completed resolution.
    await linearJobIssueRepository.createOrGet({
      organizationId: TEST_ORG_ID,
      connectionId: connection.id,
      queueName: 'email-send',
      jobId: 'job-1',
      alertEventId: firstEvent.id,
      linearIssueId: 'issue-1',
      linearIssueIdentifier: 'OPS-1',
      linearIssueUrl: 'https://linear.app/acme/issue/OPS-1',
    })
    expect(
      await linearIssueResolutionRepository.claim(TEST_ORG_ID, 'issue-1', 'replay-worker')
    ).toBe('completed')

    const reusedIssue = await linearJobIssueRepository.createOrGet({
      organizationId: TEST_ORG_ID,
      connectionId: connection.id,
      queueName: 'email-send',
      jobId: 'job-1',
      alertEventId: secondEvent.id,
      linearIssueId: 'issue-1',
      linearIssueIdentifier: 'OPS-1',
      linearIssueUrl: 'https://linear.app/acme/issue/OPS-1',
    })

    expect(reusedIssue.id).toBe(firstIssue.id)
    // A new incident must be allowed to close this issue again if it was reopened.
    expect(
      await linearIssueResolutionRepository.claim(TEST_ORG_ID, 'issue-1', 'second-worker')
    ).toBe('claimed')
    await expect(linearJobIssueRepository.findByEvent(firstEvent.id)).resolves.toEqual([
      expect.objectContaining({ id: firstIssue.id, linearIssueIdentifier: 'OPS-1' }),
    ])
    await expect(linearJobIssueRepository.findByEvent(secondEvent.id)).resolves.toEqual([
      expect.objectContaining({ id: firstIssue.id, linearIssueIdentifier: 'OPS-1' }),
    ])
  })
})
