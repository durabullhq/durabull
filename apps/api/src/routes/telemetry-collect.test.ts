import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  hashTelemetryIdentifier,
  resetServerAnalyticsForTests,
  resetTelemetryCollectReplayCacheForTests,
  signTelemetryCollectBody,
  TELEMETRY_COLLECT_SIGNATURE_HEADER,
  TELEMETRY_COLLECT_TIMESTAMP_HEADER,
} from '@durabull/analytics/server'
import { env } from '@durabull/env'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import {
  bootstrapServerAnalytics,
  resetCachedAnonymousInstanceIdForTests,
} from '../lib/configure-server-analytics'
import telemetryRoutes from './telemetry'
import { resetTelemetryCollectQueueForTests } from './telemetry-collect-queue'

const INSTANCE_ID = '41111111-1111-4111-8111-111111111111'
const SESSION_ID = 'ephemeral-session'
const HMAC_SECRET = 'test-telemetry-collect-hmac-secret'
const COLLECT_SECRET = 'test-telemetry-collect-signing-secret'
const POSTHOG_KEY = 'phc_test_project_key'
// Within the collect timestamp skew window so the value is forwarded unchanged.
const RECENT_EVENT_TIMESTAMP = new Date(Date.now() - 60_000).toISOString()
const RECENT_SENT_AT = new Date(Date.now() - 30_000).toISOString()

const DEFAULT_RUNTIME = {
  authless: false,
  env_connections: false,
  environment: 'production',
  persistence: 'postgres',
  stateless: false,
} as const

const mutableEnv = env as {
  APP_BASE_URL?: string
  BETTER_AUTH_SECRET?: string
  CI?: boolean
  DURABULL_CLOUD?: boolean
  DURABULL_TELEMETRY_COLLECT_SECRET?: string
  DURABULL_TELEMETRY_HMAC_SECRET?: string
  DURABULL_TELEMETRY_POSTHOG_HOST?: string
  DURABULL_TELEMETRY_POSTHOG_KEY?: string
  NODE_ENV?: 'development' | 'test' | 'production'
  POSTHOG_KEY?: string
}

const originalAppBaseUrl = mutableEnv.APP_BASE_URL
const originalBetterAuthSecret = mutableEnv.BETTER_AUTH_SECRET
const originalCi = mutableEnv.CI
const originalCollectSecret = mutableEnv.DURABULL_TELEMETRY_COLLECT_SECRET
const originalDurabullCloud = mutableEnv.DURABULL_CLOUD
const originalHmacSecret = mutableEnv.DURABULL_TELEMETRY_HMAC_SECRET
const originalNodeEnv = mutableEnv.NODE_ENV
const originalPosthogHost = mutableEnv.DURABULL_TELEMETRY_POSTHOG_HOST
const originalPosthogKey = mutableEnv.DURABULL_TELEMETRY_POSTHOG_KEY
const originalPublicPosthogKey = mutableEnv.POSTHOG_KEY
const originalFetch = globalThis.fetch

function createTelemetryRouteApp(options: { bodyLimit?: boolean } = {}) {
  const app = new Hono()

  if (options.bodyLimit) {
    app.use(
      '/api/telemetry/collect',
      bodyLimit({
        maxSize: 128 * 1024,
        onError: (c) => c.json({ error: 'Payload Too Large' }, 413),
      })
    )
    return app.route('/api/telemetry', telemetryRoutes)
  }

  return app.route('/', telemetryRoutes)
}

function collectPayload(
  properties: Record<string, unknown> = { success: true },
  runtime: Record<string, unknown> = DEFAULT_RUNTIME
) {
  return JSON.stringify({
    instanceId: INSTANCE_ID,
    sentAt: RECENT_SENT_AT,
    runtime,
    events: [
      {
        event: 'queue_paused',
        properties,
        sessionId: SESSION_ID,
        timestamp: RECENT_EVENT_TIMESTAMP,
      },
    ],
  })
}

function signedCollectRequest(
  body: string,
  secret: string = COLLECT_SECRET,
  timestampSec: number = Math.floor(Date.now() / 1000)
) {
  const { signature, timestamp } = signTelemetryCollectBody(secret, timestampSec, body)
  return {
    method: 'POST' as const,
    headers: {
      'Content-Type': 'application/json',
      [TELEMETRY_COLLECT_TIMESTAMP_HEADER]: timestamp,
      [TELEMETRY_COLLECT_SIGNATURE_HEADER]: signature,
    },
    body,
  }
}

async function postCollect(
  app: ReturnType<typeof createTelemetryRouteApp>,
  body: string,
  extraHeaders: Record<string, string> = {}
) {
  const signed = signedCollectRequest(body)
  return app.request('/collect', {
    ...signed,
    headers: { ...signed.headers, ...extraHeaders },
  })
}

