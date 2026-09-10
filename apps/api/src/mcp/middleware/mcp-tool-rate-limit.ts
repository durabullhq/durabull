import { createHash } from 'node:crypto'
import { env } from '@durabull/env'
import { isMcpHeavyTool } from '@durabull/mcp'
import { extractBearerToken } from '@durabull/mcp/auth'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import { hashMcpToolInput, writeMcpAuditEventNonBlocking } from '../audit/mcp-audit'
import {
  isMcpResourcesReadMethod,
  isMcpToolsCallMethod,
  parseMcpJsonRpcPayloadId,
  parseMcpPolicyOperation,
} from '../json-rpc-tool-call'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

const DEFAULT_TOOL_WINDOW_MS = 60 * 1000
const DEFAULT_TOOL_LIMIT = 60
const HEAVY_TOOL_LIMIT = 30
const MAX_RATE_LIMIT_ENTRIES = 4096

let forceToolRateLimitInTests = false

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60 * 1000)

function shouldSkipToolRateLimiting(): boolean {
  if (forceToolRateLimitInTests) return false
  if (env.DISABLE_RATE_LIMIT === true) return true
  if (env.NODE_ENV === 'test') return true
  if (env.NODE_ENV === 'development' || env.NODE_ENV === undefined) return true
  return false
}

function evictRateLimitEntriesIfNeeded(nextKey: string): void {
  if (rateLimitStore.size < MAX_RATE_LIMIT_ENTRIES || rateLimitStore.has(nextKey)) {
    return
  }

  const overflow = rateLimitStore.size - MAX_RATE_LIMIT_ENTRIES + 1
  const keysToDelete = [...rateLimitStore.keys()].slice(0, overflow)
  for (const key of keysToDelete) {
    rateLimitStore.delete(key)
  }
}

function resolveRateLimitAuditPrincipal(c: Context, principalKey: string) {
  const session = c.get('mcpSession')
  if (session?.userId) {
    return {
      principalType: 'delegated_user' as const,
      principalId: session.userId,
    }
  }
  if (session?.clientId) {
    return {
      principalType: 'service_account' as const,
      principalId: session.clientId,
    }
  }
  return {
    principalType: 'service_account' as const,
    principalId: principalKey,
  }
}

function principalRateLimitKey(c: Context): string {
  const bearerToken = extractBearerToken(c.req.header('Authorization'))
  if (bearerToken) {
    return createHash('sha256').update(bearerToken).digest('hex').slice(0, 24)
  }
  return 'anonymous'
}

/** Heavy tools (per the catalog) get the lower limit; resources use the default. */
function toolLimitForName(toolName: string): number {
  return isMcpHeavyTool(toolName) ? HEAVY_TOOL_LIMIT : DEFAULT_TOOL_LIMIT
}

function jsonRpcRateLimitResponse(
  c: Context,
  payloadId: string | number | null,
  retryAfterSeconds: number
) {
  return c.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32_029,
        message: 'Rate limit exceeded for this MCP tool. Please slow down.',
        data: {
          retryAfter: retryAfterSeconds,
        },
      },
      id: payloadId,
    },
    429
  )
}

async function readMcpRequestBody(c: Context): Promise<unknown> {
  const cached = c.get('mcpRequestJsonBody')
  if (cached !== undefined) {
    return cached
  }

  const body = await c.req.raw
    .clone()
    .json()
    .catch(() => null)
  c.set('mcpRequestJsonBody', body)
  return body
}

export function createMcpToolRateLimitMiddleware() {
  return createMiddleware(async (c, next) => {
    if (c.req.method !== 'POST') {
      return next()
    }

    const body = await readMcpRequestBody(c)
    if (!isMcpToolsCallMethod(body) && !isMcpResourcesReadMethod(body)) {
      return next()
    }

    const operation = parseMcpPolicyOperation(body)
    const toolCall = operation
      ? {
          toolName: operation.name,
          arguments: operation.arguments,
          connectionId: operation.connectionId,
          payloadId: operation.payloadId,
        }
      : {
          toolName: isMcpToolsCallMethod(body)
            ? '__invalid_tools_call__'
            : '__invalid_resources_read__',
          arguments: {},
          connectionId: null,
          payloadId: parseMcpJsonRpcPayloadId(body),
        }

    if (shouldSkipToolRateLimiting()) {
      return next()
    }

    const principalKey = principalRateLimitKey(c)
    const limit = toolLimitForName(toolCall.toolName)
    const key = `mcp-tool:${principalKey}:${toolCall.toolName}`
    const now = Date.now()

    if (rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES && !rateLimitStore.has(key)) {
      evictRateLimitEntriesIfNeeded(key)
    }

    let entry = rateLimitStore.get(key)
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + DEFAULT_TOOL_WINDOW_MS }
    }

    entry.count += 1
    rateLimitStore.set(key, entry)

    const remaining = Math.max(0, limit - entry.count)
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)
    c.header('X-RateLimit-Limit', limit.toString())
    c.header('X-RateLimit-Remaining', remaining.toString())
    c.header('X-RateLimit-Reset', retryAfterSeconds.toString())

    if (entry.count > limit) {
      c.header('Retry-After', retryAfterSeconds.toString())

      const auditPrincipal = resolveRateLimitAuditPrincipal(c, principalKey)
      const correlationId = c.req.header('x-request-id') ?? crypto.randomUUID()
      writeMcpAuditEventNonBlocking({
        correlationId,
        principalType: auditPrincipal.principalType,
        principalId: auditPrincipal.principalId,
        organizationId: null,
        connectionId: toolCall.connectionId,
        toolName: toolCall.toolName,
        requiredScopes: [],
        granted: false,
        denialReason: 'tool_rate_limited',
        inputHash: hashMcpToolInput(toolCall.arguments),
        responseClass: 'rate_limited',
      })

      return jsonRpcRateLimitResponse(c, toolCall.payloadId, retryAfterSeconds)
    }

    return next()
  })
}

/** Test-only helper to reset in-memory counters. */
export function resetMcpToolRateLimitStoreForTests(): void {
  rateLimitStore.clear()
}

/** Test-only helper to force rate limiting during tests. */
export function setMcpToolRateLimitBypassForTests(enabled: boolean): void {
  forceToolRateLimitInTests = enabled
}
