import { createHash, randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  MCP_LEGACY_PROTOCOL_VERSION as MCP_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION as MCP_CURRENT_PROTOCOL_VERSION,
} from '../../../packages/mcp/src/constants'

const MCP_JSON_RPC_VERSION = '2.0'

const WEB_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'
const WEB_ORIGIN = WEB_BASE_URL.replace(/\/$/, '')
const CANONICAL_MCP_RESOURCE = `${WEB_ORIGIN}/mcp`
const MCP_CALLBACK_URL = 'http://127.0.0.1:8765/callback'
const E2E_ADMIN_EMAIL = 'admin@example.com'
const E2E_ADMIN_PASSWORD = 'password'

const EMPTY_STORAGE_STATE = { cookies: [] as [], origins: [] as [] }

function parseSseJson(body: string): unknown {
  const trimmed = body.trim()
  const lastEvent = trimmed.split('\n\n').at(-1) ?? trimmed
  const dataLines = lastEvent
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
  return JSON.parse(dataLines.join('\n') || trimmed)
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64url')
}

function createPkcePair() {
  const codeVerifier = base64UrlEncode(randomBytes(32))
  const codeChallenge = base64UrlEncode(createHash('sha256').update(codeVerifier).digest())
  return { codeVerifier, codeChallenge }
}

function parseResourceMetadataUrl(wwwAuthenticate: string | null): string {
  expect(wwwAuthenticate, 'WWW-Authenticate header required').toBeTruthy()
  const match = wwwAuthenticate!.match(/resource_metadata="([^"]+)"/)
  expect(match, `resource_metadata not found in: ${wwwAuthenticate}`).toBeTruthy()
  return match![1]
}

type ProtectedResourceMetadata = {
  resource?: string
  authorization_servers?: string[]
  scopes_supported?: string[]
}

async function fetchProtectedResourceMetadata(url: string): Promise<ProtectedResourceMetadata> {
  const response = await fetch(url)
  const text = await response.text()
  expect(response.ok, `PRM fetch failed ${url}: ${response.status} ${text}`).toBeTruthy()
  return JSON.parse(text) as ProtectedResourceMetadata
}

async function assertProtectedResourceMetadataAt(url: string): Promise<ProtectedResourceMetadata> {
  const metadata = await fetchProtectedResourceMetadata(url)
  expect(metadata.resource).toBe(CANONICAL_MCP_RESOURCE)
  expect(metadata.authorization_servers?.length).toBeGreaterThan(0)
  expect(metadata.scopes_supported).toContain('mcp:discover')
  return metadata
}

async function registerMcpOAuthClient() {
  const response = await fetch(`${WEB_BASE_URL}/api/auth/mcp/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      redirect_uris: [MCP_CALLBACK_URL],
      client_name: `playwright-mcp-oauth-${Date.now()}`,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    }),
  })
  const text = await response.text()
  expect(response.ok, `register failed: ${response.status} ${text}`).toBeTruthy()
  const body = JSON.parse(text) as { client_id?: string }
  expect(body.client_id).toBeTruthy()
  return body.client_id as string
}

function buildAuthorizeUrl(input: {
  clientId: string
  resource: string
  codeChallenge: string
  state: string
}) {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: MCP_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid mcp:discover',
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    resource: input.resource,
    prompt: 'consent',
  })
  return `${WEB_BASE_URL}/api/auth/mcp/authorize?${params.toString()}`
}

async function exchangeAuthorizationCode(input: {
  code: string
  clientId: string
  codeVerifier: string
  resource: string
}) {
  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: MCP_CALLBACK_URL,
    client_id: input.clientId,
    code_verifier: input.codeVerifier,
    resource: input.resource,
  })
  const tokenResponse = await fetch(`${WEB_BASE_URL}/api/auth/mcp/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  })
  const tokenText = await tokenResponse.text()
  expect(tokenResponse.ok, `token failed: ${tokenResponse.status} ${tokenText}`).toBeTruthy()
  const tokenBody = JSON.parse(tokenText) as { access_token?: string; scope?: string }
  expect(tokenBody.access_token).toBeTruthy()
  expect(tokenBody.scope).toContain('mcp:discover')
  return tokenBody.access_token as string
}

