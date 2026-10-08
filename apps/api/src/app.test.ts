import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb } from '@durabull/dal'
import { env } from '@durabull/env'
import { createApiApp } from './app'
import { APP_BUILD_ID, APP_VERSION } from './lib/build-info'
import { bootstrapServerAnalytics } from './lib/configure-server-analytics'

const mutableEnv = env as {
  APP_BASE_URL?: string
  CI?: boolean
  DATABASE_URL?: string
  DURABULL_AUTHLESS?: boolean
  DURABULL_CLOUD?: boolean
  DURABULL_TELEMETRY_POSTHOG_KEY?: string
  MCP_AUTHLESS_BEARER_TOKEN?: string
  NODE_ENV?: 'development' | 'test' | 'production'
  POSTHOG_KEY?: string
}

const originalAppBaseUrl = mutableEnv.APP_BASE_URL
const originalAuthless = mutableEnv.DURABULL_AUTHLESS
const originalCi = mutableEnv.CI
const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalDurabullCloud = mutableEnv.DURABULL_CLOUD
const originalDurabullTelemetryPosthogKey = mutableEnv.DURABULL_TELEMETRY_POSTHOG_KEY
const originalMcpAuthlessBearerToken = mutableEnv.MCP_AUTHLESS_BEARER_TOKEN
const originalNodeEnv = mutableEnv.NODE_ENV
const originalPosthogKey = mutableEnv.POSTHOG_KEY
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

async function createConfiguredApiApp() {
  bootstrapServerAnalytics()
  return createApiApp({ enableLogging: false })
}

describe('api app config', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-app-config-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    mutableEnv.CI = false
    mutableEnv.APP_BASE_URL = 'https://self-hosted.example.com'
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_AUTHLESS = true
    mutableEnv.DURABULL_CLOUD = false
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_KEY = undefined
    mutableEnv.MCP_AUTHLESS_BEARER_TOKEN = 'app-test-bearer-token'
    await closeDb()
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.APP_BASE_URL = originalAppBaseUrl
    mutableEnv.CI = originalCi
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DURABULL_AUTHLESS = originalAuthless
    mutableEnv.DURABULL_CLOUD = originalDurabullCloud
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_KEY = originalDurabullTelemetryPosthogKey
    mutableEnv.MCP_AUTHLESS_BEARER_TOKEN = originalMcpAuthlessBearerToken
    mutableEnv.NODE_ENV = originalNodeEnv
    mutableEnv.POSTHOG_KEY = originalPosthogKey

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

  it('exposes required telemetry status without treating POSTHOG_KEY as an opt-out', async () => {
    mutableEnv.NODE_ENV = 'production'
    mutableEnv.POSTHOG_KEY = 'phc_instance_owner_project'
    const { app } = await createConfiguredApiApp()

    const response = await app.request('/api/app/config')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      posthog: {
        enabled: true,
        key: 'phc_instance_owner_project',
      },
      telemetry: {
        collectionRequired: true,
        dedupeIdentifiedPosthogEvents: false,
        disclosureUrl: 'https://durabull.io/privacy',
        enabled: true,
      },
    })
  })

  it('enables telemetry dedupe when the configured PostHog project is Durabull-managed', async () => {
    mutableEnv.APP_BASE_URL = 'https://app.durabull.io'
    mutableEnv.NODE_ENV = 'production'
    mutableEnv.POSTHOG_KEY = 'phc_durabull_cloud_project'
    const { app } = await createConfiguredApiApp()

    const response = await app.request('/api/app/config')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      posthog: {
        enabled: true,
      },
      telemetry: {
        collectionRequired: true,
        dedupeIdentifiedPosthogEvents: true,
        enabled: true,
      },
    })
  })

  it('does not dedupe cloud telemetry when an internal telemetry PostHog override uses a separate project', async () => {
    mutableEnv.APP_BASE_URL = 'https://app.durabull.io'
    mutableEnv.NODE_ENV = 'production'
    mutableEnv.POSTHOG_KEY = 'phc_durabull_cloud_native_project'
    mutableEnv.DURABULL_TELEMETRY_POSTHOG_KEY = 'phc_durabull_separate_telemetry_project'
    const { app } = await createConfiguredApiApp()

    const response = await app.request('/api/app/config')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      telemetry: {
        collectionRequired: true,
        dedupeIdentifiedPosthogEvents: false,
        enabled: true,
      },
    })
  })

  it('serves the exact public OpenAI challenge before the SPA fallback', async () => {
    mutableEnv.DURABULL_AUTHLESS = false
    const { app } = await createApiApp({ enableLogging: false })
    app.get('*', (c) => c.html('<!doctype html><title>SPA fallback</title>'))

    const response = await app.request('/.well-known/openai-apps-challenge')

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=UTF-8')
    expect(response.headers.get('Cache-Control')).toBe(
      'no-store, no-cache, must-revalidate, max-age=0'
    )
    expect(await response.text()).toBe('7BAVDPjAMMASK3UBJ4mApVuOpmUawUdFn_dJ42qwtlY')

    const headResponse = await app.request('/.well-known/openai-apps-challenge', {
      method: 'HEAD',
    })
    expect(headResponse.status).toBe(200)
    expect(headResponse.headers.get('Content-Type')).toBe('text/plain; charset=UTF-8')
    expect(await headResponse.text()).toBe('')
  })

  it('exposes no-store app version checks without session state', async () => {
    const { app } = await createConfiguredApiApp()

    const staleResponse = await app.request(
      '/api/app/version?clientVersion=0.0.0&clientBuildId=old-build'
    )
    const currentResponse = await app.request(
      `/api/app/version?clientVersion=${APP_VERSION}&clientBuildId=${APP_BUILD_ID}`
    )

    expect(staleResponse.status).toBe(200)
    expect(staleResponse.headers.get('Cache-Control')).toBe(
      'no-store, no-cache, must-revalidate, max-age=0'
    )
    expect(await staleResponse.json()).toMatchObject({
      version: APP_VERSION,
      buildId: APP_BUILD_ID,
      update: {
        required: true,
        reason: APP_BUILD_ID === APP_VERSION ? 'version_mismatch' : 'build_mismatch',
      },
    })

    expect(currentResponse.status).toBe(200)
    expect(await currentResponse.json()).toMatchObject({
      update: {
        required: false,
        reason: 'up_to_date',
      },
    })
  })
})
