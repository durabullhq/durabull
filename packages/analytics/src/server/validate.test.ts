import { describe, expect, it } from 'bun:test'

import { AnalyticsEvents, AnalyticsProperties } from '../events'
import type { ServerAnalyticsRuntimeContext } from './config'
import { validateTelemetryPayload } from './validate'

const productionRuntime: ServerAnalyticsRuntimeContext = {
  authless: false,
  env_connections: true,
  environment: 'production',
  persistence: 'postgres',
  stateless: false,
  deployment: 'self_hosted',
  distribution: 'docker',
}

describe('validateTelemetryPayload', () => {
  it('accepts events when optional MCP properties are undefined', () => {
    const result = validateTelemetryPayload(AnalyticsEvents.MCP_AUTH_FAILED, {
      [AnalyticsProperties.MCP_AUTH_FAILURE]: 'unauthorized',
      [AnalyticsProperties.SUCCESS]: false,
      [AnalyticsProperties.PRINCIPAL_TYPE]: undefined,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.properties).not.toHaveProperty(AnalyticsProperties.PRINCIPAL_TYPE)
      expect(result.properties[AnalyticsProperties.MCP_AUTH_FAILURE]).toBe('unauthorized')
    }
  })

  it('lets server runtime context override client properties', () => {
    const result = validateTelemetryPayload(
      AnalyticsEvents.QUEUE_PAUSED,
      { authless: true, success: true },
      productionRuntime
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.properties.authless).toBe(false)
      expect(result.properties.environment).toBe('production')
    }
  })

  it('accepts every Slack property and rejects Slack payloads carrying ids', () => {
    const slackProperties = Object.entries(AnalyticsProperties)
      .filter(([key]) => key.startsWith('SLACK_'))
      .map(([, value]) => value)
    expect(slackProperties.length).toBeGreaterThan(20)
    const accepted = validateTelemetryPayload(
      AnalyticsEvents.SLACK_COMMAND_RUN,
      Object.fromEntries(slackProperties.map((key) => [key, 'value'])),
      productionRuntime
    )
    expect(accepted.ok).toBe(true)

    const rejected = validateTelemetryPayload(AnalyticsEvents.SLACK_ACTION_PERFORMED, {
      [AnalyticsProperties.SLACK_ACTION]: 'acknowledge',
      slack_team_id: 'T0ACME',
    })
    expect(rejected).toEqual({ ok: false, error: 'invalid_properties' })
  })
})