async function mcpPingWithToken(accessToken: string) {
  const mcpHost = new URL(CANONICAL_MCP_RESOURCE).host
  // A freshly issued OAuth token must work without a transport handshake.
  const directPing = await fetch(CANONICAL_MCP_RESOURCE, {
    method: 'POST',
    headers: {
      host: mcpHost,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'Mcp-Protocol-Version': MCP_CURRENT_PROTOCOL_VERSION,
      'Mcp-Method': 'tools/call',
      'Mcp-Name': 'ping',
    },
    body: JSON.stringify({
      jsonrpc: MCP_JSON_RPC_VERSION,
      id: 0,
      method: 'tools/call',
      params: { name: 'ping', arguments: {} },
    }),
  })
  expect(directPing.status).toBe(200)
  expect(directPing.headers.get('mcp-session-id')).toBeNull()
  expect(directPing.headers.get('Mcp-Protocol-Version')).toBe(MCP_CURRENT_PROTOCOL_VERSION)
  const directBody = parseSseJson(await directPing.text()) as {
    result?: { content?: Array<{ text?: string }> }
  }
  expect(directBody.result?.content?.[0]?.text).toContain('pong')

  const initResponse = await fetch(CANONICAL_MCP_RESOURCE, {
    method: 'POST',
    headers: {
      host: mcpHost,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      jsonrpc: MCP_JSON_RPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'playwright-mcp-oauth', version: '1.0.0' },
      },
    }),
  })

  const initText = await initResponse.text()
  expect(initResponse.status, `initialize failed: ${initResponse.status} ${initText}`).toBe(200)
  expect(initResponse.headers.get('mcp-session-id')).toBeNull()

  const initBody = parseSseJson(initText) as {
    result?: { serverInfo?: { name?: string } }
  }
  expect(initBody.result?.serverInfo?.name).toBe('durabull-mcp')

  await fetch(CANONICAL_MCP_RESOURCE, {
    method: 'POST',
    headers: {
      host: mcpHost,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'Mcp-Protocol-Version': MCP_PROTOCOL_VERSION,
    },
    body: JSON.stringify({
      jsonrpc: MCP_JSON_RPC_VERSION,
      method: 'notifications/initialized',
    }),
  })

  const pingResponse = await fetch(CANONICAL_MCP_RESOURCE, {
    method: 'POST',
    headers: {
      host: mcpHost,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'Mcp-Protocol-Version': MCP_PROTOCOL_VERSION,
    },
    body: JSON.stringify({
      jsonrpc: MCP_JSON_RPC_VERSION,
      id: 2,
      method: 'tools/call',
      params: { name: 'ping', arguments: {} },
    }),
  })

  expect(pingResponse.ok).toBeTruthy()
  const pingBody = parseSseJson(await pingResponse.text()) as {
    result?: { content?: Array<{ text?: string }> }
  }
  expect(pingBody.result?.content?.[0]?.text).toContain('pong')
}

test.describe('MCP OAuth discovery (automatic auth)', () => {
  test('unauthenticated POST /mcp returns WWW-Authenticate and PRM chain', async () => {
    const mcpHost = new URL(CANONICAL_MCP_RESOURCE).host
    const challengeResponse = await fetch(CANONICAL_MCP_RESOURCE, {
      method: 'POST',
      headers: {
        host: mcpHost,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'playwright-mcp-discovery', version: '1.0.0' },
        },
      }),
    })

    expect(challengeResponse.status).toBe(401)
    const wwwAuthenticate = challengeResponse.headers.get('WWW-Authenticate')
    const resourceMetadataUrl = parseResourceMetadataUrl(wwwAuthenticate)

    const fromChallenge = await assertProtectedResourceMetadataAt(resourceMetadataUrl)
    const fromAppRoot = await assertProtectedResourceMetadataAt(
      `${WEB_ORIGIN}/.well-known/oauth-protected-resource`
    )
    const fromAuthPath = await assertProtectedResourceMetadataAt(
      `${WEB_ORIGIN}/api/auth/.well-known/oauth-protected-resource`
    )

    expect(fromChallenge.authorization_servers).toEqual(fromAppRoot.authorization_servers)
    expect(fromAuthPath.resource).toBe(fromAppRoot.resource)

    const authorizationServer = fromChallenge.authorization_servers![0]!
    const asMetadataResponse = await fetch(
      `${authorizationServer}/.well-known/oauth-authorization-server`
    )
    const asText = await asMetadataResponse.text()
    expect(
      asMetadataResponse.ok,
      `AS metadata failed: ${asMetadataResponse.status} ${asText}`
    ).toBeTruthy()
    const asMetadata = JSON.parse(asText) as {
      authorization_endpoint?: string
      token_endpoint?: string
      registration_endpoint?: string
    }
    expect(asMetadata.authorization_endpoint).toContain('/api/auth/mcp/authorize')
    expect(asMetadata.token_endpoint).toContain('/api/auth/mcp/token')
    expect(asMetadata.registration_endpoint).toContain('/api/auth/mcp/register')

    const clientId = await registerMcpOAuthClient()
    expect(clientId.length).toBeGreaterThan(0)
  })
})

