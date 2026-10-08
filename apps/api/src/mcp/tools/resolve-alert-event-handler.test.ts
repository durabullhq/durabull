import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { alertEventRepository, redisConnectionRepository } from '@durabull/dal'
import { resolveAlertEventHandler } from './resolve-alert-event-handler'

const findById = mock(alertEventRepository.findById)
const resolve = mock(alertEventRepository.resolve)

const principal = {
  type: 'service_account' as const,
  principalId: 'principal-1',
  organizationId: 'org-1',
}

describe('resolveAlertEventHandler', () => {
  beforeEach(() => {
    findById.mockReset()
    resolve.mockReset()
    spyOn(alertEventRepository, 'findById').mockImplementation(findById)
    spyOn(alertEventRepository, 'resolve').mockImplementation(resolve)
    spyOn(redisConnectionRepository, 'findById').mockResolvedValue({
      id: 'conn-1',
      organizationId: 'org-1',
      name: 'Test connection',
      environment: null,
      url: 'redis://localhost:6379',
      prefix: 'bull',
      allowSelfSignedCerts: false,
      isDefault: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })
  })

  afterEach(() => mock.restore())

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
