import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { AnalyticsEvents } from '../events'
import {
  captureAnonymousServerEvent,
  captureMcpAnalyticsServerEvent,
  ingestTelemetryCollectBatch,
} from './capture'
import {
  configureServerAnalytics,
  resetServerAnalyticsForTests,
  type ServerAnalyticsOptions,
} from './config'
import {
  signTelemetryCollectBody,
  TELEMETRY_COLLECT_SIGNATURE_HEADER,
  TELEMETRY_COLLECT_TIMESTAMP_HEADER,
} from './collect-auth'
import { hashIdentifiedOrganizationDistinctId } from './identifiers'

const HMAC_SECRET = 'test-hmac-secret'

const baseRuntime = {
  authless: false,
  env_connections: false,
  environment: 'production',
  persistence: 'postgres',
  stateless: false,
} as const

function configure(overrides: Partial<ServerAnalyticsOptions> = {}): void {
  const {
    collectSigningSecret = null,
    hmacSecret = HMAC_SECRET,
    durabullTelemetryPosthogHost = 'https://us.i.posthog.com',
    appPosthogHost = 'https://us.i.posthog.com',
    cloudCollectUrl = 'https://app.durabull.io/api/telemetry/collect',
    ...rest
  } = overrides

  configureServerAnalytics({
    enabled: true,
    collectEnabled: true,
    dedupeIdentifiedPosthogEvents: false,
    disclosureUrl: 'https://durabull.io/privacy',
    collectSigningSecret,
    hmacSecret,
    durabullTelemetryPosthogKey: 'phc_durabull',
    durabullTelemetryPosthogHost,
    appPosthogKey: 'phc_app',
    appPosthogHost,
    cloudCollectUrl,
    getRuntimeContext: () => ({ ...baseRuntime }),
    resolveAnonymousInstanceId: async () => 'anon-instance-id',
    ...rest,
  })
}

const originalFetch = globalThis.fetch

function captureFetchBodies(): { bodies: unknown[]; restore: () => void } {
  const bodies: unknown[] = []
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? '{}')))
    return new Response(null, { status: 200 })
  }) as typeof fetch
  return {
    bodies,
    restore: () => {
      globalThis.fetch = originalFetch
    },
  }
}

function captureFetchCalls(): {
  calls: Array<{ url: string; init: RequestInit | undefined }>
  restore: () => void
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(null, { status: 200 })
  }) as typeof fetch
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch
    },
  }
}

describe('captureAnonymousServerEvent timestamp clamping', () => {
  beforeEach(() => {
    resetServerAnalyticsForTests()
    configure()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetServerAnalyticsForTests()
  })

  it('clamps stale client timestamps on direct anonymous capture', async () => {
    const { bodies, restore } = captureFetchBodies()
    const before = Date.now()

    await captureAnonymousServerEvent({
      event: AnalyticsEvents.MCP_TOOL_CALLED,
      properties: { tool_name: 'list_jobs', response_class: 'success' },
      anonymousInstanceId: 'anon-instance-id',
      sessionId: 'session-1',
      timestamp: '2000-01-01T00:00:00.000Z',
    })

    restore()
    const after = Date.now()

    expect(bodies).toHaveLength(1)
    const batch = (bodies[0] as { batch: Array<{ timestamp: string }> }).batch
    expect(batch).toHaveLength(1)
    const stamped = new Date(batch[0].timestamp).getTime()
    expect(stamped).toBeGreaterThanOrEqual(before)
    expect(stamped).toBeLessThanOrEqual(after)
  })

  it('clamps future client timestamps outside the skew window', async () => {
    const { bodies, restore } = captureFetchBodies()
    const before = Date.now()
    const future = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()

    await captureAnonymousServerEvent({
      event: AnalyticsEvents.MCP_TOOL_CALLED,
      properties: { tool_name: 'list_jobs', response_class: 'success' },
      anonymousInstanceId: 'anon-instance-id',
      sessionId: 'session-1',
      timestamp: future,
    })

    restore()
    const after = Date.now()

    const batch = (bodies[0] as { batch: Array<{ timestamp: string }> }).batch
    const stamped = new Date(batch[0].timestamp).getTime()
    expect(stamped).toBeGreaterThanOrEqual(before)
    expect(stamped).toBeLessThanOrEqual(after)
  })

  it('clamps invalid timestamp strings to server time', async () => {
    const { bodies, restore } = captureFetchBodies()
    const before = Date.now()

    await captureAnonymousServerEvent({
      event: AnalyticsEvents.MCP_TOOL_CALLED,
      properties: { tool_name: 'list_jobs', response_class: 'success' },
      anonymousInstanceId: 'anon-instance-id',
      sessionId: 'session-1',
      timestamp: 'not-a-timestamp',
    })

    restore()
    const after = Date.now()

    const batch = (bodies[0] as { batch: Array<{ timestamp: string }> }).batch
    const stamped = new Date(batch[0].timestamp).getTime()
    expect(stamped).toBeGreaterThanOrEqual(before)
    expect(stamped).toBeLessThanOrEqual(after)
  })
})

