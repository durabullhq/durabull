import { describe, expect, it, mock } from 'bun:test'

const findById = mock(async () => null as Awaited<ReturnType<typeof import('@durabull/dal').alertEventRepository.findById>>)
const resolve = mock(async () => null as Awaited<ReturnType<typeof import('@durabull/dal').alertEventRepository.resolve>>)

mock.module('@durabull/dal', () => ({
  alertEventRepository: { findById, resolve },
}))

const requireConnectionForPrincipal = mock(async () => ({
  id: 'conn-1',
  organizationId: 'org-1',
}))

mock.module('./shared', () => ({
  McpToolError: class McpToolError extends Error {
    readonly code: 'not_found' | 'validation_error' | 'internal_error'
    constructor(code: 'not_found' | 'validation_error' | 'internal_error', message: string) {
      super(message)
      this.code = code
    }
  },
  requireConnectionForPrincipal,
}))

const { resolveAlertEventHandler } = await import('./resolve-alert-event-handler')

const principal = {
  type: 'service_account' as const,
  principalId: 'principal-1',
  organizationId: 'org-1',
}

describe('resolveAlertEventHandler', () => {
  it('returns not_found when the event is missing or on another connection', async () => {
    findById.mockResolvedValueOnce(null)

    await expect(
      resolveAlertEventHandler({
        principal,
        connectionId: 'conn-1',
        eventId: 'event-1',
      })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('marks a matching alert event resolved', async () => {
    const firedAt = new Date('2026-01-01T00:00:00.000Z')
    const resolvedAt = new Date('2026-01-02T00:00:00.000Z')

    findById.mockResolvedValueOnce({
      id: 'event-1',
      connectionId: 'conn-1',
      organizationId: 'org-1',
      alertRuleId: 'rule-1',
      queueName: 'email',
      type: 'queue_depth',
      status: 'firing',
      summary: 'Queue depth exceeded',
      context: { jobId: 'job-1' },
      firedAt,
      resolvedAt: null,
    } as never)

    resolve.mockResolvedValueOnce({
      id: 'event-1',
      connectionId: 'conn-1',
      organizationId: 'org-1',
      alertRuleId: 'rule-1',
      queueName: 'email',
      type: 'queue_depth',
      status: 'resolved',
      summary: 'Queue depth exceeded',
      context: { jobId: 'job-1' },
      firedAt,
      resolvedAt,
    } as never)

    const result = await resolveAlertEventHandler({
      principal,
      connectionId: 'conn-1',
      eventId: 'event-1',
    })

    expect(result.connectionId).toBe('conn-1')
    expect(result.event.status).toBe('resolved')
    expect(result.event.resolvedAt).toBe(resolvedAt.toISOString())
    expect(resolve).toHaveBeenCalledWith('event-1', 'org-1')
  })
})
