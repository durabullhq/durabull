import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb } from '@durabull/dal'
import { env } from '@durabull/env'
import { MCP_OAUTH_SCOPES_SUPPORTED, MCP_PHASE1_SCOPES, MCP_WRITE_SCOPES } from '@durabull/mcp/auth'
import { type Auth, createAuth } from './index'

const baseURL = 'http://localhost:5173'
const redirectURI = 'http://127.0.0.1:8765/callback'
const verifier = 'oauth-regression-test-verifier-with-at-least-43-characters'
const originalDatabaseUrl = env.DATABASE_URL
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR
let dataDir: string
let auth: Auth
let cookie: string
let clientId: string

async function request(path: string, body?: Record<string, unknown>, sessionCookie?: string) {
  return auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'content-type': 'application/json',
        origin: baseURL,
        ...(sessionCookie ? { cookie: sessionCookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  )
}

function authorizeParams(scopes: readonly string[]) {
  return new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectURI,
    response_type: 'code',
    scope: scopes.join(' '),
    state: 'chatgpt-connect',
    prompt: 'consent',
    resource: `${baseURL}/mcp`,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  })
}

async function consentAndExchange(params: URLSearchParams) {
  const response = await request(`/mcp/authorize?${params}`, undefined, cookie)
  expect(response.status).toBe(302)
  expect(response.headers.get('location')).toStartWith('/consent?')
  const consentURL = new URL(response.headers.get('location')!, baseURL)
  expect(consentURL.searchParams.get('scope')?.split(' ').sort()).toEqual(
    params.get('scope')!.split(' ').sort()
  )
  const consent = await request(
    '/oauth2/consent',
    {
      accept: true,
      consent_code: consentURL.searchParams.get('consent_code'),
    },
    cookie
  )
  expect(consent.status).toBe(200)
  const callback = new URL((await consent.json()).redirectURI)
  expect(callback.origin + callback.pathname).toBe(redirectURI)
  expect(callback.searchParams.get('state')).toBe('chatgpt-connect')
  const token = await auth.handler(
    new Request(`${baseURL}/api/auth/mcp/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: callback.searchParams.get('code')!,
        redirect_uri: redirectURI,
        client_id: clientId,
        code_verifier: verifier,
        resource: `${baseURL}/mcp`,
      }),
    })
  )
  expect(token.status).toBe(200)
  const body = await token.json()
  expect(body.scope.split(' ').sort()).toEqual(params.get('scope')!.split(' ').sort())
  const session = await auth.handler(
    new Request(`${baseURL}/api/auth/mcp/get-session`, {
      headers: { authorization: `Bearer ${body.access_token}` },
    })
  )
  expect(session.status).toBe(200)
  expect(await session.json()).not.toBeNull()
}

describe('MCP OAuth advertised scopes', () => {
  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'durabull-mcp-oauth-'))
    process.env.DURABULL_PGLITE_DIR = dataDir
    env.DATABASE_URL = undefined
    await closeDb()
    auth = await createAuth({ baseURL })
    const signup = await request('/sign-up/email', {
      name: 'OAuth regression',
      email: 'oauth-regression@example.com',
      password: 'test-password-123',
    })
    expect(signup.status).toBe(200)
    cookie = signup.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    const registration = await request('/mcp/register', {
      redirect_uris: [redirectURI],
      client_name: 'ChatGPT scope regression',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    })
    expect(registration.status).toBe(201)
    clientId = (await registration.json()).client_id
  }, 30_000)

  afterAll(async () => {
    await closeDb()
    env.DATABASE_URL = originalDatabaseUrl
    if (originalPgliteDir === undefined) delete process.env.DURABULL_PGLITE_DIR
    else process.env.DURABULL_PGLITE_DIR = originalPgliteDir
    await rm(dataDir, { recursive: true, force: true })
  })

  it('sends a signed-in client requesting advertised scopes to consent', async () => {
    await consentAndExchange(authorizeParams(MCP_OAUTH_SCOPES_SUPPORTED))
  })

  it.each([
    ...MCP_WRITE_SCOPES,
  ])('authorizes the explicitly requested write scope %s', async (scope) => {
    await consentAndExchange(authorizeParams(['openid', ...MCP_PHASE1_SCOPES, scope]))
  })

  it('does not grant write scopes to a read-only authorization', async () => {
    await consentAndExchange(authorizeParams(['openid', ...MCP_PHASE1_SCOPES]))
  })

  it('preserves the full request through logged-out login and resumes at consent', async () => {
    const params = authorizeParams(MCP_OAUTH_SCOPES_SUPPORTED)
    const response = await request(`/mcp/authorize?${params}`)
    expect(response.status).toBe(302)
    const loginURL = new URL(response.headers.get('location')!, baseURL)
    expect(loginURL.pathname).toBe('/login')
    expect(loginURL.searchParams.toString()).toBe(params.toString())
    const loginCookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    const signIn = await request(
      '/sign-in/email',
      {
        email: 'oauth-regression@example.com',
        password: 'test-password-123',
      },
      loginCookie
    )
    expect(signIn.status).toBe(302)
    expect(signIn.headers.get('location')).toStartWith('/consent?')
  })
})