describe('ingestTelemetryCollectBatch timestamp clamping', () => {
  beforeEach(() => {
    resetServerAnalyticsForTests()
    configure()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetServerAnalyticsForTests()
  })

  it('clamps client timestamps far outside the accepted skew window', async () => {
    const { bodies, restore } = captureFetchBodies()
    const before = Date.now()

    const result = await ingestTelemetryCollectBatch({
      instanceId: 'instance-1234567890',
      events: [
        {
          event: AnalyticsEvents.MCP_TOOL_CALLED,
          properties: { tool_name: 'list_jobs', response_class: 'success' },
          sessionId: 'session-1',
          timestamp: '2000-01-01T00:00:00.000Z',
        },
      ],
    })

    restore()
    const after = Date.now()

    expect(result.ok).toBe(true)
    const batch = (bodies[0] as { batch: Array<{ timestamp: string }> }).batch
    const stamped = new Date(batch[0].timestamp).getTime()
    expect(stamped).toBeGreaterThanOrEqual(before)
    expect(stamped).toBeLessThanOrEqual(after)
  })

  it('preserves recent client timestamps within the skew window', async () => {
    const { bodies, restore } = captureFetchBodies()
    const recent = new Date(Date.now() - 60_000).toISOString()

    await ingestTelemetryCollectBatch({
      instanceId: 'instance-1234567890',
      events: [
        {
          event: AnalyticsEvents.MCP_TOOL_CALLED,
          properties: { tool_name: 'list_jobs', response_class: 'success' },
          sessionId: 'session-1',
          timestamp: recent,
        },
      ],
    })

    restore()

    const batch = (bodies[0] as { batch: Array<{ timestamp: string }> }).batch
    expect(batch[0].timestamp).toBe(recent)
  })
})

