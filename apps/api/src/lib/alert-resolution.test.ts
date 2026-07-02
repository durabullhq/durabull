import { afterEach, describe, expect, it, mock } from 'bun:test'
import type { AlertEvent } from '@durabull/dal'
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
    ...overrides,
  } as AlertEvent
}

async function loadResolutionModule() {
  return import('./alert-resolution')
}

describe('alert resolution', () => {
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
})