test.describe('MCP OAuth browser flow', () => {
  test('register → authorize → consent → token → MCP ping', async ({ page }) => {
    const resource = CANONICAL_MCP_RESOURCE
    const clientId = await registerMcpOAuthClient()
    const { codeVerifier, codeChallenge } = createPkcePair()
    const state = `pw-${randomBytes(8).toString('hex')}`

    const authorizeUrl = buildAuthorizeUrl({
      clientId,
      resource,
      codeChallenge,
      state,
    })

    let authorizationCode: string | null = null
    let callbackState: string | null = null
    await page.route(`${MCP_CALLBACK_URL}**`, async (route) => {
      const callbackUrl = new URL(route.request().url())
      authorizationCode = callbackUrl.searchParams.get('code')
      callbackState = callbackUrl.searchParams.get('state')
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'ok',
      })
    })

    await page.goto(authorizeUrl, { waitUntil: 'domcontentloaded' })

    await expect(page).toHaveURL(/\/consent/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Authorize application' })).toBeVisible()
    await expect(page.getByTestId('mcp-consent-allow')).toBeEnabled({ timeout: 30_000 })

    await page.getByTestId('mcp-consent-allow').click()
    await expect.poll(() => authorizationCode, { timeout: 30_000 }).not.toBeNull()

    expect(authorizationCode).toBeTruthy()
    expect(callbackState).toBe(state)
    const code = authorizationCode!
    expect(code.length).toBeGreaterThan(0)

    const accessToken = await exchangeAuthorizationCode({
      code,
      clientId,
      codeVerifier,
      resource,
    })

    const sessionCheck = await fetch(`${WEB_BASE_URL}/api/auth/mcp/get-session`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    const sessionBody = await sessionCheck.json()
    expect(sessionCheck.ok, `get-session failed: ${JSON.stringify(sessionBody)}`).toBeTruthy()
    expect(sessionBody).not.toBeNull()

    await mcpPingWithToken(accessToken)
  })

  test('deny on consent redirects with access_denied', async ({ page }) => {
    const clientId = await registerMcpOAuthClient()
    const { codeChallenge } = createPkcePair()
    const state = `pw-deny-${randomBytes(8).toString('hex')}`
    const authorizeUrl = buildAuthorizeUrl({
      clientId,
      resource: CANONICAL_MCP_RESOURCE,
      codeChallenge,
      state,
    })

    let callbackError: string | null = null
    await page.route(`${MCP_CALLBACK_URL}**`, async (route) => {
      const callbackUrl = new URL(route.request().url())
      callbackError = callbackUrl.searchParams.get('error')
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'ok',
      })
    })

    await page.goto(authorizeUrl, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/consent/, { timeout: 30_000 })
    await expect(page.getByTestId('mcp-consent-deny')).toBeEnabled({ timeout: 30_000 })

    await page.getByTestId('mcp-consent-deny').click()
    await expect.poll(() => callbackError, { timeout: 30_000 }).toBe('access_denied')
  })
})

test.describe('MCP OAuth browser flow (logged out)', () => {
  test.use({ storageState: EMPTY_STORAGE_STATE })

  test('authorize → login → consent → token', async ({ page }) => {
    test.setTimeout(60_000)

    const clientId = await registerMcpOAuthClient()
    const { codeVerifier, codeChallenge } = createPkcePair()
    const state = `pw-login-${randomBytes(8).toString('hex')}`
    const authorizeUrl = buildAuthorizeUrl({
      clientId,
      resource: CANONICAL_MCP_RESOURCE,
      codeChallenge,
      state,
    })

    let authorizationCode: string | null = null
    await page.route(`${MCP_CALLBACK_URL}**`, async (route) => {
      const callbackUrl = new URL(route.request().url())
      authorizationCode = callbackUrl.searchParams.get('code')
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'ok',
      })
    })

    await page.goto(authorizeUrl, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 })
    await expect(page.getByTestId('login-form')).toBeVisible()

    await page.fill('input[id="email"]', E2E_ADMIN_EMAIL)
    await page.fill('input[id="password"]', E2E_ADMIN_PASSWORD)
    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes('/api/auth/sign-in'), {
        timeout: 30_000,
      }),
      page.getByTestId('login-form').locator('button[type="submit"]').click(),
    ])

    await expect(page).toHaveURL(/\/consent/, { timeout: 30_000 })
    await expect(page.getByTestId('mcp-consent-allow')).toBeEnabled({ timeout: 30_000 })
    await page.getByTestId('mcp-consent-allow').click()
    await expect.poll(() => authorizationCode, { timeout: 30_000 }).not.toBeNull()
    expect(authorizationCode).toBeTruthy()
    const code = authorizationCode!
    expect(code.length).toBeGreaterThan(0)

    const accessToken = await exchangeAuthorizationCode({
      code,
      clientId,
      codeVerifier,
      resource: CANONICAL_MCP_RESOURCE,
    })

    await mcpPingWithToken(accessToken)
  })
})
