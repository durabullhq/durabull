import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb } from '@durabull/dal'
import { env } from '@durabull/env'
import { Hono } from 'hono'

import { resetServerAnalyticsForTests } from '@durabull/analytics/server'
import {
  bootstrapServerAnalytics,
  resetCachedAnonymousInstanceIdForTests,
} from '../lib/configure-server-analytics'
import { resetTelemetryEventsQueueForTests } from './telemetry-events-queue'

const QUEUE_PAUSED_EVENT = 'queue_paused'

const mutableEnv = env as {
  APP_BASE_URL?: string
  BETTER_AUTH_SECRET?: string
  CI?: boolean
  DATABASE_URL?: string
  DURABULL_CLOUD?: boolean
  DURABULL_TELEMETRY_COLLECT_SECRET?: string
  DURABULL_TELEMETRY_HMAC_SECRET?: string
  DURABULL_TELEMETRY_POSTHOG_HOST?: string
  DURABULL_TELEMETRY_POSTHOG_KEY?: string
  NODE_ENV?: 'development' | 'test' | 'production'
  POSTHOG_KEY?: string
}

const COLLECT_SECRET = 'test-events-collect-secret'

const originalAppBaseUrl = mutableEnv.APP_BASE_URL
const originalBetterAuthSecret = mutableEnv.BETTER_AUTH_SECRET
const originalCi = mutableEnv.CI
const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalDurabullCloud = mutableEnv.DURABULL_CLOUD
const originalCollectSecret = mutableEnv.DURABULL_TELEMETRY_COLLECT_SECRET
const originalHmacSecret = mutableEnv.DURABULL_TELEMETRY_HMAC_SECRET
const originalNodeEnv = mutableEnv.NODE_ENV
const originalPosthogHost = mutableEnv.DURABULL_TELEMETRY_POSTHOG_HOST
const originalPosthogKey = mutableEnv.DURABULL_TELEMETRY_POSTHOG_KEY
const originalPublicPosthogKey = mutableEnv.POSTHOG_KEY
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR
const originalFetch = globalThis.fetch

let tempPgliteDir = ''

async function waitForFetchMock(
  fetchMock: ReturnType<typeof mock>,
  expectedCalls = 1,
  timeoutMs = 5000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fetchMock.mock.calls.length >= expectedCalls) return
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
}

async function createTelemetryRouteApp() {
  const { default: telemetryRoutes } = await import('./telemetry')
  return new Hono().route('/', telemetryRoutes)
}

