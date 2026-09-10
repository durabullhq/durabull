import { describe, expect, it } from 'bun:test'
import {
  alertEventMutationOutputSchema,
  alertRuleMutationOutputSchema,
  jobMutationOutputSchema,
  queuePauseOutputSchema,
} from '@durabull/mcp'

import {
  createAcknowledgeAlertEventHandler,
  createUnacknowledgeAlertEventHandler,
} from './alert-event-handlers'
import { createSnoozeAlertRuleHandler, createUnsnoozeAlertRuleHandler } from './alert-rule-handlers'
import { createPromoteJobHandler, createRetryJobHandler } from './job-mutation-handlers'
import { createPauseQueueHandler, createResumeQueueHandler } from './queue-mutation-handlers'

const servicePrincipal = {
  type: 'service_account' as const,
  principalId: 'principal-1',
  organizationId: 'org-1',
}

const userPrincipal = {
  type: 'delegated_user' as const,
  principalId: 'user-1',
  userId: 'user-1',
}

const connection = {
  id: 'conn-1',
  organizationId: 'org-1',
  name: 'Primary',
  environment: 'production',
  url: 'redis://localhost:6379',
  prefix: 'bull',
  allowSelfSignedCerts: false,
}

const requireConnectionForPrincipal = async () => connection

function fakeJob(state: string) {
  const calls: string[] = []
  let current = state
  const job = {
    id: 'job-1',
    calls,
    async getState() {
      return current
    },
    async retry() {
      calls.push('retry')
      current = 'waiting'
    },
    async promote() {
      calls.push('promote')
      current = 'waiting'
    },
  }
  return job
}

function fakeQueue(job: ReturnType<typeof fakeJob> | null) {
  return {
    async getJob() {
      return job
    },
  } as never
}

