import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  configureServerAnalytics,
  resetServerAnalyticsForTests,
  type ServerAnalyticsOptions,
} from '@durabull/analytics/server'
import {
  INSTANCE_HEARTBEAT_SESSION_ID,
  resetTelemetryHeartbeatForTests,
  sendInstanceHeartbeatIfDue,
} from './telemetry-heartbeat'

const originalFetch = globalThis.fetch

function configure(overrides: Partial<ServerAnalyticsOptions> = {}): void {
  configureServerAnalytics({
    enabled: true,
    collectEnabled: false,
    dedupeIdentifiedPosthogEvents: false,
    disclosureUrl: 'https://durabull.io/privacy',
    collectSigningSecret: null,
    hmacSecret: null,
    durabullTelemetryPosthogKey: null,
    durabullTelemetryPosthogHost: null,
    appPosthogKey: null,
    appPosthogHost: null,
    cloudCollectUrl: 'https://app.durabull.io/api/telemetry/collect',
    getRuntimeContext: () => ({
      authless: false,
      env_connections: false,
      environment: 'production',
      persistence: 'postgres',
      stateless: false,
      deployment: 'self_hosted',
      distribution: 'desktop',
      release_channel: 'desktop',
      api_version: '1.45.0',
    }),
    resolveAnonymousInstanceId: async () => 'install-1234567890',
    ...overrides,
  })
}

function mockFetch() {
  const fetchMock = mock(async () => new Response(null, { status: 202 }))
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe('instance heartbeat', () => {
  beforeEach(() => {
    resetServerAnalyticsForTests()
    resetTelemetryHeartbeatForTests()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetServerAnalyticsForTests()
    resetTelemetryHeartbeatForTests()
  })

  it('forwards one instance_active event per UTC day with a stable session id', async () => {
    configure()
    const fetchMock = mockFetch()
    const morning = Date.parse('2026-11-10T08:00:00.000Z')

    await sendInstanceHeartbeatIfDue(morning)
    await sendInstanceHeartbeatIfDue(morning + 6 * 60 * 60 * 1000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://app.durabull.io/api/telemetry/collect')
    const body = JSON.parse(String(init.body)) as {
      instanceId: string
      runtime: Record<string, unknown>
      events: Array<{ event: string; sessionId: string; properties: Record<string, unknown> }>
    }
    expect(body.instanceId).toBe('install-1234567890')
    expect(body.runtime).toMatchObject({ deployment: 'self_hosted', distribution: 'desktop' })
    expect(body.events[0]).toMatchObject({
      event: 'instance_active',
      sessionId: INSTANCE_HEARTBEAT_SESSION_ID,
    })

    await sendInstanceHeartbeatIfDue(Date.parse('2026-11-11T00:30:00.000Z'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does nothing when product telemetry is disabled', async () => {
    configure({ enabled: false })
    const fetchMock = mockFetch()

    await sendInstanceHeartbeatIfDue(Date.parse('2026-11-10T08:00:00.000Z'))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retries on a later check when the collector rejects the heartbeat', async () => {
    configure()
    const statuses = [503, 202]
    const fetchMock = mock(async () => new Response(null, { status: statuses.shift() ?? 202 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const now = Date.parse('2026-11-10T08:00:00.000Z')

    await sendInstanceHeartbeatIfDue(now)
    await sendInstanceHeartbeatIfDue(now + 60 * 60 * 1000)
    await sendInstanceHeartbeatIfDue(now + 2 * 60 * 60 * 1000)

    // Rejected, retried and accepted, then nothing more that day.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries on a later check when the installation id lookup fails', async () => {
    let attempts = 0
    configure({
      resolveAnonymousInstanceId: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('database unavailable')
        return 'install-1234567890'
      },
    })
    const fetchMock = mockFetch()
    const now = Date.parse('2026-11-10T08:00:00.000Z')

    await sendInstanceHeartbeatIfDue(now)
    expect(fetchMock).not.toHaveBeenCalled()

    await sendInstanceHeartbeatIfDue(now + 60 * 60 * 1000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
