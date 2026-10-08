import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type AlertDelivery,
  type AlertEvent,
  alertDeliveryRepository,
  alertEventRepository,
  alertRuleRepository,
  closeDb,
  getDb,
  type LinearIntegration,
  type LinearJobIssue,
  linearIntegrationRepository,
  linearIssueResolutionRepository,
  linearJobIssueRepository,
  organization,
  redisConnectionRepository,
} from '@durabull/dal'
import { env } from '@durabull/env'
import * as linearClientModule from './linear-client'
import * as linearOauthModule from './linear-oauth'

// `mock.module` is process-global, so restore the real linear client after each
// test to avoid leaking mocks into other test files.
const realLinearClientModule = { ...linearClientModule }

const mutableEnv = env as { APP_BASE_URL?: string }
const originalAppBaseUrl = mutableEnv.APP_BASE_URL

function createEvent(overrides: Partial<AlertEvent> = {}): AlertEvent {
  const now = new Date('2026-07-02T10:00:00.000Z')

  return {
    id: '11111111-1111-4111-8111-111111111111',
    createdAt: now,
    updatedAt: now,
    alertRuleId: '22222222-2222-4222-8222-222222222222',
    organizationId: 'org-1',
    connectionId: '33333333-3333-4333-8333-333333333333',
    queueName: 'email-send',
    type: 'job_failed',
    status: 'resolved',
    summary: 'Job job-1 failed in email-send',
    context: { jobId: 'job-1' },
    dedupeKey: null,
    firedAt: new Date('2026-07-02T09:00:00.000Z'),
    resolvedAt: now,
    notificationSentAt: null,
    acknowledgedAt: null,
    acknowledgedBy: null,
    linearResolutionAttempts: 0,
    linearResolutionSyncPending: true,
    linearResolutionSyncClaimToken: null,
    linearResolutionSyncClaimedAt: null,
    linearResolutionRetryAt: null,
    linearResolutionReason: 'manual',
    linearResolutionFailedAt: null,
    linearResolutionLastError: null,
    ...overrides,
  }
}

async function loadResolutionModule() {
  return import('./alert-resolution')
}

function createDelivery(overrides: Partial<AlertDelivery> = {}): AlertDelivery {
  const event = createEvent()
  return {
    id: '44444444-4444-4444-8444-444444444444',
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    alertEventId: event.id,
    organizationId: event.organizationId,
    channelType: 'linear',
    target: 'org-default',
    status: 'pending',
    attemptCount: 0,
    nextRetryAt: null,
    claimedAt: null,
    lastError: null,
    providerMetadata: {},
    externalId: null,
    externalIdentifier: null,
    externalUrl: null,
    ...overrides,
  }
}