describe('telemetry collect route', () => {
  beforeEach(() => {
    resetTelemetryCollectReplayCacheForTests()
    mutableEnv.APP_BASE_URL = 'https://app.durabull.io'
    mutableEnv.BETTER_AUTH_SECRET = undefined
    mutableEnv.CI = false
    mutableEnv.DURABULL_CLOUD = true
    mutableEnv.NODE_ENV = 'production'
    mutableEnv.POSTHOG_KEY = undefined
    mutableEnv.DURABULL_TELEMETRY_HMAC_SECRET = HMAC_SECRET
    mutableEnv.DURABULL_TELEMETRY_COLLECT_SECRET = COLLECT_SECRET
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_HOST = 'https://us.i.posthog.com'
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_KEY = POSTHOG_KEY
    bootstrapServerAnalytics()
  })

  afterEach(() => {
    resetServerAnalyticsForTests()
    resetCachedAnonymousInstanceIdForTests()
    resetTelemetryCollectQueueForTests()
    mutableEnv.APP_BASE_URL = originalAppBaseUrl
    mutableEnv.BETTER_AUTH_SECRET = originalBetterAuthSecret
    mutableEnv.CI = originalCi
    mutableEnv.DURABULL_CLOUD = originalDurabullCloud
    mutableEnv.NODE_ENV = originalNodeEnv
    mutableEnv.POSTHOG_KEY = originalPublicPosthogKey
    mutableEnv.DURABULL_TELEMETRY_HMAC_SECRET = originalHmacSecret
    mutableEnv.DURABULL_TELEMETRY_COLLECT_SECRET = originalCollectSecret
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_HOST = originalPosthogHost
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_KEY = originalPosthogKey
    globalThis.fetch = originalFetch
  })

  it('can use POSTHOG_KEY when the dedicated telemetry PostHog key is unset', async () => {
    mutableEnv.POSTHOG_KEY = POSTHOG_KEY
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_KEY = undefined
    bootstrapServerAnalytics()
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(app, collectPayload())

    expect(response.status).toBe(202)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      api_key: string
      batch: Array<{ properties: Record<string, unknown> }>
    }

    expect(body.api_key).toBe(POSTHOG_KEY)
    expect(body.batch[0].properties.instance_key).toBe(
      hashTelemetryIdentifier(INSTANCE_ID, HMAC_SECRET)
    )
  })

  it('does not fall back to BETTER_AUTH_SECRET for telemetry HMAC', async () => {
    mutableEnv.BETTER_AUTH_SECRET = HMAC_SECRET
    mutableEnv.DURABULL_TELEMETRY_HMAC_SECRET = undefined
    bootstrapServerAnalytics()
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(app, collectPayload())

    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects replayed signed collect requests', async () => {
    const app = createTelemetryRouteApp()
    const body = collectPayload()
    const signed = signedCollectRequest(body)

    const first = await app.request('/collect', signed)
    expect(first.status).toBe(202)

    const replay = await app.request('/collect', signed)
    expect(replay.status).toBe(401)
    expect(await replay.json()).toEqual({ error: 'Unauthorized telemetry collect request' })
  })

  it('forwards canonical sanitized events to PostHog batch with HMAC identifiers', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(
      app,
      collectPayload({
        authless: true,
        environment: 'production',
        persistence: 'pglite',
        stateless: true,
        success: true,
      }),
      {
        Authorization: 'Bearer should-not-forward',
        Cookie: 'session=should-not-forward',
        'X-Forwarded-For': '203.0.113.10',
        'User-Agent': 'should-not-forward',
      }
    )

    expect(response.status).toBe(202)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://us.i.posthog.com/batch/')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })

    const body = JSON.parse(String(init.body)) as {
      api_key: string
      batch: Array<{
        event: string
        properties: Record<string, unknown>
        timestamp: string
      }>
    }
    const properties = body.batch[0].properties

    expect(body.api_key).toBe(POSTHOG_KEY)
    expect(body.batch[0].event).toBe('queue_paused')
    expect(body.batch[0].timestamp).toBe(RECENT_EVENT_TIMESTAMP)
    expect(properties.success).toBe(true)
    expect(properties.authless).toBe(false)
    expect(properties.environment).toBe('production')
    expect(properties.$process_person_profile).toBe(false)
    expect(properties.$geoip_disable).toBe(true)
    expect(properties.distinct_id).toBe(
      hashTelemetryIdentifier(`${INSTANCE_ID}:${SESSION_ID}`, HMAC_SECRET)
    )
    expect(properties.instance_key).toBe(hashTelemetryIdentifier(INSTANCE_ID, HMAC_SECRET))
    expect(properties.distinct_id).not.toContain(INSTANCE_ID)
    expect(properties.distinct_id).not.toContain(SESSION_ID)
    expect(properties.instance_key).not.toContain(INSTANCE_ID)
  })

  it('uses the forwarded client runtime instead of cloud server runtime', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(
      app,
      collectPayload(
        {
          authless: false,
          environment: 'development',
          persistence: 'postgres',
          stateless: false,
          success: true,
        },
        {
          authless: true,
          env_connections: false,
          environment: 'production',
          persistence: 'pglite',
          stateless: true,
        }
      )
    )

    expect(response.status).toBe(202)

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      batch: Array<{ properties: Record<string, unknown> }>
    }
    const properties = body.batch[0].properties

    expect(properties.authless).toBe(true)
    expect(properties.environment).toBe('production')
    expect(properties.persistence).toBe('pglite')
    expect(properties.stateless).toBe(true)
    // An older install sends no deployment fields; the collector never labels it as Cloud.
    expect(properties.deployment).toBe('self_hosted')
    expect(properties.distribution).toBe('unknown')
  })

  it('accepts unsigned collect requests from self-hosted installs and stamps them self_hosted', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await app.request('/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: collectPayload(
        { success: true, deployment: 'cloud', distribution: 'cloud', release_channel: 'docker' },
        {
          ...DEFAULT_RUNTIME,
          deployment: 'cloud',
          distribution: 'docker',
          release_channel: 'docker',
          api_version: '1.45.0',
        }
      ),
    })

    expect(response.status).toBe(202)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      batch: Array<{ properties: Record<string, unknown> }>
    }
    expect(body.batch[0].properties).toMatchObject({
      deployment: 'self_hosted',
      distribution: 'docker',
      release_channel: 'docker',
      api_version: '1.45.0',
    })
  })

  it('accepts unsigned collect requests when the collector has no signing secret', async () => {
    mutableEnv.DURABULL_TELEMETRY_COLLECT_SECRET = undefined
    bootstrapServerAnalytics()
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await app.request('/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: collectPayload(),
    })

    expect(response.status).toBe(202)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects requests that send only one of the signature headers', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await app.request('/collect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [TELEMETRY_COLLECT_SIGNATURE_HEADER]: 'sha256=deadbeef',
      },
      body: collectPayload(),
    })

    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects collect requests with invalid signatures', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()
    const body = collectPayload()
    const signed = signedCollectRequest(body, 'wrong-secret')

    const response = await app.request('/collect', signed)

    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts collect requests even when PostHog rejects the batch asynchronously', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 400 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(app, collectPayload())

    expect(response.status).toBe(202)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fetchMock).toHaveBeenCalled()
  })

  it('accepts collect requests even when PostHog responds with a redirect', async () => {
    const fetchMock = mock(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://evil.example.com/batch/' },
        })
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(app, collectPayload())

    expect(response.status).toBe(202)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fetchMock).toHaveBeenCalled()
  })

  it('accepts collect requests even when PostHog is unreachable', async () => {
    const fetchMock = mock(async () => {
      throw new Error('PostHog unavailable')
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(app, collectPayload())

    expect(response.status).toBe(202)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fetchMock).toHaveBeenCalled()
  })

  it('returns not found when product telemetry is disabled', async () => {
    mutableEnv.NODE_ENV = 'development'
    bootstrapServerAnalytics()
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(app, collectPayload())

    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects collect requests on non-Durabull API deployments', async () => {
    mutableEnv.APP_BASE_URL = 'https://self-hosted.example.com'
    mutableEnv.DURABULL_CLOUD = false
    bootstrapServerAnalytics()
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(app, collectPayload())

    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects forbidden or unknown properties before forwarding', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(
      app,
      collectPayload({ queue_name: 'billing-production', success: true })
    )

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects unknown events before forwarding', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const body = JSON.stringify({
      instanceId: INSTANCE_ID,
      runtime: DEFAULT_RUNTIME,
      events: [
        {
          event: 'oss_queue_paused',
          properties: {},
          sessionId: SESSION_ID,
        },
      ],
    })

    const response = await postCollect(app, body)

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when collection secrets are missing', async () => {
    mutableEnv.BETTER_AUTH_SECRET = undefined
    mutableEnv.POSTHOG_KEY = undefined
    mutableEnv.DURABULL_TELEMETRY_HMAC_SECRET = undefined
    mutableEnv.DURABULL_TELEMETRY_COLLECT_SECRET = undefined
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_KEY = undefined
    bootstrapServerAnalytics()
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(app, collectPayload())

    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when the configured PostHog batch host is invalid', async () => {
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_HOST = 'http://[::1'
    bootstrapServerAnalytics()
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(app, collectPayload())

    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when the configured PostHog batch host is not HTTPS', async () => {
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_HOST = 'http://us.i.posthog.com'
    bootstrapServerAnalytics()
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(app, collectPayload())

    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when the configured PostHog batch host is not allowlisted', async () => {
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_HOST = 'https://evil.example.com'
    bootstrapServerAnalytics()
    const fetchMock = mock(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createTelemetryRouteApp()

    const response = await postCollect(app, collectPayload())

    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects oversized public collect payloads on the existing API route', async () => {
    const app = createTelemetryRouteApp({ bodyLimit: true })
    const body = JSON.stringify({
      instanceId: INSTANCE_ID,
      events: [
        {
          event: 'queue_paused',
          properties: { action: 'x'.repeat(129 * 1024) },
          sessionId: SESSION_ID,
        },
      ],
    })

    const response = await app.request('/api/telemetry/collect', {
      method: 'POST',
      headers: { 'Content-Length': String(body.length), 'Content-Type': 'application/json' },
      body,
    })

    expect(response.status).toBe(413)
  })
})
