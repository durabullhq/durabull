import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  alertDeliveryRepository,
  alertEventRepository,
  alertRuleRepository,
  closeDb,
  decryptSecret,
  getDb,
  linearIntegrationRepository,
  linearOauthStateRepository,
  organization,
  redisConnection,
  user,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { Hono } from 'hono'

const TEST_ORG_ID = 'alert-global-org'
const FIRST_CONNECTION_ID = '66666666-6666-4666-8666-666666666666'
const SECOND_CONNECTION_ID = '77777777-7777-4777-8777-777777777777'
const LINEAR_CALLBACK_URL = 'https://app.durabull.test/api/alerts/integrations/linear/callback'

const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_SECRET_ENCRYPTION_KEY?: string
  LINEAR_OAUTH_CLIENT_ID?: string
  LINEAR_OAUTH_CLIENT_SECRET?: string
  LINEAR_OAUTH_REDIRECT_URI?: string
  LINEAR_OAUTH_ACTOR: 'user' | 'app'
  APP_BASE_URL: string
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalSecretKey = mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY
const originalLinearClientId = mutableEnv.LINEAR_OAUTH_CLIENT_ID
const originalLinearClientSecret = mutableEnv.LINEAR_OAUTH_CLIENT_SECRET
const originalLinearRedirectUri = mutableEnv.LINEAR_OAUTH_REDIRECT_URI
const originalLinearActor = mutableEnv.LINEAR_OAUTH_ACTOR
const originalAppBaseUrl = mutableEnv.APP_BASE_URL
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

const exchangeLinearOauthCodeMock = mock(async () => ({
  accessToken: 'linear-access-token',
  refreshToken: 'linear-refresh-token',
  tokenType: 'Bearer',
  expiresIn: 86_399,
  scopes: 'read issues:create',
  accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000),
}))
const validateLinearAccessTokenMock = mock(async () => ({ organizationName: 'Acme' }))
const fetchLinearMetadataMock = mock(async () => ({
  teams: [],
  projects: [],
  labels: [],
  users: [],
  states: [],
}))
const revokeLinearOauthTokenMock = mock(async () => undefined)
const refreshLinearOauthTokenMock = mock(async () => ({
  accessToken: 'refreshed-linear-access-token',
  refreshToken: 'refreshed-linear-refresh-token',
  tokenType: 'Bearer',
  expiresIn: 86_399,
  scopes: 'read issues:create',
  accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000),
}))

mock.module('../lib/linear-client', () => ({
  exchangeLinearOauthCode: exchangeLinearOauthCodeMock,
  validateLinearAccessToken: validateLinearAccessTokenMock,
  fetchLinearMetadata: fetchLinearMetadataMock,
  revokeLinearOauthToken: revokeLinearOauthTokenMock,
  refreshLinearOauthToken: refreshLinearOauthTokenMock,
  LinearApiError: class LinearApiError extends Error {
    status = 400
    retryable = false
  },
}))