describe('telemetry routes', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-telemetry-routes-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.CI = false
    await closeDb()
  })

  afterEach(async () => {
    await closeDb()
    resetServerAnalyticsForTests()
    resetCachedAnonymousInstanceIdForTests()
    resetTelemetryEventsQueueForTests()
    mutableEnv.APP_BASE_URL = originalAppBaseUrl
    mutableEnv.BETTER_AUTH_SECRET = originalBetterAuthSecret
    mutableEnv.CI = originalCi
    mutableEnv.DURABULL_CLOUD = originalDurabullCloud
    mutableEnv.DURABULL_TELEMETRY_COLLECT_SECRET = originalCollectSecret
    mutableEnv.DURABULL_TELEMETRY_HMAC_SECRET = originalHmacSecret
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_HOST = originalPosthogHost
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_KEY = originalPosthogKey
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.NODE_ENV = originalNodeEnv
    mutableEnv.POSTHOG_KEY = originalPublicPosthogKey
    globalThis.fetch = originalFetch

    if (originalPgliteDir) {
      process.env.DURABULL_PGLITE_DIR = originalPgliteDir
    } else {
      delete process.env.DURABULL_PGLITE_DIR
    }

    if (tempPgliteDir) {
      await rm(tempPgliteDir, { recursive: true, force: true })
      tempPgliteDir = ''
    }
  })

  it('reports telemetry as disabled outside production', async () => {
    mutableEnv.NODE_ENV = 'development'
    const app = await createTelemetryRouteApp()

    const response = await app.request('/status')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      collectionRequired: true,
      enabled: false,
    })
  })

  it('reports telemetry as disabled in CI even when NODE_ENV is production', async () => {
    mutableEnv.CI = true
    mutableEnv.NODE_ENV = 'production'
    const app = await createTelemetryRouteApp()

    const response = await app.request('/status')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      collectionRequired: true,
      enabled: false,
    })
  })

  it('rejects forbidden properties on /events', async () => {
    mutableEnv.NODE_ENV = 'production'
    bootstrapServerAnalytics()
    const app = await createTelemetryRouteApp()

    const response = await app.request('/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: QUEUE_PAUSED_EVENT,
        properties: {
          queue_name: 'billing-production',
          success: true,
        },
        sessionId: 'ephemeral-session',
      }),
    })

    expect(response.status).toBe(400)
  })

  it('accepts known events in production and forwards sanitized canonical events', async () => {
    mutableEnv.NODE_ENV = 'production'
    mutableEnv.DURABULL_TELEMETRY_COLLECT_SECRET = COLLECT_SECRET
    bootstrapServerAnalytics()
    const fetchMock = mock(async () => new Response(null, { status: 202 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = await createTelemetryRouteApp()

    const response = await app.request('/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: QUEUE_PAUSED_EVENT,
        properties: { success: true },
        sessionId: 'ephemeral-session',
        timestamp: '2026-04-28T12:00:00.000Z',
      }),
    })

    expect(response.status).toBe(202)
    await waitForFetchMock(fetchMock)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      events: Array<{ event: string; properties: Record<string, unknown> }>
      instanceId: string
      runtime: Record<string, unknown>
    }

    expect(url).toBe('https://app.durabull.io/api/telemetry/collect')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
    })
    expect((init.headers as Record<string, string>)['X-Durabull-Telemetry-Signature']).toBeDefined()
    expect(body.instanceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
    expect(body.events[0].event).toBe(QUEUE_PAUSED_EVENT)
    expect(body.events[0].properties.success).toBe(true)
  })

  it('rejects unknown events', async () => {
    mutableEnv.NODE_ENV = 'production'
    bootstrapServerAnalytics()
    const app = await createTelemetryRouteApp()

    const response = await app.request('/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'not_a_real_event',
        properties: {},
        sessionId: 'ephemeral-session',
      }),
    })

    expect(response.status).toBe(400)
  })

  it('forwards trusted OSS runtime to cloud collect', async () => {
    mutableEnv.NODE_ENV = 'production'
    mutableEnv.DURABULL_TELEMETRY_COLLECT_SECRET = COLLECT_SECRET
    bootstrapServerAnalytics()
    const fetchMock = mock(async () => new Response(null, { status: 202 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = await createTelemetryRouteApp()

    const response = await app.request('/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: QUEUE_PAUSED_EVENT,
        properties: { authless: true, success: true },
        sessionId: 'ephemeral-session',
      }),
    })

    expect(response.status).toBe(202)

    await waitForFetchMock(fetchMock)

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      events: Array<{ properties: Record<string, unknown> }>
      runtime: Record<string, unknown>
    }

    expect(body.runtime.authless).toBe(false)
    expect(body.runtime.environment).toBe('production')
    expect(body.events[0].properties.authless).toBe(false)
    expect(body.events[0].properties.success).toBe(true)
  })

  it('returns 503 on /events when collect mode has an invalid PostHog batch host', async () => {
    mutableEnv.APP_BASE_URL = 'https://app.durabull.io'
    mutableEnv.BETTER_AUTH_SECRET = 'test-events-hmac-secret'
    mutableEnv.DURABULL_CLOUD = true
    mutableEnv.DURABULL_TELEMETRY_COLLECT_SECRET = COLLECT_SECRET
    mutableEnv.DURABULL_TELEMETRY_HMAC_SECRET = 'test-events-hmac-secret'
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_HOST = 'https://evil.example.com'
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_KEY = 'phc_test_project_key'
    mutableEnv.NODE_ENV = 'production'
    bootstrapServerAnalytics()
    const fetchMock = mock(async () => new Response(null, { status: 202 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = await createTelemetryRouteApp()

    const response = await app.request('/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: QUEUE_PAUSED_EVENT,
        properties: { success: true },
        sessionId: 'ephemeral-session',
      }),
    })

    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps local telemetry non-blocking when Durabull API forwarding fails', async () => {
    mutableEnv.NODE_ENV = 'production'
    mutableEnv.DURABULL_TELEMETRY_COLLECT_SECRET = COLLECT_SECRET
    bootstrapServerAnalytics()
    const fetchMock = mock(async () => {
      throw new Error('Durabull API unavailable')
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = await createTelemetryRouteApp()

    const response = await app.request('/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: QUEUE_PAUSED_EVENT,
        properties: { success: true },
        sessionId: 'ephemeral-session',
      }),
    })

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ accepted: true })
    await waitForFetchMock(fetchMock)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
