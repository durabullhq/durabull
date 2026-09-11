import { describe, expect, it } from 'bun:test'

import { createExplainJobFailureHandler } from './explain-job-failure-handler'
import { McpToolError } from './shared'

const principal = {
  type: 'service_account' as const,
  principalId: 'principal-1',
  organizationId: 'org-1',
}

const connection = {
  id: 'conn-1',
  organizationId: 'org-1',
  url: 'redis://localhost:6379',
  prefix: 'bull',
  allowSelfSignedCerts: false,
}

const fullScopes = [
  'mcp:discover',
  'mcp:jobs:read',
  'mcp:logs:read',
  'mcp:failures:read',
  'mcp:diagnostics:read',
]

describe('explain_job_failure handler', () => {
  it('composes a high-confidence summary for failed jobs', async () => {
    const explainJobFailureHandler = createExplainJobFailureHandler({
      async requireConnectionForPrincipal() {
        return connection as never
      },
      async getQueue() {
        return {
          async getJob() {
            return {
              id: 'job-1',
              failedReason: 'SMTP connection refused',
              stacktrace: ['Error: SMTP connection refused\n    at send()'],
              attemptsMade: 2,
              opts: { attempts: 3 },
              processedOn: 100,
              finishedOn: 200,
              timestamp: 50,
              async getState() {
                return 'failed'
              },
            }
          },
          async getJobLogs() {
            return { logs: ['connecting to smtp'], count: 1 }
          },
        } as never
      },
      async findAlertEvents() {
        return [
          {
            id: 'event-1',
            alertRuleId: 'rule-1',
            queueName: 'email',
            type: 'job_failed',
            status: 'firing',
            summary: 'Job failed in email queue',
            firedAt: new Date('2026-05-27T00:00:00.000Z'),
            resolvedAt: null,
            context: { jobId: 'job-1', secret: 'hidden' },
          },
        ] as never
      },
      async countAlertEvents() {
        return 1
      },
    })

    const result = await explainJobFailureHandler({
      principal,
      connectionId: 'conn-1',
      queueName: 'email',
      jobId: 'job-1',
      grantedScopes: fullScopes,
    })

    expect(result.status).toBe('failed')
    expect(result.confidence).toBe('high')
    expect(result.topSignal.source).toBe('failed_reason')
    expect(result.relatedAlertEvents).toHaveLength(1)
    expect(result.relatedAlertEvents[0]?.context).toEqual({ jobId: 'job-1' })
    expect(result.summary).toContain('SMTP connection refused')
  })

  it('returns low confidence when the job is not failed', async () => {
    const explainJobFailureHandler = createExplainJobFailureHandler({
      async requireConnectionForPrincipal() {
        return connection as never
      },
      async getQueue() {
        return {
          async getJob() {
            return {
              id: 'job-1',
              failedReason: null,
              stacktrace: [],
              attemptsMade: 0,
              opts: { attempts: 1 },
              processedOn: null,
              finishedOn: null,
              timestamp: 1,
              async getState() {
                return 'completed'
              },
            }
          },
          async getJobLogs() {
            return { logs: [], count: 0 }
          },
        } as never
      },
      async findAlertEvents() {
        return []
      },
      async countAlertEvents() {
        return 0
      },
    })

    const result = await explainJobFailureHandler({
      principal,
      connectionId: 'conn-1',
      queueName: 'email',
      jobId: 'job-1',
      grantedScopes: fullScopes,
    })

    expect(result.confidence).toBe('low')
    expect(result.summary).toContain('not failed')
    expect(result.failedReason).toBeNull()
    expect(result.relatedAlertEvents).toHaveLength(0)
    expect(result.topSignal.source).toBe('none')
  })

  it('reads the tail of job logs when choosing a log-based failure signal', async () => {
    const logCalls: Array<{ start: number; end: number }> = []
    const explainJobFailureHandler = createExplainJobFailureHandler({
      async requireConnectionForPrincipal() {
        return connection as never
      },
      async getQueue() {
        return {
          async getJob() {
            return {
              id: 'job-1',
              failedReason: null,
              stacktrace: [],
              attemptsMade: 1,
              opts: { attempts: 1 },
              processedOn: 100,
              finishedOn: 200,
              timestamp: 50,
              async getState() {
                return 'failed'
              },
            }
          },
          async getJobLogs(_jobId: string, start: number, end: number) {
            logCalls.push({ start, end })
            if (start === 0 && end === 0) {
              return { logs: [], count: 10 }
            }
            return {
              logs: ['line-6', 'line-7', 'line-8', 'line-9', 'line-10'],
              count: 10,
            }
          },
        } as never
      },
      async findAlertEvents() {
        return []
      },
      async countAlertEvents() {
        return 0
      },
    })

    const result = await explainJobFailureHandler({
      principal,
      connectionId: 'conn-1',
      queueName: 'email',
      jobId: 'job-1',
      grantedScopes: fullScopes,
    })

    expect(logCalls).toEqual([
      { start: 0, end: 0 },
      { start: 5, end: 9 },
    ])
    expect(result.topSignal.source).toBe('logs')
    expect(result.topSignal.excerpt).toBe('line-10')
    expect(result.recentLogLines).toEqual(['line-6', 'line-7', 'line-8', 'line-9', 'line-10'])
  })

  it('throws not_found when the job is missing', async () => {
    const explainJobFailureHandler = createExplainJobFailureHandler({
      async requireConnectionForPrincipal() {
        return connection as never
      },
      async getQueue() {
        return {
          async getJob() {
            return null
          },
        } as never
      },
      async findAlertEvents() {
        return []
      },
      async countAlertEvents() {
        return 0
      },
    })

    await expect(
      explainJobFailureHandler({
        principal,
        connectionId: 'conn-1',
        queueName: 'email',
        jobId: 'missing',
        grantedScopes: fullScopes,
      })
    ).rejects.toBeInstanceOf(McpToolError)
  })

  it('degrades gracefully when logs and failures scopes are missing', async () => {
    let logCalls = 0
    let alertCalls = 0
    const explainJobFailureHandler = createExplainJobFailureHandler({
      async requireConnectionForPrincipal() {
        return connection as never
      },
      async getQueue() {
        return {
          async getJob() {
            return {
              id: 'job-1',
              failedReason: 'Timeout',
              stacktrace: ['Error: Timeout'],
              attemptsMade: 1,
              opts: { attempts: 1 },
              processedOn: 1,
              finishedOn: 2,
              timestamp: 0,
              async getState() {
                return 'failed'
              },
            }
          },
          async getJobLogs() {
            logCalls += 1
            return { logs: ['should not be read'], count: 1 }
          },
        } as never
      },
      async findAlertEvents() {
        alertCalls += 1
        return []
      },
      async countAlertEvents() {
        alertCalls += 1
        return 0
      },
    })

    const result = await explainJobFailureHandler({
      principal,
      connectionId: 'conn-1',
      queueName: 'email',
      jobId: 'job-1',
      grantedScopes: ['mcp:discover', 'mcp:jobs:read', 'mcp:diagnostics:read'],
    })

    expect(logCalls).toBe(0)
    expect(alertCalls).toBe(0)
    expect(result.topSignal).toEqual({ source: 'failed_reason', excerpt: 'Timeout' })
    expect(result.recentLogLines).toEqual([])
    expect(result.relatedAlertEvents).toEqual([])
    expect(result.sources).toEqual(['job.failedReason'])
    expect(result.skippedSources.map((entry) => entry.source)).toEqual([
      'job.stacktrace',
      'queue.getJobLogs',
      'alert_event',
    ])
    expect(result.skippedSources[0]?.reason).toBe('missing_scope:mcp:logs:read')
    expect(result.summary).toContain('not checked')
  })
})
