import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from '@durabull/env'
import { closeDb, getDb } from '../db/client'
import { member, organization } from '../db/schemas/organization/schema'
import { user } from '../db/schemas/user/schema'
import { decryptSecret } from '../db/secret-encryption'
import { alertDeliveryRepository } from './alert-delivery'
import { alertEventRepository } from './alert-event'
import { alertRuleRepository } from './alert-rule'
import { redisConnectionRepository } from './redis-connection'
import { desiredSlackMessageState, slackAlertMessageRepository } from './slack-alert-message'
import { slackInstallationRepository } from './slack-installation'
import { slackOauthStateRepository } from './slack-oauth-state'

const ORG_A = 'slack-org-a'
const ORG_B = 'slack-org-b'
const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_ENV_CONNECTIONS?: boolean
  DURABULL_REDIS_URL_ENCRYPTION_KEY?: string
  DURABULL_SECRET_ENCRYPTION_KEY?: string
}

const original = {
  databaseUrl: mutableEnv.DATABASE_URL,
  envConnections: mutableEnv.DURABULL_ENV_CONNECTIONS,
  redisKey: mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY,
  secretKey: mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY,
  pgliteDir: process.env.DURABULL_PGLITE_DIR,
}

let tempPgliteDir = ''

async function seed() {
  const db = await getDb()
  const now = new Date()
  await db.insert(organization).values([
    { id: ORG_A, name: 'Acme', slug: 'acme', createdAt: now, updatedAt: now },
    { id: ORG_B, name: 'Beta', slug: 'beta', createdAt: now, updatedAt: now },
  ])
  await db.insert(user).values([
    { id: 'user-ada', name: 'Ada', email: 'Ada@Example.com', createdAt: now, updatedAt: now },
    { id: 'user-bob', name: 'Bob', email: 'bob@example.com', createdAt: now, updatedAt: now },
  ])
  await db.insert(member).values([
    { id: 'member-ada', organizationId: ORG_A, userId: 'user-ada', role: 'owner', createdAt: now },
    { id: 'member-bob', organizationId: ORG_B, userId: 'user-bob', role: 'member', createdAt: now },
  ])
  const connection = await redisConnectionRepository.create({
    name: 'Primary Redis',
    url: 'redis://localhost:6379/0',
    environment: 'production',
    isDefault: true,
    organizationId: ORG_A,
  })
  const rule = await alertRuleRepository.create({
    organizationId: ORG_A,
    connectionId: connection.id,
    queueName: 'email-send',
    name: 'Email failures',
    type: 'failure_threshold',
    config: { threshold: 5 },
    cooldownMinutes: 30,
  })
  return { connection, rule }
}

