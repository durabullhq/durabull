import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import {
  type AlertDelivery,
  type AlertEvent,
  alertDeliveryRepository,
  alertEventRepository,
  alertRuleRepository,
  type LinearJobIssue,
  linearIntegrationRepository,
  linearJobIssueRepository,
} from '@durabull/dal'
import { env } from '@durabull/env'
import * as linearClientModule from './linear-client'

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
    linearResolutionAttempts: 0,
    ...overrides,
  } as AlertEvent
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

  it('retains linked incidents for retry if their Linear integration is unavailable', async () => {
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
    const before = Date.now()

    const { syncLinearIssuesForResolvedEvents } = await loadResolutionModule()
    expect(await syncLinearIssuesForResolvedEvents([event])).toEqual({
      failedEventIds: [event.id],
    })
    expect(clearPending).not.toHaveBeenCalled()
    expect(releaseClaim.mock.calls[0]?.[2]?.getTime()).toBeGreaterThanOrEqual(before + 240_000)
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
})