async function seedOrganization() {
  const db = await getDb()
  const now = new Date()

  await db.insert(organization).values({
    id: TEST_ORG_ID,
    name: 'Alert Global Org',
    slug: 'alert-global-org',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(redisConnection).values([
    {
      id: FIRST_CONNECTION_ID,
      name: 'Primary Redis',
      url: 'redis://localhost:6379/0',
      environment: 'development',
      isDefault: true,
      organizationId: TEST_ORG_ID,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: SECOND_CONNECTION_ID,
      name: 'Worker Redis',
      url: 'redis://localhost:6379/1',
      environment: 'staging',
      isDefault: false,
      organizationId: TEST_ORG_ID,
      createdAt: now,
      updatedAt: now,
    },
  ])
}

async function seedUser(id: string, name: string) {
  const db = await getDb()
  const now = new Date()
  await db.insert(user).values({
    id,
    name,
    email: `${id}@example.com`,
    createdAt: now,
    updatedAt: now,
  })
}

async function createGlobalAlertsRouteApp(options: { includeContext?: boolean } = {}) {
  const { default: alertsGlobalRoutes } = await import('./alerts-global')
  const includeContext = options.includeContext ?? true
  const app = new Hono()

  if (includeContext) {
    app.use('*', async (c, next) => {
      c.set('organizationId', TEST_ORG_ID)
      c.set('user', {
        id: 'user-1',
        email: 'user@example.com',
        name: 'Test User',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await next()
    })
  }

  return app.route('/', alertsGlobalRoutes)
}

describe('global alerts routes', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-alert-global-routes-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    mutableEnv.LINEAR_OAUTH_CLIENT_ID = 'linear-client-id'
    mutableEnv.LINEAR_OAUTH_CLIENT_SECRET = 'linear-client-secret'
    mutableEnv.LINEAR_OAUTH_REDIRECT_URI = LINEAR_CALLBACK_URL
    mutableEnv.LINEAR_OAUTH_ACTOR = 'user'
    mutableEnv.APP_BASE_URL = 'https://app.durabull.test'
    exchangeLinearOauthCodeMock.mockClear()
    validateLinearAccessTokenMock.mockClear()
    fetchLinearMetadataMock.mockClear()
    revokeLinearOauthTokenMock.mockClear()
    refreshLinearOauthTokenMock.mockClear()
    await closeDb()
    await seedOrganization()
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DURABULL_SECRET_ENCRYPTION_KEY = originalSecretKey
    mutableEnv.LINEAR_OAUTH_CLIENT_ID = originalLinearClientId
    mutableEnv.LINEAR_OAUTH_CLIENT_SECRET = originalLinearClientSecret
    mutableEnv.LINEAR_OAUTH_REDIRECT_URI = originalLinearRedirectUri
    mutableEnv.LINEAR_OAUTH_ACTOR = originalLinearActor
    mutableEnv.APP_BASE_URL = originalAppBaseUrl

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

  it('returns organization-wide event history filtered by status', async () => {
    const firstRule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Email failures',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })
    const secondRule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: SECOND_CONNECTION_ID,
      queueName: 'invoice-send',
      name: 'Invoice failures',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    await alertEventRepository.create({
      alertRuleId: firstRule.id,
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      type: firstRule.type,
      status: 'resolved',
      summary: 'Resolved incident',
      context: {},
      firedAt: new Date(Date.now() - 10 * 60_000),
    })
    await alertEventRepository.create({
      alertRuleId: secondRule.id,
      organizationId: TEST_ORG_ID,
      connectionId: SECOND_CONNECTION_ID,
      queueName: 'invoice-send',
      type: secondRule.type,
      status: 'firing',
      summary: 'Active incident',
      context: {},
      firedAt: new Date(),
    })

    const app = await createGlobalAlertsRouteApp()
    const response = await app.request('/events?status=resolved')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      events: [expect.objectContaining({ status: 'resolved', connectionId: FIRST_CONNECTION_ID })],
    })
  })

  it('sanitizes webhook delivery metadata in organization-wide event history', async () => {
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Webhook metadata',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })
    const event = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      type: 'failure_threshold',
      status: 'firing',
      summary: 'Webhook delivery failed',
      context: {},
      firedAt: new Date(),
    })
    await alertDeliveryRepository.enqueueMany([
      {
        alertEventId: event.id,
        organizationId: TEST_ORG_ID,
        channelType: 'webhook',
        target: 'destination:destination-id',
        providerMetadata: {
          type: 'webhook',
          destinationId: 'destination-id',
          url: 'https://example.com/hook',
          encryptedSigningSecret: 'enc:v1:redacted',
          secretConfigured: true,
          secretLast4: 'mnop',
        },
      },
    ])

    const app = await createGlobalAlertsRouteApp()
    const response = await app.request('/events')

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      events: Array<{ deliveries: Array<{ providerMetadata: Record<string, unknown> }> }>
    }
    expect(body.events[0]?.deliveries[0]?.providerMetadata).toEqual({
      type: 'webhook',
      destinationId: 'destination-id',
      url: 'https://example.com/hook',
      secretConfigured: true,
      secretLast4: 'mnop',
    })
  })

  it('returns open incident counts grouped by connection', async () => {
    const firstRule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Email failures',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })
    const secondRule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: SECOND_CONNECTION_ID,
      queueName: 'invoice-send',
      name: 'Invoice failures',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    await alertEventRepository.create({
      alertRuleId: firstRule.id,
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      type: firstRule.type,
      status: 'firing',
      summary: 'Primary incident',
      context: {},
      firedAt: new Date(),
    })
    await alertEventRepository.create({
      alertRuleId: firstRule.id,
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      type: firstRule.type,
      status: 'firing',
      summary: 'Primary incident 2',
      context: {},
      firedAt: new Date(Date.now() - 1_000),
    })
    await alertEventRepository.create({
      alertRuleId: secondRule.id,
      organizationId: TEST_ORG_ID,
      connectionId: SECOND_CONNECTION_ID,
      queueName: 'invoice-send',
      type: secondRule.type,
      status: 'resolved',
      summary: 'Resolved elsewhere',
      context: {},
      firedAt: new Date(),
    })

    const app = await createGlobalAlertsRouteApp()
    const response = await app.request('/summary')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      connections: [
        {
          connectionId: FIRST_CONNECTION_ID,
          firing: 2,
          acknowledged: 0,
          open: 2,
          count: 2,
        },
      ],
    })
  })

  it('splits summary counts between firing and acknowledged and supports org-level ack', async () => {
    await seedUser('user-1', 'Test User')
    const rule = await alertRuleRepository.create({
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      name: 'Email failures',
      type: 'failure_threshold',
      config: { count: 5, windowMinutes: 5 },
      cooldownMinutes: 30,
    })

    const first = await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Incident A',
      context: {},
      firedAt: new Date(),
    })
    await alertEventRepository.create({
      alertRuleId: rule.id,
      organizationId: TEST_ORG_ID,
      connectionId: FIRST_CONNECTION_ID,
      queueName: 'email-send',
      type: rule.type,
      status: 'firing',
      summary: 'Incident B',
      context: {},
      firedAt: new Date(Date.now() - 1_000),
    })

    const app = await createGlobalAlertsRouteApp()

    const ackResponse = await app.request(`/events/${first.id}/acknowledge`, { method: 'POST' })
    expect(ackResponse.status).toBe(200)
    const acked = (await ackResponse.json()) as {
      event: { acknowledgedBy: string | null; acknowledgedByName: string | null }
    }
    expect(acked.event.acknowledgedBy).toBe('user-1')
    expect(acked.event.acknowledgedByName).toBe('Test User')

    const summaryResponse = await app.request('/summary')
    expect(await summaryResponse.json()).toEqual({
      connections: [
        {
          connectionId: FIRST_CONNECTION_ID,
          firing: 1,
          acknowledged: 1,
          open: 2,
          count: 2,
        },
      ],
    })

    const eventsResponse = await app.request('/events?acknowledged=true')
    const events = (await eventsResponse.json()) as {
      events: Array<{ id: string; acknowledgedByName: string | null }>
    }
    expect(events.events).toHaveLength(1)
    expect(events.events[0]?.id).toBe(first.id)
    expect(events.events[0]?.acknowledgedByName).toBe('Test User')

    const resolveResponse = await app.request(`/events/${first.id}/resolve`, { method: 'POST' })
    expect(resolveResponse.status).toBe(200)
  })

  it('stores Linear OAuth tokens encrypted and returns only connection metadata', async () => {
    const app = await createGlobalAlertsRouteApp()
    const connectResponse = await app.request('/integrations/linear/connect', { method: 'POST' })

    expect(connectResponse.status).toBe(200)
    const connectBody = (await connectResponse.json()) as { authorizationUrl: string }
    const authorizeUrl = new URL(connectBody.authorizationUrl)
    expect(`${authorizeUrl.origin}${authorizeUrl.pathname}`).toBe(
      'https://linear.app/oauth/authorize'
    )
    expect(authorizeUrl.searchParams.get('client_id')).toBe('linear-client-id')
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(LINEAR_CALLBACK_URL)
    expect(authorizeUrl.searchParams.get('scope')).toBe('read,issues:create')
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code')
    expect(authorizeUrl.searchParams.get('prompt')).toBe('consent')
    expect(authorizeUrl.searchParams.has('actor')).toBe(false)

    const state = authorizeUrl.searchParams.get('state')
    expect(state).toBeTruthy()

    const callbackResponse = await app.request(
      `/integrations/linear/callback?code=linear-code&state=${state}`
    )
    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get('location')).toBe(
      'https://app.durabull.test/settings?linear=connected'
    )
    expect(exchangeLinearOauthCodeMock).toHaveBeenCalledWith({
      code: 'linear-code',
      redirectUri: LINEAR_CALLBACK_URL,
      clientId: 'linear-client-id',
      clientSecret: 'linear-client-secret',
    })
    expect(validateLinearAccessTokenMock).toHaveBeenCalledWith('linear-access-token')

    const response = await app.request('/integrations/linear')
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      integration: Record<string, unknown>
    }
    expect(body).toMatchObject({
      integration: {
        connected: true,
        validationStatus: 'valid',
        scopes: 'read issues:create',
        linearOrganizationName: 'Acme',
      },
    })
    expect(body.integration).not.toHaveProperty('encryptedAccessToken')
    expect(body.integration).not.toHaveProperty('encryptedRefreshToken')
    expect(body.integration).not.toHaveProperty('accessToken')
    expect(body.integration).not.toHaveProperty('refreshToken')
    expect(body.integration).not.toHaveProperty('token')
    expect(body.integration).not.toHaveProperty('secret')

    const stored = await linearIntegrationRepository.findByOrganization(TEST_ORG_ID)
    expect(stored?.encryptedAccessToken).not.toContain('linear-access-token')
    expect(stored?.encryptedRefreshToken).not.toContain('linear-refresh-token')
    expect(decryptSecret(stored?.encryptedAccessToken ?? '')).toBe('linear-access-token')
    expect(decryptSecret(stored?.encryptedRefreshToken ?? '')).toBe('linear-refresh-token')
  })

  it('completes the OAuth callback with only the opaque state when browser session cookies are unavailable', async () => {
    const app = await createGlobalAlertsRouteApp()
    const connectResponse = await app.request('/integrations/linear/connect', { method: 'POST' })
    const connectBody = (await connectResponse.json()) as { authorizationUrl: string }
    const state = new URL(connectBody.authorizationUrl).searchParams.get('state')
    expect(state).toBeTruthy()

    const callbackApp = await createGlobalAlertsRouteApp({ includeContext: false })
    const callbackResponse = await callbackApp.request(
      `/integrations/linear/callback?code=linear-code&state=${state}`
    )

    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get('location')).toBe(
      'https://app.durabull.test/settings?linear=connected'
    )
    expect(exchangeLinearOauthCodeMock).toHaveBeenCalledWith({
      code: 'linear-code',
      redirectUri: LINEAR_CALLBACK_URL,
      clientId: 'linear-client-id',
      clientSecret: 'linear-client-secret',
    })
    expect(await linearIntegrationRepository.findByOrganization(TEST_ORG_ID)).toMatchObject({
      validationStatus: 'valid',
      linearOrganizationName: 'Acme',
    })
  })

  it('uses the deployment app base URL as the default OAuth callback for cloud and self-hosted installs', async () => {
    mutableEnv.LINEAR_OAUTH_REDIRECT_URI = undefined
    mutableEnv.APP_BASE_URL = 'https://self-hosted.example.com///'

    const app = await createGlobalAlertsRouteApp()
    const response = await app.request('/integrations/linear/connect', { method: 'POST' })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { authorizationUrl: string }
    const authorizeUrl = new URL(body.authorizationUrl)
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
      'https://self-hosted.example.com/api/alerts/integrations/linear/callback'
    )
  })

  it('only sends Linear app actor authorization when explicitly configured', async () => {
    mutableEnv.LINEAR_OAUTH_ACTOR = 'app'

    const app = await createGlobalAlertsRouteApp()
    const response = await app.request('/integrations/linear/connect', { method: 'POST' })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { authorizationUrl: string }
    const authorizeUrl = new URL(body.authorizationUrl)
    expect(authorizeUrl.searchParams.get('actor')).toBe('app')
  })

  it('rejects OAuth callbacks with an invalid state before exchanging the authorization code', async () => {
    const app = await createGlobalAlertsRouteApp()
    const connectResponse = await app.request('/integrations/linear/connect', { method: 'POST' })
    const { authorizationUrl } = (await connectResponse.json()) as { authorizationUrl: string }
    const state = new URL(authorizationUrl).searchParams.get('state')

    const invalidResponse = await app.request(
      '/integrations/linear/callback?code=linear-code&state=attacker-state'
    )
    expect(invalidResponse.status).toBe(400)
    expect(exchangeLinearOauthCodeMock).not.toHaveBeenCalled()

    const validResponse = await app.request(
      `/integrations/linear/callback?code=linear-code&state=${state}`
    )
    expect(validResponse.status).toBe(302)
    expect(exchangeLinearOauthCodeMock).toHaveBeenCalledTimes(1)
  })

  it('does not allow replaying a consumed OAuth state', async () => {
    const app = await createGlobalAlertsRouteApp()
    const connectResponse = await app.request('/integrations/linear/connect', { method: 'POST' })
    const { authorizationUrl } = (await connectResponse.json()) as { authorizationUrl: string }
    const state = new URL(authorizationUrl).searchParams.get('state')

    const firstResponse = await app.request(
      `/integrations/linear/callback?code=linear-code&state=${state}`
    )
    const replayResponse = await app.request(
      `/integrations/linear/callback?code=linear-code&state=${state}`
    )

    expect(firstResponse.status).toBe(302)
    expect(replayResponse.status).toBe(400)
    expect(exchangeLinearOauthCodeMock).toHaveBeenCalledTimes(1)
  })

  it('rejects expired OAuth state records', async () => {
    const app = await createGlobalAlertsRouteApp()
    await linearOauthStateRepository.create({
      organizationId: TEST_ORG_ID,
      userId: 'user-1',
      state: 'expired-state',
      redirectUri: LINEAR_CALLBACK_URL,
      expiresAt: new Date(Date.now() - 1_000),
    })

    const response = await app.request(
      '/integrations/linear/callback?code=linear-code&state=expired-state'
    )

    expect(response.status).toBe(400)
    expect(exchangeLinearOauthCodeMock).not.toHaveBeenCalled()
  })

  it('returns a setup error when Linear OAuth client credentials are missing', async () => {
    mutableEnv.LINEAR_OAUTH_CLIENT_SECRET = undefined

    const app = await createGlobalAlertsRouteApp()
    const response = await app.request('/integrations/linear/connect', { method: 'POST' })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'LINEAR_OAUTH_CLIENT_ID and LINEAR_OAUTH_CLIENT_SECRET are required.',
    })
  })

  it('refreshes expired access tokens before fetching Linear metadata and persists rotated tokens', async () => {
    await linearIntegrationRepository.upsertOauth({
      organizationId: TEST_ORG_ID,
      accessToken: 'expired-linear-access-token',
      refreshToken: 'old-linear-refresh-token',
      tokenType: 'Bearer',
      scopes: 'read issues:create',
      accessTokenExpiresAt: new Date(Date.now() - 60_000),
      validationStatus: 'valid',
      lastValidatedAt: new Date(),
    })

    const app = await createGlobalAlertsRouteApp()
    const response = await app.request('/integrations/linear/metadata')

    expect(response.status).toBe(200)
    expect(refreshLinearOauthTokenMock).toHaveBeenCalledWith({
      refreshToken: 'old-linear-refresh-token',
      clientId: 'linear-client-id',
      clientSecret: 'linear-client-secret',
    })
    expect(fetchLinearMetadataMock).toHaveBeenCalledWith('refreshed-linear-access-token')

    const stored = await linearIntegrationRepository.findByOrganization(TEST_ORG_ID)
    expect(decryptSecret(stored?.encryptedAccessToken ?? '')).toBe('refreshed-linear-access-token')
    expect(decryptSecret(stored?.encryptedRefreshToken ?? '')).toBe(
      'refreshed-linear-refresh-token'
    )
  })

  it('revokes stored OAuth tokens on disconnect without exposing token values', async () => {
    await linearIntegrationRepository.upsertOauth({
      organizationId: TEST_ORG_ID,
      accessToken: 'linear-access-token-to-revoke',
      refreshToken: 'linear-refresh-token-to-revoke',
      tokenType: 'Bearer',
      scopes: 'read issues:create',
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000),
      validationStatus: 'valid',
      lastValidatedAt: new Date(),
    })

    const app = await createGlobalAlertsRouteApp()
    const response = await app.request('/integrations/linear', { method: 'DELETE' })

    expect(response.status).toBe(200)
    expect(revokeLinearOauthTokenMock).toHaveBeenCalledWith({
      token: 'linear-refresh-token-to-revoke',
      tokenTypeHint: 'refresh_token',
      clientId: 'linear-client-id',
      clientSecret: 'linear-client-secret',
    })
    expect(revokeLinearOauthTokenMock).toHaveBeenCalledWith({
      token: 'linear-access-token-to-revoke',
      tokenTypeHint: 'access_token',
      clientId: 'linear-client-id',
      clientSecret: 'linear-client-secret',
    })
    expect(await linearIntegrationRepository.findByOrganization(TEST_ORG_ID)).toBeNull()
  })
})