describe('alert resolution', () => {
  beforeEach(() => {
    spyOn(alertDeliveryRepository, 'claimDueForEvent').mockResolvedValue([])
  })

  afterEach(() => {
    mock.restore()
    mock.module('./linear-client', () => realLinearClientModule)
    mutableEnv.APP_BASE_URL = originalAppBaseUrl
  })

  it('builds an auto-resolve comment with job context and a Durabull link', async () => {
    mutableEnv.APP_BASE_URL = 'https://app.durabull.io'
    const { __alertResolutionTestUtils } = await loadResolutionModule()

    const comment = __alertResolutionTestUtils.buildResolutionComment({
      event: createEvent(),
      reason: { kind: 'auto_job_completed' },
      connectionName: 'Primary Redis',
      organizationSlug: 'acme',
    })

    expect(comment).toContain('Incident resolved in Durabull')
    expect(comment).toContain('auto-resolved this incident because job')
    expect(comment).toContain('job\\-1')
    expect(comment).toContain('Primary Redis')
    expect(comment).toContain('[Open in Durabull](')
  })

  it('builds a manual-resolve comment for operator action', async () => {
    mutableEnv.APP_BASE_URL = 'https://app.durabull.io'
    const { __alertResolutionTestUtils } = await loadResolutionModule()

    const comment = __alertResolutionTestUtils.buildResolutionComment({
      event: createEvent({ context: {} }),
      reason: { kind: 'manual' },
      connectionName: 'Primary Redis',
      organizationSlug: 'acme',
    })

    expect(comment).toContain('marked resolved by an operator in Durabull')
  })

  it('moves the issue to the lowest-position completed state and comments', async () => {
    const updateLinearIssueStateMock = mock(
      async (_accessToken: string, _issueId: string, _stateId: string) => {}
    )
    const createLinearCommentMock = mock(
      async (_accessToken: string, _issueId: string, _body: string) => {}
    )
    mock.module('./linear-client', () => ({
      ...realLinearClientModule,
      fetchLinearIssueStatus: mock(async () => ({
        id: 'issue-1',
        identifier: 'ENG-42',
        state: { id: 'state-started', name: 'In Progress', type: 'started' },
        teamStates: [
          { id: 'state-done-2', name: 'Shipped', type: 'completed', position: 5 },
          { id: 'state-done-1', name: 'Done', type: 'completed', position: 4 },
          { id: 'state-todo', name: 'Todo', type: 'unstarted', position: 1 },
        ],
      })),
      updateLinearIssueState: updateLinearIssueStateMock,
      createLinearComment: createLinearCommentMock,
    }))
    mutableEnv.APP_BASE_URL = 'https://app.durabull.io'

    const { __alertResolutionTestUtils } = await loadResolutionModule()
    await __alertResolutionTestUtils.completeLinearIssue({
      accessToken: 'token',
      issueId: 'issue-1',
      event: createEvent(),
      reason: { kind: 'manual' },
      connectionName: 'Primary Redis',
      organizationSlug: 'acme',
    })

    expect(updateLinearIssueStateMock).toHaveBeenCalledTimes(1)
    expect(updateLinearIssueStateMock.mock.calls[0]?.[2]).toBe('state-done-1')
    expect(createLinearCommentMock).toHaveBeenCalledTimes(1)
  })

  it('leaves issues alone when they are already completed or canceled', async () => {
    const updateLinearIssueStateMock = mock(async () => {})
    const createLinearCommentMock = mock(async () => {})
    mock.module('./linear-client', () => ({
      ...realLinearClientModule,
      fetchLinearIssueStatus: mock(async () => ({
        id: 'issue-1',
        identifier: 'ENG-42',
        state: { id: 'state-done', name: 'Done', type: 'completed' },
        teamStates: [{ id: 'state-done', name: 'Done', type: 'completed', position: 4 }],
      })),
      updateLinearIssueState: updateLinearIssueStateMock,
      createLinearComment: createLinearCommentMock,
    }))
    mutableEnv.APP_BASE_URL = 'https://app.durabull.io'

    const { __alertResolutionTestUtils } = await loadResolutionModule()
    await __alertResolutionTestUtils.completeLinearIssue({
      accessToken: 'token',
      issueId: 'issue-1',
      event: createEvent(),
      reason: { kind: 'manual' },
      connectionName: 'Primary Redis',
      organizationSlug: 'acme',
    })

    expect(updateLinearIssueStateMock).not.toHaveBeenCalled()
    expect(createLinearCommentMock).not.toHaveBeenCalled()
  })

  it('keeps synchronization retryable when the Linear team has no completed state', async () => {
    const updateState = mock(async () => {})
    mock.module('./linear-client', () => ({
      ...realLinearClientModule,
      fetchLinearIssueStatus: mock(async () => ({
        id: 'issue-1',
        identifier: 'ENG-42',
        state: { id: 'started', name: 'In Progress', type: 'started' },
        teamStates: [{ id: 'started', name: 'In Progress', type: 'started', position: 1 }],
      })),
      updateLinearIssueState: updateState,
    }))

    const { __alertResolutionTestUtils } = await loadResolutionModule()
    await expect(
      __alertResolutionTestUtils.completeLinearIssue({
        accessToken: 'token',
        issueId: 'issue-1',
        event: createEvent(),
        reason: { kind: 'manual' },
        connectionName: 'Primary Redis',
        organizationSlug: 'acme',
      })
    ).rejects.toThrow('no completed workflow state')
    expect(updateState).not.toHaveBeenCalled()
  })

  it('discovers Linear issues delivered through saved destinations', async () => {
    spyOn(linearJobIssueRepository, 'findByEvent').mockResolvedValue([])
    spyOn(alertDeliveryRepository, 'listByEvent').mockResolvedValue([
      createDelivery({
        channelType: 'destination',
        status: 'delivered',
        externalId: 'issue-1',
        providerMetadata: { resolvedType: 'linear' },
      }),
      createDelivery({
        channelType: 'destination',
        status: 'delivered',
        externalId: 'email-1',
        providerMetadata: { resolvedType: 'email' },
      }),
    ])

    const { __alertResolutionTestUtils } = await loadResolutionModule()
    expect(await __alertResolutionTestUtils.collectLinearIssueRefs(createEvent())).toEqual([
      { issueId: 'issue-1' },
    ])
  })

  it('cancels reclaimed stale notifications before clearing the resolution outbox', async () => {
    const event = createEvent()
    const claimedAt = new Date()
    spyOn(alertEventRepository, 'claimLinearResolutionSync').mockResolvedValue(event)
    spyOn(alertDeliveryRepository, 'claimDueForEvent').mockResolvedValue([
      createDelivery({ id: 'stale-delivery', status: 'claimed', claimedAt }),
    ])
    const markFailed = spyOn(alertDeliveryRepository, 'markFailed').mockResolvedValue(true)
    spyOn(alertDeliveryRepository, 'listByEvent').mockResolvedValue([
      createDelivery({ id: 'stale-delivery', channelType: 'linear', status: 'failed' }),
    ])
    spyOn(linearJobIssueRepository, 'findByEvent').mockResolvedValue([])
    const clearPending = spyOn(
      alertEventRepository,
      'clearLinearResolutionSyncPending'
    ).mockResolvedValue()

    const { syncLinearIssuesForResolvedEvents } = await loadResolutionModule()
    expect(await syncLinearIssuesForResolvedEvents([event])).toEqual({ failedEventIds: [] })
    expect(markFailed).toHaveBeenCalledWith('stale-delivery', {
      error: 'Alert incident resolved before delivery.',
      retryable: false,
      expectedClaimedAt: claimedAt,
    })
    expect(clearPending).toHaveBeenCalledTimes(1)
  })

  it('preserves the firing-peer guard when a job delivery completes during collection', async () => {
    let deliveryCompleted = false
    spyOn(alertDeliveryRepository, 'listByEvent').mockImplementation(async () => {
      deliveryCompleted = true
      return [createDelivery({ channelType: 'linear', status: 'delivered', externalId: 'issue-1' })]
    })
    spyOn(linearJobIssueRepository, 'findByEvent').mockImplementation(async () =>
      deliveryCompleted ? [{ id: 'job-issue-1', linearIssueId: 'issue-1' } as LinearJobIssue] : []
    )

    const { __alertResolutionTestUtils } = await loadResolutionModule()
    expect(await __alertResolutionTestUtils.collectLinearIssueRefs(createEvent())).toEqual([
      { issueId: 'issue-1', linearJobIssueId: 'job-issue-1' },
    ])
  })

  for (const channelType of ['linear', 'destination'] as const) {
    it(`retains pending cleanup while a ${channelType} delivery is in flight`, async () => {
      const event = createEvent()
      spyOn(alertEventRepository, 'claimLinearResolutionSync').mockResolvedValue(event)
      spyOn(linearJobIssueRepository, 'findByEvent').mockResolvedValue([])
      spyOn(alertDeliveryRepository, 'listByEvent').mockResolvedValue([
        createDelivery({ channelType, status: 'claimed', claimedAt: new Date() }),
      ])
      const clearPending = spyOn(
        alertEventRepository,
        'clearLinearResolutionSyncPending'
      ).mockResolvedValue()
      const releaseClaim = spyOn(
        alertEventRepository,
        'releaseLinearResolutionSyncClaims'
      ).mockResolvedValue()
      spyOn(console, 'error').mockImplementation(() => {})
      const before = Date.now()

      const { syncLinearIssuesForResolvedEvents } = await loadResolutionModule()
      const result = await syncLinearIssuesForResolvedEvents([event])

      expect(result.failedEventIds).toEqual([event.id])
      expect(clearPending).not.toHaveBeenCalled()
      expect(releaseClaim).toHaveBeenCalledTimes(1)
      expect(releaseClaim.mock.calls[0]?.[2]?.getTime()).toBeGreaterThanOrEqual(before + 30_000)
    })
  }

  it('records terminal cleanup when the Linear integration was disconnected', async () => {
    const event = createEvent({ linearResolutionAttempts: 3 })
    spyOn(alertEventRepository, 'claimLinearResolutionSync').mockResolvedValue(event)
    spyOn(linearJobIssueRepository, 'findByEvent').mockResolvedValue([])
    spyOn(alertDeliveryRepository, 'listByEvent').mockResolvedValue([
      createDelivery({ channelType: 'linear', status: 'delivered', externalId: 'issue-1' }),
    ])
    spyOn(linearIntegrationRepository, 'findByOrganization').mockResolvedValue(null)
    const clearPending = spyOn(
      alertEventRepository,
      'clearLinearResolutionSyncPending'
    ).mockResolvedValue()
    const releaseClaim = spyOn(
      alertEventRepository,
      'releaseLinearResolutionSyncClaims'
    ).mockResolvedValue()
    spyOn(console, 'error').mockImplementation(() => {})
    const abandon = spyOn(alertEventRepository, 'abandonLinearResolutionSync').mockResolvedValue()

    const { syncLinearIssuesForResolvedEvents } = await loadResolutionModule()
    expect(await syncLinearIssuesForResolvedEvents([event])).toEqual({
      failedEventIds: [],
    })
    expect(clearPending).not.toHaveBeenCalled()
    expect(releaseClaim).not.toHaveBeenCalled()
    expect(abandon).toHaveBeenCalledWith(
      [event.id],
      expect.any(String),
      'Linear integration disconnected.'
    )
  })

  it('finishes a failed comment after the state update succeeds, using the persisted UUID', async () => {
    const commentId = '55555555-5555-4555-8555-555555555555'
    const status = spyOn(linearClientModule, 'fetchLinearIssueStatus')
      .mockResolvedValueOnce({
        id: 'issue-1',
        identifier: 'ENG-42',
        state: { id: 'started', name: 'In Progress', type: 'started' },
        teamStates: [{ id: 'done', name: 'Done', type: 'completed', position: 1 }],
      })
      .mockResolvedValueOnce({
        id: 'issue-1',
        identifier: 'ENG-42',
        state: { id: 'done', name: 'Done', type: 'completed' },
        teamStates: [],
      })
    const update = spyOn(linearClientModule, 'updateLinearIssueState').mockResolvedValue()
    const comment = spyOn(linearClientModule, 'createLinearComment')
      .mockRejectedValueOnce(new Error('Comment response lost'))
      .mockResolvedValueOnce()
    spyOn(linearIssueResolutionRepository, 'findCommentId')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(commentId)
    const prepare = spyOn(linearIssueResolutionRepository, 'prepareComment').mockResolvedValue(
      commentId
    )
    const { __alertResolutionTestUtils } = await loadResolutionModule()
    const input = {
      accessToken: 'token',
      issueId: 'issue-1',
      issueClaimToken: 'claim-1',
      event: createEvent(),
      reason: { kind: 'manual' as const },
      connectionName: 'Redis',
      organizationSlug: null,
    }
    await expect(__alertResolutionTestUtils.completeLinearIssue(input)).rejects.toThrow(
      'Comment response lost'
    )
    await __alertResolutionTestUtils.completeLinearIssue(input)
    expect(status).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(1)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(comment.mock.calls.map((call) => call[3])).toEqual([commentId, commentId])
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0] ?? 0
    )
  })

  it('does not change external state after losing the resolution lease', async () => {
    spyOn(linearClientModule, 'fetchLinearIssueStatus').mockResolvedValue({
      id: 'issue-1',
      identifier: 'ENG-42',
      state: { id: 'started', name: 'In Progress', type: 'started' },
      teamStates: [{ id: 'done', name: 'Done', type: 'completed', position: 1 }],
    })
    spyOn(linearIssueResolutionRepository, 'findCommentId').mockResolvedValue(null)
    spyOn(linearIssueResolutionRepository, 'prepareComment').mockResolvedValue(null)
    const update = spyOn(linearClientModule, 'updateLinearIssueState').mockResolvedValue()
    const { __alertResolutionTestUtils } = await loadResolutionModule()
    await expect(
      __alertResolutionTestUtils.completeLinearIssue({
        accessToken: 'token',
        issueId: 'issue-1',
        issueClaimToken: 'stale',
        event: createEvent(),
        reason: { kind: 'manual' },
        connectionName: 'Redis',
        organizationSlug: null,
      })
    ).rejects.toThrow('Lost the Linear issue lease')
    expect(update).not.toHaveBeenCalled()
  })

  it('stores exhausted cleanup without keeping rule deletion blocked', async () => {
    const event = createEvent({ linearResolutionAttempts: 99 })
    spyOn(alertEventRepository, 'claimLinearResolutionSync').mockResolvedValue(event)
    spyOn(alertDeliveryRepository, 'claimDueForEvent').mockRejectedValue(
      new Error('Provider permanently busy')
    )
    const abandon = spyOn(alertEventRepository, 'abandonLinearResolutionSync').mockResolvedValue()
    const retry = spyOn(
      alertEventRepository,
      'releaseLinearResolutionSyncClaims'
    ).mockResolvedValue()
    spyOn(console, 'error').mockImplementation(() => {})
    const { syncLinearIssuesForResolvedEvents } = await loadResolutionModule()
    expect(await syncLinearIssuesForResolvedEvents([event])).toEqual({ failedEventIds: [] })
    expect(abandon).toHaveBeenCalledWith(
      [event.id],
      expect.any(String),
      'Linear cleanup retry limit reached.'
    )
    expect(retry).not.toHaveBeenCalled()
  })

  it('honors provider rate limit reset instead of retrying early', async () => {
    const event = createEvent()
    const resetAt = new Date(Date.now() + 600_000)
    spyOn(alertEventRepository, 'claimLinearResolutionSync').mockResolvedValue(event)
    spyOn(alertDeliveryRepository, 'claimDueForEvent').mockRejectedValue(
      new linearClientModule.LinearApiError('Rate limited', {
        status: 429,
        retryable: true,
        rateLimitResetAt: resetAt,
      })
    )
    const retry = spyOn(
      alertEventRepository,
      'releaseLinearResolutionSyncClaims'
    ).mockResolvedValue()
    spyOn(console, 'error').mockImplementation(() => {})
    const { syncLinearIssuesForResolvedEvents } = await loadResolutionModule()
    expect(await syncLinearIssuesForResolvedEvents([event])).toEqual({ failedEventIds: [event.id] })
    expect(retry.mock.calls[0]?.[2]).toEqual(resetAt)
  })

  it('uses neutral wording when a historical resolution has no recorded reason', async () => {
    const { __alertResolutionTestUtils } = await loadResolutionModule()
    const comment = __alertResolutionTestUtils.buildResolutionComment({
      event: createEvent(),
      reason: { kind: 'legacy' },
      connectionName: 'Redis',
      organizationSlug: null,
    })
    expect(comment).toContain('original resolution reason was not recorded')
    expect(comment).not.toContain('disabled, edited, or deleted')
    expect(comment).not.toContain('by an operator')
  })

  it('releases the deletion lease when an in-flight delivery prevents final deletion', async () => {
    spyOn(alertEventRepository, 'findPendingLinearResolutionSyncForRule').mockResolvedValue([])
    spyOn(alertRuleRepository, 'deleteIfDeletionRequested').mockResolvedValue(false)
    const release = spyOn(alertRuleRepository, 'releaseDeletionClaim').mockResolvedValue()
    const before = Date.now()

    const { finalizePendingAlertRuleDeletion } = await loadResolutionModule()
    expect(await finalizePendingAlertRuleDeletion({ id: 'rule-1' }, 'claim-1')).toBe(false)
    expect(release).toHaveBeenCalledTimes(1)
    expect(release.mock.calls[0]?.slice(0, 2)).toEqual(['rule-1', 'claim-1'])
    expect(release.mock.calls[0]?.[2]?.getTime()).toBeGreaterThanOrEqual(before + 30_000)
  })
  it.each([
    false,
    true,
    'mixed',
  ])('attempts all linked issues before handling a partial provider failure (retryable=%s)', async (retryable) => {
    const hasRetryableFailure = retryable !== false
    const tempDir = await mkdtemp(join(tmpdir(), 'durabull-resolution-partial-'))
    const originalDir = process.env.DURABULL_PGLITE_DIR
    const originalDatabaseUrl = process.env.DATABASE_URL
    const databaseEnv = env as { DATABASE_URL?: string }
    const originalEnvDatabaseUrl = databaseEnv.DATABASE_URL
    await closeDb()
    process.env.DURABULL_PGLITE_DIR = tempDir
    delete process.env.DATABASE_URL
    databaseEnv.DATABASE_URL = undefined
    try {
      const event = createEvent()
      const db = await getDb()
      await db.insert(organization).values({
        id: event.organizationId,
        name: 'Partial cleanup',
        slug: 'partial-cleanup',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      spyOn(alertEventRepository, 'claimLinearResolutionSync').mockResolvedValue(event)
      spyOn(linearJobIssueRepository, 'findByEvent').mockResolvedValue([])
      spyOn(alertDeliveryRepository, 'listByEvent').mockResolvedValue([
        createDelivery({ status: 'delivered', externalId: 'missing-issue' }),
        ...(retryable === 'mixed'
          ? [
              createDelivery({
                id: 'delivery-retry',
                status: 'delivered',
                externalId: 'retry-issue',
              }),
            ]
          : []),
        createDelivery({ id: 'delivery-2', status: 'delivered', externalId: 'valid-issue' }),
      ])
      spyOn(linearIntegrationRepository, 'findByOrganization').mockResolvedValue({
        organizationId: event.organizationId,
      } as LinearIntegration)
      spyOn(linearOauthModule, 'getValidLinearAccessToken').mockResolvedValue('token')
      spyOn(redisConnectionRepository, 'findByIdUnsafe').mockResolvedValue(null)
      spyOn(linearIssueResolutionRepository, 'claim').mockResolvedValue('claimed')
      spyOn(linearIssueResolutionRepository, 'release').mockResolvedValue()
      spyOn(linearIssueResolutionRepository, 'findCommentId').mockResolvedValue(null)
      spyOn(linearIssueResolutionRepository, 'prepareComment').mockResolvedValue(
        '55555555-5555-4555-8555-555555555555'
      )
      const completed = spyOn(linearIssueResolutionRepository, 'markCompleted').mockResolvedValue(
        true
      )
      spyOn(linearClientModule, 'fetchLinearIssueStatus').mockImplementation(
        async (_token, issueId) => {
          if (issueId === 'missing-issue') {
            throw new linearClientModule.LinearApiError('Provider failure', {
              status: retryable === true ? 503 : 404,
              retryable: retryable === true,
            })
          }
          if (issueId === 'retry-issue') {
            throw new linearClientModule.LinearApiError('Transient provider failure', {
              status: 503,
              retryable: true,
            })
          }
          return {
            id: issueId,
            identifier: 'ENG-42',
            state: { id: 'started', name: 'In Progress', type: 'started' },
            teamStates: [{ id: 'done', name: 'Done', type: 'completed', position: 1 }],
          }
        }
      )
      const update = spyOn(linearClientModule, 'updateLinearIssueState').mockResolvedValue()
      const comment = spyOn(linearClientModule, 'createLinearComment').mockResolvedValue()
      const abandon = spyOn(alertEventRepository, 'abandonLinearResolutionSync').mockResolvedValue()
      const retry = spyOn(
        alertEventRepository,
        'releaseLinearResolutionSyncClaims'
      ).mockResolvedValue()
      const clear = spyOn(
        alertEventRepository,
        'clearLinearResolutionSyncPending'
      ).mockResolvedValue()
      spyOn(console, 'error').mockImplementation(() => {})
      const { syncLinearIssuesForResolvedEvents } = await loadResolutionModule()
      expect(await syncLinearIssuesForResolvedEvents([event])).toEqual({
        failedEventIds: hasRetryableFailure ? [event.id] : [],
      })
      expect(update).toHaveBeenCalledWith('token', 'valid-issue', 'done')
      expect(comment.mock.calls[0]?.[1]).toBe('valid-issue')
      expect(completed.mock.calls[0]?.[0]).toBe('valid-issue')
      expect(clear).not.toHaveBeenCalled()
      if (hasRetryableFailure) {
        expect(retry).toHaveBeenCalledTimes(1)
        expect(abandon).not.toHaveBeenCalled()
      } else {
        expect(abandon).toHaveBeenCalledTimes(1)
        expect(retry).not.toHaveBeenCalled()
      }
    } finally {
      await closeDb()
      databaseEnv.DATABASE_URL = originalEnvDatabaseUrl
      if (originalDir) process.env.DURABULL_PGLITE_DIR = originalDir
      else delete process.env.DURABULL_PGLITE_DIR
      if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl
      else delete process.env.DATABASE_URL
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
