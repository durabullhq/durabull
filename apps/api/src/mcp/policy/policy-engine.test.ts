import { describe, expect, it } from 'bun:test'

import type { McpSession } from '../auth/mcp-session-middleware'
import { evaluateMcpToolPolicy } from './policy-engine'
import type { McpPrincipal } from './types'

const READ_BUNDLE =
  'mcp:discover mcp:jobs:read mcp:logs:read mcp:failures:read mcp:diagnostics:read'

const baseSession: McpSession = {
  accessToken: 'token',
  refreshToken: 'refresh',
  accessTokenExpiresAt: new Date(),
  refreshTokenExpiresAt: new Date(),
  clientId: 'client-id',
  userId: 'user-1',
  scopes: READ_BUNDLE,
}

const delegatedPrincipal: McpPrincipal = {
  type: 'delegated_user',
  principalId: 'principal-1',
  userId: 'user-1',
  organizationId: null,
}

describe('evaluateMcpToolPolicy', () => {
  it('denies tools without explicit scope mapping', async () => {
    const decision = await evaluateMcpToolPolicy({
      correlationId: 'corr-1',
      principal: delegatedPrincipal,
      session: baseSession,
      call: {
        toolName: 'unmapped_future_tool',
        arguments: {},
        connectionId: null,
      },
    })

    expect(decision.granted).toBe(false)
    expect(decision.denialReason).toBe('policy_configuration_missing')
    expect(decision.requiredScopes).toEqual([])
    expect(decision.effectiveScopes).toEqual([])
  })

  it('reads required scopes from the tool catalog', async () => {
    const failuresDecision = await evaluateMcpToolPolicy({
      correlationId: 'corr-2',
      principal: delegatedPrincipal,
      session: baseSession,
      call: { toolName: 'get_failure_events', arguments: {}, connectionId: null },
    })
    expect(failuresDecision.requiredScopes).toEqual(['mcp:failures:read'])
    expect(failuresDecision.granted).toBe(true)

    const diagnosticsDecision = await evaluateMcpToolPolicy({
      correlationId: 'corr-3',
      principal: delegatedPrincipal,
      session: baseSession,
      call: { toolName: 'explain_job_failure', arguments: {}, connectionId: null },
    })
    // Only the hard requirements are enforced; logs/failures are optional enrichments.
    expect(diagnosticsDecision.requiredScopes).toEqual(['mcp:diagnostics:read', 'mcp:jobs:read'])
    expect(diagnosticsDecision.granted).toBe(true)
    expect(diagnosticsDecision.effectiveScopes).toEqual(READ_BUNDLE.split(' '))
  })

  it('still denies explain_job_failure without the diagnostics scope', async () => {
    const decision = await evaluateMcpToolPolicy({
      correlationId: 'corr-4',
      principal: delegatedPrincipal,
      session: { ...baseSession, scopes: 'mcp:discover mcp:jobs:read mcp:logs:read' },
      call: { toolName: 'explain_job_failure', arguments: {}, connectionId: null },
    })
    expect(decision.granted).toBe(false)
    expect(decision.denialReason).toBe('missing_scopes:mcp:diagnostics:read')
  })

  it('requires write scopes for write tools even when the full read bundle is granted', async () => {
    for (const [toolName, scope] of [
      ['resolve_alert_event', 'mcp:failures:write'],
      ['acknowledge_alert_event', 'mcp:failures:write'],
      ['snooze_alert_rule', 'mcp:failures:write'],
      ['retry_job', 'mcp:jobs:retry'],
      ['promote_job', 'mcp:jobs:promote'],
      ['pause_queue', 'mcp:queues:pause'],
      ['resume_queue', 'mcp:queues:pause'],
    ] as const) {
      const denied = await evaluateMcpToolPolicy({
        correlationId: 'corr-5',
        principal: delegatedPrincipal,
        session: baseSession,
        call: { toolName, arguments: {}, connectionId: null },
      })
      expect(denied.granted).toBe(false)
      expect(denied.denialReason).toBe(`missing_scopes:${scope}`)

      const granted = await evaluateMcpToolPolicy({
        correlationId: 'corr-6',
        principal: delegatedPrincipal,
        session: { ...baseSession, scopes: `${READ_BUNDLE} ${scope}` },
        call: { toolName, arguments: {}, connectionId: null },
      })
      expect(granted.granted).toBe(true)
      expect(granted.requiredScopes).toEqual([scope])
    }
  })

  it('authorizes resource reads with explicit scope requirements', async () => {
    const granted = await evaluateMcpToolPolicy({
      correlationId: 'corr-7',
      principal: delegatedPrincipal,
      session: baseSession,
      call: {
        toolName: 'resource:connection_alerts',
        arguments: { uri: 'durabull://connections/conn-1/alerts' },
        connectionId: null,
        requiredScopes: ['mcp:failures:read'],
      },
    })
    expect(granted.granted).toBe(true)
    expect(granted.toolName).toBe('resource:connection_alerts')

    const denied = await evaluateMcpToolPolicy({
      correlationId: 'corr-8',
      principal: delegatedPrincipal,
      session: { ...baseSession, scopes: 'mcp:discover' },
      call: {
        toolName: 'resource:connections',
        arguments: { uri: 'durabull://connections' },
        connectionId: null,
        requiredScopes: ['mcp:jobs:read'],
      },
    })
    expect(denied.granted).toBe(false)
    expect(denied.denialReason).toBe('missing_scopes:mcp:jobs:read')
  })
})