describe('Slack repositories', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-slack-repos-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_ENV_CONNECTIONS = false
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = TEST_KEY
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY = TEST_KEY
    await closeDb()
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = original.databaseUrl
    mutableEnv.DURABULL_ENV_CONNECTIONS = original.envConnections
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = original.redisKey
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY = original.secretKey
    if (original.pgliteDir) process.env.DURABULL_PGLITE_DIR = original.pgliteDir
    else delete process.env.DURABULL_PGLITE_DIR
    if (tempPgliteDir) {
      await rm(tempPgliteDir, { recursive: true, force: true })
      tempPgliteDir = ''
    }
  })

  it('stores installations with encrypted tokens and routes workspaces to organizations', async () => {
    await seed()
    const installation = await slackInstallationRepository.upsert({
      organizationId: ORG_A,
      slackTeamId: 'T1',
      slackTeamName: 'Acme Slack',
      botUserId: 'UBOT',
      botToken: 'xoxb-secret',
      scopes: 'chat:write,commands',
      installedByUserId: 'user-ada',
    })
    expect(installation.encryptedBotToken).not.toContain('xoxb-secret')
    expect(decryptSecret(installation.encryptedBotToken)).toBe('xoxb-secret')

    await slackInstallationRepository.upsert({
      organizationId: ORG_B,
      slackTeamId: 'T1',
      slackTeamName: 'Acme Slack',
      botUserId: 'UBOT',
      botToken: 'xoxb-secret',
      scopes: 'chat:write,commands',
    })

    const active = await slackInstallationRepository.listActiveByTeam('T1')
    expect(active.map((row) => row.organizationSlug)).toEqual(['acme', 'beta'])
    expect(await slackInstallationRepository.countOtherInstallationsForTeam('T1', ORG_A)).toBe(1)

    expect(await slackInstallationRepository.markTeamRevoked('T1', 'app_uninstalled')).toBe(2)
    expect(await slackInstallationRepository.listActiveByTeam('T1')).toEqual([])
    // A revoked installation no longer holds the shared bot token.
    expect(await slackInstallationRepository.countOtherInstallationsForTeam('T1', ORG_A)).toBe(0)

    // Reinstalling reactivates the row and keeps the settings toggles.
    await slackInstallationRepository.updateSettings(ORG_A, { unfurlsEnabled: false })
    const reinstalled = await slackInstallationRepository.upsert({
      organizationId: ORG_A,
      slackTeamId: 'T1',
      slackTeamName: 'Acme Slack',
      botUserId: 'UBOT',
      botToken: 'xoxb-new',
      scopes: 'chat:write,commands',
    })
    expect(reinstalled.status).toBe('active')
    expect(reinstalled.unfurlsEnabled).toBe(false)
  })

  it('matches Slack profile emails to organization members case-insensitively', async () => {
    await seed()
    const ada = await slackInstallationRepository.findMemberByEmail(ORG_A, ' ada@example.com ')
    expect(ada).toMatchObject({ userId: 'user-ada', role: 'owner' })
    expect(await slackInstallationRepository.findMemberByEmail(ORG_A, 'bob@example.com')).toBeNull()
    expect(await slackInstallationRepository.findUserName('user-bob')).toBe('Bob')
  })

  it('consumes OAuth state exactly once', async () => {
    await seed()
    await slackOauthStateRepository.create({
      organizationId: ORG_A,
      userId: 'user-ada',
      state: 'state-value',
      redirectUri: 'https://app.test/api/integrations/slack/callback',
      returnTo: 'destinations',
      expiresAt: new Date(Date.now() + 60_000),
    })
    const consumed = await slackOauthStateRepository.consumeByState('state-value')
    expect(consumed?.returnTo).toBe('destinations')
    expect(await slackOauthStateRepository.consumeByState('state-value')).toBeNull()
  })

  it('claims only messages whose incident state changed', async () => {
    const { connection, rule } = await seed()
    const event = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: ORG_A,
      connectionId: connection.id,
      queueName: 'email-send',
      type: 'failure_threshold',
      status: 'firing',
      summary: '7 failed jobs in email-send',
      firedAt: new Date(),
    })
    const [delivery] = await alertDeliveryRepository.enqueueMany([
      {
        alertEventId: event.id,
        organizationId: ORG_A,
        channelType: 'destination',
        target: 'destination:abc',
        providerMetadata: {},
      },
    ])
    const deliveryId =
      delivery?.id ?? (await alertDeliveryRepository.listByEvent(event.id))[0]?.id ?? ''
    const message = await slackAlertMessageRepository.createOrGet({
      organizationId: ORG_A,
      alertEventId: event.id,
      alertDeliveryId: deliveryId,
      slackTeamId: 'T1',
      channelId: 'C1',
      messageTs: '1700000000.000100',
      renderedState: 'firing',
    })
    const again = await slackAlertMessageRepository.createOrGet({
      organizationId: ORG_A,
      alertEventId: event.id,
      alertDeliveryId: deliveryId,
      slackTeamId: 'T1',
      channelId: 'C1',
      messageTs: '1700000000.999999',
      renderedState: 'firing',
    })
    expect(again.id).toBe(message.id)
    expect(again.messageTs).toBe('1700000000.000100')

    expect(await slackAlertMessageRepository.claimOutOfSync()).toEqual([])

    await alertEventRepository.acknowledge(event.id, ORG_A, 'user-ada')
    const claimed = await slackAlertMessageRepository.claimOutOfSync({ alertEventIds: [event.id] })
    expect(claimed.map((row) => row.id)).toEqual([message.id])
    // The lease keeps a second worker from claiming the same message.
    expect(await slackAlertMessageRepository.claimOutOfSync()).toEqual([])

    const claim = claimed[0]!
    // A worker whose lease was taken over cannot record its result.
    expect(
      await slackAlertMessageRepository.markSynced(
        { ...claim, leaseToken: 'stale-worker' },
        { state: 'acknowledged', acknowledgedBy: 'user-ada' }
      )
    ).toBe(false)
    expect(
      await slackAlertMessageRepository.markSynced(claim, {
        state: 'acknowledged',
        acknowledgedBy: 'user-ada',
      })
    ).toBe(true)
    expect(await slackAlertMessageRepository.claimOutOfSync()).toEqual([])

    // A refresh request re-renders even though the incident state is unchanged.
    expect(await slackAlertMessageRepository.requestRefreshForOpenIncidents(ORG_A)).toEqual([
      event.id,
    ])
    const refreshed = await slackAlertMessageRepository.claimOutOfSync()
    expect(refreshed).toHaveLength(1)
    await slackAlertMessageRepository.markSynced(refreshed[0]!, {
      state: 'acknowledged',
      acknowledgedBy: 'user-ada',
    })
    expect(await slackAlertMessageRepository.claimOutOfSync()).toEqual([])

    await alertEventRepository.resolve(event.id, ORG_A, 'manual', 'user-ada')
    const resolved = await alertEventRepository.findById(event.id, ORG_A)
    expect(resolved?.resolvedBy).toBe('user-ada')
    expect(desiredSlackMessageState(resolved!)).toBe('resolved')
    const afterResolve = await slackAlertMessageRepository.claimOutOfSync()
    expect(afterResolve).toHaveLength(1)

    // Parked messages stay out of the loop until the workspace is reconnected.
    await slackAlertMessageRepository.abandon(afterResolve[0]!, 'not_in_channel')
    expect(await slackAlertMessageRepository.claimOutOfSync()).toEqual([])
    expect(await slackAlertMessageRepository.reviveForWorkspace(ORG_A, 'T1')).toBe(1)
    expect(await slackAlertMessageRepository.claimOutOfSync()).toHaveLength(1)
    expect(
      await slackAlertMessageRepository.findByChannelMessage('C1', '1700000000.000100')
    ).toMatchObject({ id: message.id })
  })
})