describe('retry_job / promote_job', () => {
  it('retries a failed job and reports the new state', async () => {
    const job = fakeJob('failed')
    const retryJob = createRetryJobHandler({
      requireConnectionForPrincipal,
      getQueueForConnection: async () => fakeQueue(job),
    })

    const result = await retryJob({
      principal: servicePrincipal,
      connectionId: 'conn-1',
      queueName: 'email',
      jobId: 'job-1',
    })

    expect(job.calls).toEqual(['retry'])
    expect(result).toEqual({
      connectionId: 'conn-1',
      queueName: 'email',
      jobId: 'job-1',
      previousState: 'failed',
      state: 'waiting',
    })
    expect(jobMutationOutputSchema.safeParse(result).success).toBe(true)
  })

  it('refuses to retry a job that is not failed', async () => {
    const job = fakeJob('active')
    const retryJob = createRetryJobHandler({
      requireConnectionForPrincipal,
      getQueueForConnection: async () => fakeQueue(job),
    })

    await expect(
      retryJob({
        principal: servicePrincipal,
        connectionId: 'conn-1',
        queueName: 'q',
        jobId: 'job-1',
      })
    ).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('is active') })
    expect(job.calls).toEqual([])
  })

  it('promotes only delayed jobs', async () => {
    const delayed = fakeJob('delayed')
    const promoteJob = createPromoteJobHandler({
      requireConnectionForPrincipal,
      getQueueForConnection: async () => fakeQueue(delayed),
    })
    const result = await promoteJob({
      principal: servicePrincipal,
      connectionId: 'conn-1',
      queueName: 'q',
      jobId: 'job-1',
    })
    expect(delayed.calls).toEqual(['promote'])
    expect(result.previousState).toBe('delayed')

    const waiting = fakeJob('waiting')
    const promoteWaiting = createPromoteJobHandler({
      requireConnectionForPrincipal,
      getQueueForConnection: async () => fakeQueue(waiting),
    })
    await expect(
      promoteWaiting({
        principal: servicePrincipal,
        connectionId: 'conn-1',
        queueName: 'q',
        jobId: 'job-1',
      })
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('returns not_found for missing jobs', async () => {
    const retryJob = createRetryJobHandler({
      requireConnectionForPrincipal,
      getQueueForConnection: async () => fakeQueue(null),
    })
    await expect(
      retryJob({
        principal: servicePrincipal,
        connectionId: 'conn-1',
        queueName: 'q',
        jobId: 'nope',
      })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('pause_queue / resume_queue', () => {
  function pausableQueue(initiallyPaused: boolean) {
    let paused = initiallyPaused
    const calls: string[] = []
    return {
      calls,
      queue: {
        async isPaused() {
          return paused
        },
        async pause() {
          calls.push('pause')
          paused = true
        },
        async resume() {
          calls.push('resume')
          paused = false
        },
      } as never,
    }
  }

  it('pauses an active queue and is a no-op on a paused one', async () => {
    const active = pausableQueue(false)
    const pause = createPauseQueueHandler({
      requireConnectionForPrincipal,
      getQueueForConnection: async () => active.queue,
      findQueue: async () => ({ name: 'email' }) as never,
    })
    const first = await pause({
      principal: servicePrincipal,
      connectionId: 'conn-1',
      queueName: 'email',
    })
    expect(first).toEqual({
      connectionId: 'conn-1',
      queueName: 'email',
      isPaused: true,
      changed: true,
    })
    expect(queuePauseOutputSchema.safeParse(first).success).toBe(true)

    const second = await pause({
      principal: servicePrincipal,
      connectionId: 'conn-1',
      queueName: 'email',
    })
    expect(second.changed).toBe(false)
    expect(active.calls).toEqual(['pause'])
  })

  it('resumes a paused queue', async () => {
    const paused = pausableQueue(true)
    const resume = createResumeQueueHandler({
      requireConnectionForPrincipal,
      getQueueForConnection: async () => paused.queue,
      findQueue: async () => ({ name: 'email' }) as never,
    })
    const result = await resume({
      principal: servicePrincipal,
      connectionId: 'conn-1',
      queueName: 'email',
    })
    expect(result).toEqual({
      connectionId: 'conn-1',
      queueName: 'email',
      isPaused: false,
      changed: true,
    })
    expect(paused.calls).toEqual(['resume'])
  })

  it('refuses queues that are not in the discovery index', async () => {
    const pause = createPauseQueueHandler({
      requireConnectionForPrincipal,
      getQueueForConnection: async () => {
        throw new Error('should not open a queue handle')
      },
      findQueue: async () => null,
    })
    await expect(
      pause({ principal: servicePrincipal, connectionId: 'conn-1', queueName: 'ghost' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('acknowledge_alert_event / unacknowledge_alert_event', () => {
  const firingEvent = {
    id: 'event-1',
    alertRuleId: 'rule-1',
    organizationId: 'org-1',
    connectionId: 'conn-1',
    queueName: 'email',
    type: 'job_failed',
    status: 'firing',
    summary: 'Job failed',
    context: { jobId: 'job-1' },
    firedAt: new Date('2026-09-01T00:00:00.000Z'),
    resolvedAt: null,
    acknowledgedAt: null,
    acknowledgedBy: null,
  }

  function deps(overrides: Partial<Parameters<typeof createAcknowledgeAlertEventHandler>[0]> = {}) {
    return {
      requireConnectionForPrincipal,
      findEvent: async () => firingEvent as never,
      findEvents: async () => [] as never,
      countEvents: async () => 0,
      acknowledge: async (_id: string, _org: string, userId: string) =>
        ({
          ...firingEvent,
          acknowledgedAt: new Date('2026-09-02T00:00:00.000Z'),
          acknowledgedBy: userId,
        }) as never,
      unacknowledge: async () => ({ ...firingEvent, acknowledgedAt: null }) as never,
      listDeliveries: async () => [] as never,
      findRules: async () => [] as never,
      ...overrides,
    }
  }

  it('acknowledges on behalf of a delegated user', async () => {
    let ackedBy = ''
    const acknowledge = createAcknowledgeAlertEventHandler(
      deps({
        acknowledge: async (_id, _org, userId) => {
          ackedBy = userId
          return { ...firingEvent, acknowledgedAt: new Date('2026-09-02T00:00:00.000Z') } as never
        },
      })
    )
    const result = await acknowledge({
      principal: userPrincipal,
      connectionId: 'conn-1',
      eventId: 'event-1',
    })
    expect(ackedBy).toBe('user-1')
    expect(result.event.acknowledgedAt).toBe('2026-09-02T00:00:00.000Z')
    expect(alertEventMutationOutputSchema.safeParse(result).success).toBe(true)
  })

  it('rejects service accounts with an actionable validation error', async () => {
    const acknowledge = createAcknowledgeAlertEventHandler(deps())
    await expect(
      acknowledge({ principal: servicePrincipal, connectionId: 'conn-1', eventId: 'event-1' })
    ).rejects.toMatchObject({
      code: 'validation_error',
      message: expect.stringContaining('service accounts'),
    })
  })

  it('reports conflicts for already acknowledged or non-firing events', async () => {
    const alreadyAcked = createAcknowledgeAlertEventHandler(
      deps({ findEvent: async () => ({ ...firingEvent, acknowledgedAt: new Date() }) as never })
    )
    await expect(
      alreadyAcked({ principal: userPrincipal, connectionId: 'conn-1', eventId: 'event-1' })
    ).rejects.toMatchObject({ code: 'conflict' })

    const resolved = createAcknowledgeAlertEventHandler(
      deps({ findEvent: async () => ({ ...firingEvent, status: 'resolved' }) as never })
    )
    await expect(
      resolved({ principal: userPrincipal, connectionId: 'conn-1', eventId: 'event-1' })
    ).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('resolved') })
  })

  it('hides events from other connections', async () => {
    const acknowledge = createAcknowledgeAlertEventHandler(
      deps({ findEvent: async () => ({ ...firingEvent, connectionId: 'conn-other' }) as never })
    )
    await expect(
      acknowledge({ principal: userPrincipal, connectionId: 'conn-1', eventId: 'event-1' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('unacknowledges an acknowledged firing event', async () => {
    const unacknowledge = createUnacknowledgeAlertEventHandler(
      deps({ findEvent: async () => ({ ...firingEvent, acknowledgedAt: new Date() }) as never })
    )
    const result = await unacknowledge({
      principal: servicePrincipal,
      connectionId: 'conn-1',
      eventId: 'event-1',
    })
    expect(result.event.acknowledgedAt).toBeNull()

    const notAcked = createUnacknowledgeAlertEventHandler(deps())
    await expect(
      notAcked({ principal: servicePrincipal, connectionId: 'conn-1', eventId: 'event-1' })
    ).rejects.toMatchObject({ code: 'conflict' })
  })
})

describe('snooze_alert_rule / unsnooze_alert_rule', () => {
  const rule = {
    id: 'rule-1',
    organizationId: 'org-1',
    connectionId: 'conn-1',
    name: 'Failures',
    type: 'failure_threshold',
    config: { count: 5, windowMinutes: 10 },
    enabled: true,
    notificationChannels: [
      { type: 'email', target: 'ops@example.com' },
      { type: 'webhook', url: 'https://hooks.example.com/x', secret: 'shh-very-secret' },
    ],
    cooldownMinutes: 30,
    mutedUntil: null,
    queueName: null,
    queueFilterMode: null,
    filterQueueNames: [],
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  }

  function deps(overrides: Partial<Parameters<typeof createSnoozeAlertRuleHandler>[0]> = {}) {
    return {
      requireConnectionForPrincipal,
      findRules: async () => [rule] as never,
      findRule: async () => rule as never,
      setMutedUntil: async (_id: string, _org: string, mutedUntil: Date | null) =>
        ({ ...rule, mutedUntil }) as never,
      countEvents: async () => 2,
      findEvents: async () => [] as never,
      ...overrides,
    }
  }

  it('snoozes for the requested minutes and strips channel secrets', async () => {
    const snooze = createSnoozeAlertRuleHandler(deps())
    const before = Date.now()
    const result = await snooze({
      principal: servicePrincipal,
      connectionId: 'conn-1',
      ruleId: 'rule-1',
      minutes: 90,
    })

    expect(result.rule.state).toBe('snoozed')
    const mutedUntil = Date.parse(result.rule.mutedUntil ?? '')
    expect(mutedUntil - before).toBeGreaterThanOrEqual(90 * 60_000 - 1_000)
    expect(mutedUntil - before).toBeLessThanOrEqual(90 * 60_000 + 5_000)
    expect(result.rule.openEventCount).toBe(2)
    expect(result.rule.notificationChannels).toEqual([
      { type: 'email', target: 'ops@example.com' },
      { type: 'webhook', url: 'https://hooks.example.com/x' },
    ])
    expect(alertRuleMutationOutputSchema.safeParse(result).success).toBe(true)
  })

  it('validates the snooze window', async () => {
    const snooze = createSnoozeAlertRuleHandler(deps())
    await expect(
      snooze({ principal: servicePrincipal, connectionId: 'conn-1', ruleId: 'rule-1', minutes: 0 })
    ).rejects.toMatchObject({ code: 'validation_error' })
    await expect(
      snooze({
        principal: servicePrincipal,
        connectionId: 'conn-1',
        ruleId: 'rule-1',
        minutes: 20_000,
      })
    ).rejects.toMatchObject({ code: 'validation_error' })
  })

  it('hides rules from other connections', async () => {
    const snooze = createSnoozeAlertRuleHandler(
      deps({ findRule: async () => ({ ...rule, connectionId: 'conn-other' }) as never })
    )
    await expect(
      snooze({ principal: servicePrincipal, connectionId: 'conn-1', ruleId: 'rule-1', minutes: 5 })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('unsnoozes back to active', async () => {
    const unsnooze = createUnsnoozeAlertRuleHandler(
      deps({
        findRule: async () => ({ ...rule, mutedUntil: new Date(Date.now() + 60_000) }) as never,
      })
    )
    const result = await unsnooze({
      principal: servicePrincipal,
      connectionId: 'conn-1',
      ruleId: 'rule-1',
    })
    expect(result.rule.state).toBe('active')
    expect(result.rule.mutedUntil).toBeNull()
  })
})
