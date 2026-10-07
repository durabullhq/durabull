import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { mcpPolicyRepository } from '@durabull/dal'
import { Hono } from 'hono'

import {
  createMcpToolRateLimitMiddleware,
  resetMcpToolRateLimitStoreForTests,
  setMcpToolRateLimitBypassForTests,
} from './mcp-tool-rate-limit'

describe('createMcpToolRateLimitMiddleware', () => {
  beforeEach(() => {
    // Rate limiting must not need a database or inherit another suite's repository mocks.
    spyOn(mcpPolicyRepository, 'createAuditEvent').mockImplementation(async (input) => ({
      ...input,
      id: 'audit-test',
      createdAt: new Date(0),
      updatedAt: new Date(0),
      organizationId: input.organizationId ?? null,
      connectionId: input.connectionId ?? null,
      denialReason: input.denialReason ?? null,
      inputHash: input.inputHash ?? null,
      responseClass: input.responseClass ?? null,
      requiredScopes: input.requiredScopes.join(' '),
    }))
    resetMcpToolRateLimitStoreForTests()
    setMcpToolRateLimitBypassForTests(true)
  })

  afterEach(() => {
    mock.restore()
    resetMcpToolRateLimitStoreForTests()
    setMcpToolRateLimitBypassForTests(false)
  })

  it('returns JSON-RPC 429 when per-tool limit is exceeded', async () => {
    const app = new Hono()
    app.use('*', createMcpToolRateLimitMiddleware())
    app.post('/', (c) => c.json({ ok: true }))

    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_job_logs',
        arguments: { connectionId: 'conn-1' },
      },
    }

    const headers = {
      Authorization: 'Bearer test-token',
      'x-forwarded-for': '203.0.113.44',
    }

    let lastStatus = 200
    for (let i = 0; i < 31; i += 1) {
      const response = await app.request('/', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      lastStatus = response.status
    }

    expect(lastStatus).toBe(429)
    expect(mcpPolicyRepository.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ responseClass: 'rate_limited', toolName: 'get_job_logs' })
    )
  })
})
