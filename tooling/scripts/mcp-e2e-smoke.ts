#!/usr/bin/env bun
import '@durabull/env'

/**
 * Live MCP end-to-end smoke against a running API server.
 *
 * Usage:
 *   APP_BASE_URL=http://localhost:3001 bun tooling/scripts/mcp-e2e-smoke.ts
 *
 * With Better Auth (default): seeds short-lived tokens via DB when DATABASE_URL is set.
 * With authless: set DURABULL_AUTHLESS=true and use durabull-authless-mcp bearer.
 */

import { getDb, oauthAccessToken, user } from '@durabull/dal'
import { MCP_LEGACY_PROTOCOL_VERSION as MCP_PROTOCOL_VERSION } from '@durabull/mcp'
import { MCP_JSON_RPC_VERSION, parseSseJson } from '@durabull/mcp/testing'

const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3001'
const host = new URL(baseUrl).host
const authless = process.env.DURABULL_AUTHLESS === 'true'
const authlessToken =
  process.env.MCP_AUTHLESS_BEARER_TOKEN?.trim() || 'durabull-authless-mcp'

type CheckResult = { name: string; pass: boolean; detail: string }

const results: CheckResult[] = []

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail })
  const icon = pass ? 'PASS' : 'FAIL'
  console.log(`[${icon}] ${name}: ${detail}`)
}

async function mcpPost(
  body: Record<string, unknown>,
  options: { token?: string; sessionId?: string } = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    host,
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
  }
  if (options.token) headers.authorization = `Bearer ${options.token}`
  if (options.sessionId) headers['mcp-session-id'] = options.sessionId

  return fetch(`${baseUrl}/mcp`, { method: 'POST', headers, body: JSON.stringify(body) })
}

async function seedOAuthTokens(clientId: string) {
  const db = await getDb()
  const [firstUser] = await db.select({ id: user.id }).from(user).limit(1)
  const userId = firstUser?.id ?? null
  const exp = new Date(Date.now() + 3600_000)

  const resource = `${new URL(baseUrl).origin}/mcp`

  async function insert(label: string, scopes: string, expiresAt: Date) {
    const accessToken = `e2e-${label}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
    await db.insert(oauthAccessToken).values({
      id: crypto.randomUUID(),
      accessToken,
      refreshToken: `refresh-${accessToken}`,
      accessTokenExpiresAt: expiresAt,
      refreshTokenExpiresAt: expiresAt,
      clientId,
      userId,
      scopes,
      resource,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    return accessToken
  }

  const valid = await insert('valid', 'mcp:discover openid', exp)
  const badScope = await insert('badscope', 'openid', exp)
  const expired = await insert('expired', 'mcp:discover', new Date(Date.now() - 60_000))

  return { valid, badScope, expired }
}

async function main() {
  console.log(`\nMCP E2E smoke → ${baseUrl}/mcp (authless=${authless})\n`)

  // Discovery
  const prmRes = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`)
  const expectedResource = `${new URL(baseUrl).origin}/mcp`
  const prm = (await prmRes.json()) as { resource?: string }
  record(
    'PRM app origin',
    prmRes.ok && prm.resource === expectedResource,
    `HTTP ${prmRes.status}, resource=${prm.resource ?? 'missing'} (expected ${expectedResource})`
  )

  const noAuth = await mcpPost({
    jsonrpc: MCP_JSON_RPC_VERSION,
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'e2e', version: '1.0.0' },
    },
  })
  record(
    'MCP without bearer',
    noAuth.status === 401 && !!noAuth.headers.get('www-authenticate'),
    `HTTP ${noAuth.status}`
  )

  let validToken = authlessToken

  if (!authless) {
    const regRes = await fetch(`${baseUrl}/api/auth/mcp/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['http://127.0.0.1:8765/callback'],
        client_name: 'mcp-e2e-smoke',
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code'],
        response_types: ['code'],
      }),
    })
    const reg = (await regRes.json()) as { client_id?: string }
    if (!reg.client_id) {
      record('OAuth client registration', false, `HTTP ${regRes.status}`)
      summarize()
      process.exit(1)
    }
    record('OAuth client registration', true, `client_id=${reg.client_id}`)

    const seeded = await seedOAuthTokens(reg.client_id)
    validToken = seeded.valid

    const badScopeRes = await mcpPost(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'e2e', version: '1.0.0' },
        },
      },
      { token: seeded.badScope }
    )
    record('Insufficient scope', badScopeRes.status === 403, `HTTP ${badScopeRes.status}`)

    const expiredRes = await mcpPost(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'e2e', version: '1.0.0' },
        },
      },
      { token: seeded.expired }
    )
    record('Expired token', expiredRes.status === 401, `HTTP ${expiredRes.status}`)
  } else {
    record('Insufficient scope', true, 'skipped (authless mode)')
    record('Expired token', true, 'skipped (authless mode)')
  }

  const initRes = await mcpPost(
    {
      jsonrpc: MCP_JSON_RPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'e2e', version: '1.0.0' },
      },
    },
    { token: validToken }
  )
  const sessionId = initRes.headers.get('mcp-session-id') ?? undefined
  const initBody = parseSseJson(await initRes.text()) as {
    result?: { serverInfo?: { name?: string } }
  }
  record(
    'Legacy initialize (stateless)',
    initRes.ok && initBody.result?.serverInfo?.name === 'durabull-mcp',
    `HTTP ${initRes.status}, session=${sessionId ?? 'none'}`
  )

  if (initRes.ok) {
    await mcpPost(
      { jsonrpc: MCP_JSON_RPC_VERSION, method: 'notifications/initialized' },
      { token: validToken, sessionId }
    )

    const listRes = await mcpPost(
      { jsonrpc: MCP_JSON_RPC_VERSION, id: 2, method: 'tools/list', params: {} },
      { token: validToken, sessionId }
    )
    const listBody = parseSseJson(await listRes.text()) as {
      result?: { tools?: Array<{ name: string }> }
    }
    const tools = listBody.result?.tools?.map((t) => t.name) ?? []
    record('tools/list', listRes.ok && tools.includes('ping'), `tools=${tools.join(',') || 'none'}`)

    const callRes = await mcpPost(
      {
        jsonrpc: MCP_JSON_RPC_VERSION,
        id: 3,
        method: 'tools/call',
        params: { name: 'ping', arguments: {} },
      },
      { token: validToken, sessionId }
    )
    const callBody = parseSseJson(await callRes.text()) as {
      result?: { content?: Array<{ text?: string }> }
    }
    record(
      'tools/call ping',
      callRes.ok && callBody.result?.content?.[0]?.text === 'pong',
      `text=${callBody.result?.content?.[0]?.text ?? 'missing'}`
    )

    const noSessionRes = await mcpPost(
      { jsonrpc: MCP_JSON_RPC_VERSION, id: 4, method: 'tools/list', params: {} },
      { token: validToken }
    )
    record('Stateless tools/list', noSessionRes.status === 200, `HTTP ${noSessionRes.status}`)
  }

  const badHost = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      host: 'evil.example.com',
      authorization: `Bearer ${validToken}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: MCP_JSON_RPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'e2e', version: '1.0.0' },
      },
    }),
  })
  record('Host allowlist', badHost.status === 403, `HTTP ${badHost.status}`)

  summarize()
  process.exit(results.some((r) => !r.pass) ? 1 : 0)
}

function summarize() {
  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} checks passed\n`)
}

void main()
