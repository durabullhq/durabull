import { afterEach, describe, expect, it } from 'bun:test'
import { getServerAnalyticsOptions, resetServerAnalyticsForTests } from '@durabull/analytics/server'
import { env } from '@durabull/env'
import { APP_RELEASE_CHANNEL, APP_VERSION } from './build-info'
import { bootstrapServerAnalytics } from './configure-server-analytics'

const mutableEnv = env as { APP_BASE_URL?: string; DURABULL_CLOUD?: boolean }
const originalAppBaseUrl = mutableEnv.APP_BASE_URL
const originalDurabullCloud = mutableEnv.DURABULL_CLOUD

describe('server analytics runtime context', () => {
  afterEach(() => {
    mutableEnv.APP_BASE_URL = originalAppBaseUrl
    mutableEnv.DURABULL_CLOUD = originalDurabullCloud
    resetServerAnalyticsForTests()
  })

  it('stamps Durabull Cloud as cloud regardless of the image release channel', () => {
    mutableEnv.DURABULL_CLOUD = true
    bootstrapServerAnalytics()

    expect(getServerAnalyticsOptions().getRuntimeContext()).toMatchObject({
      deployment: 'cloud',
      distribution: 'cloud',
      release_channel: APP_RELEASE_CHANNEL,
      api_version: APP_VERSION,
    })
  })

  it('treats the app.durabull.io base URL as Cloud', () => {
    mutableEnv.DURABULL_CLOUD = false
    mutableEnv.APP_BASE_URL = 'https://app.durabull.io'
    bootstrapServerAnalytics()

    expect(getServerAnalyticsOptions().getRuntimeContext().deployment).toBe('cloud')
  })

  it('stamps every other install as self_hosted', () => {
    mutableEnv.DURABULL_CLOUD = false
    mutableEnv.APP_BASE_URL = 'http://localhost:3000'
    bootstrapServerAnalytics()

    const runtime = getServerAnalyticsOptions().getRuntimeContext()
    expect(runtime.deployment).toBe('self_hosted')
    expect(runtime.distribution).not.toBe('cloud')
  })
})