describe('captureMcpAnalyticsServerEvent coalescing', () => {
  beforeEach(() => {
    resetServerAnalyticsForTests()
    configure()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetServerAnalyticsForTests()
  })

  it('coalesces anonymous and identified captures into one batch request when targets match', async () => {
    resetServerAnalyticsForTests()
    configure({ appPosthogKey: 'phc_durabull' })
    const { bodies, restore } = captureFetchBodies()

    await captureMcpAnalyticsServerEvent({
      event: AnalyticsEvents.MCP_TOOL_CALLED,
      properties: { tool_name: 'list_jobs', response_class: 'success' },
      includeAnonymous: true,
      anonymousInstanceId: 'anon-instance-id',
      sessionId: 'session-1',
      identifiedDistinctId: 'hashed-user-1',
      organizationId: 'org-1',
    })

    restore()

    expect(bodies).toHaveLength(1)
    const batch = (bodies[0] as { batch: Array<{ properties: Record<string, unknown> }> }).batch
    expect(batch).toHaveLength(2)
    expect(batch.some((event) => event.properties.$process_person_profile === false)).toBe(true)
    expect(batch.some((event) => event.properties.$process_person_profile === true)).toBe(true)
    const identifiedEvent = batch.find((event) => event.properties.$process_person_profile === true)
    expect(identifiedEvent?.properties.$groups).toEqual({
      organization: hashIdentifiedOrganizationDistinctId('org-1', HMAC_SECRET),
    })
  })

  it('sends separate batch requests when identified telemetry uses a different project key', async () => {
    resetServerAnalyticsForTests()
    configure({ appPosthogKey: 'phc_different_app_project' })
    const { bodies, restore } = captureFetchBodies()

    await captureMcpAnalyticsServerEvent({
      event: AnalyticsEvents.MCP_TOOL_CALLED,
      properties: { tool_name: 'list_jobs', response_class: 'success' },
      includeAnonymous: true,
      anonymousInstanceId: 'anon-instance-id',
      sessionId: 'session-1',
      identifiedDistinctId: 'hashed-user-1',
      organizationId: 'org-1',
    })

    restore()

    expect(bodies).toHaveLength(2)
    expect(bodies.every((body) => (body as { batch: Array<unknown> }).batch.length === 1)).toBe(
      true
    )
  })

  it('clamps stale explicit timestamps for MCP analytics capture', async () => {
    resetServerAnalyticsForTests()
    configure({ appPosthogKey: 'phc_durabull' })
    const { bodies, restore } = captureFetchBodies()
    const before = Date.now()

    await captureMcpAnalyticsServerEvent({
      event: AnalyticsEvents.MCP_TOOL_CALLED,
      properties: { tool_name: 'list_jobs', response_class: 'success' },
      includeAnonymous: true,
      anonymousInstanceId: 'anon-instance-id',
      sessionId: 'session-1',
      identifiedDistinctId: 'hashed-user-1',
      organizationId: 'org-1',
      timestamp: '2000-01-01T00:00:00.000Z',
    })

    restore()
    const after = Date.now()

    const batch = (bodies[0] as { batch: Array<{ timestamp: string }> }).batch
    expect(batch).toHaveLength(2)
    for (const event of batch) {
      const stamped = new Date(event.timestamp).getTime()
      expect(stamped).toBeGreaterThanOrEqual(before)
      expect(stamped).toBeLessThanOrEqual(after)
    }
  })
})

describe('captureAnonymousServerEvent OSS cloud forwarding', () => {
  beforeEach(() => {
    resetServerAnalyticsForTests()
    configure({
      collectEnabled: false,
      collectSigningSecret: 'collect-signing-secret',
      cloudCollectUrl: 'https://app.durabull.io/api/telemetry/collect',
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetServerAnalyticsForTests()
  })

  it('forwards a signed batch with clamped timestamps', async () => {
    const { calls, restore } = captureFetchCalls()
    const before = Date.now()

    await captureAnonymousServerEvent({
      event: AnalyticsEvents.MCP_TOOL_CALLED,
      properties: { tool_name: 'list_jobs', response_class: 'success' },
      anonymousInstanceId: 'anon-instance-id',
      sessionId: 'session-1',
      timestamp: '2000-01-01T00:00:00.000Z',
    })

    restore()
    const after = Date.now()

    expect(calls).toHaveLength(1)
    const call = calls[0]
    expect(call.url).toBe('https://app.durabull.io/api/telemetry/collect')
    expect(call.init?.method).toBe('POST')

    const headers = call.init?.headers as Record<string, string>
    const rawBody = String(call.init?.body ?? '')
    const parsedBody = JSON.parse(rawBody) as {
      events: Array<{ timestamp: string }>
    }
    const forwardedTs = new Date(parsedBody.events[0].timestamp).getTime()
    expect(forwardedTs).toBeGreaterThanOrEqual(before)
    expect(forwardedTs).toBeLessThanOrEqual(after)

    const timestamp = headers[TELEMETRY_COLLECT_TIMESTAMP_HEADER]
    const signature = headers[TELEMETRY_COLLECT_SIGNATURE_HEADER]
    expect(timestamp).toBeTruthy()
    expect(signature).toBeTruthy()
    expect(signature).toBe(
      signTelemetryCollectBody('collect-signing-secret', Number(timestamp), rawBody).signature
    )
  })
})
