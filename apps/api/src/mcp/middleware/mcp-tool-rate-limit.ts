import { createHash } from 'node:crypto'
import { env } from '@durabull/env'
import { getMcpToolDefinition } from '@durabull/mcp'
import { extractBearerToken } from '@durabull/mcp/auth'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import { TokenBucketStore } from '../../middleware/token-bucket'
import { hashMcpToolInput, writeMcpAuditEventNonBlocking } from '../audit/mcp-audit'
import {
  isMcpResourcesReadMethod,
  isMcpToolsCallMethod,
  parseMcpJsonRpcMethod,
  parseMcpJsonRpcPayloadId,
  parseMcpPolicyOperation,
} from '../json-rpc-tool-call'
import { MCP_RATE_LIMIT_POLICIES } from './rate-limit-policy'

const rateLimitStore = new TokenBucketStore()
let forceToolRateLimitInTests = false

function shouldSkipToolRateLimiting(): boolean {
  if (forceToolRateLimitInTests) return false
  if (env.DISABLE_RATE_LIMIT === true) return true
  if (env.NODE_ENV === 'test') return true
  if (env.NODE_ENV === 'development' || env.NODE_ENV === undefined) return true
  return false
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
  // The validated user+OAuth client survives refresh and isolates hosts and accounts.
  const session = c.get('mcpSession')
  const identity = session
    ? JSON.stringify([session.userId ? 'user' : 'service', session.userId, session.clientId])
    : (extractBearerToken(c.req.header('Authorization')) ?? 'anonymous')
  return createHash('sha256').update(identity).digest('hex').slice(0, 24)
}

type WorkBucket = Exclude<keyof typeof MCP_RATE_LIMIT_POLICIES, 'ingress'>
const DISCOVERY_OPERATIONS = new Set([
  'ping',
  'list_connections',
  'resource:server',
  'resource:queue_explorer',
  'resource:connections',
])
const DISCOVERY_METHODS = new Set([
  'initialize',
  'ping',
  'tools/list',
  'resources/list',
  'resources/templates/list',
  'prompts/list',
  'prompts/get',
])

/** Charge aggregate work by cost, so switching tools cannot bypass a diagnostic budget. */
function bucketForOperation(toolName: string): WorkBucket {
  if (DISCOVERY_OPERATIONS.has(toolName) || toolName.startsWith('method:')) return 'discovery'
  const tool = getMcpToolDefinition(toolName)
  if (tool && !tool.annotations.readOnlyHint) return 'write'
  if (
    tool?.heavy ||
    toolName === 'resource:connection_queues' ||
    toolName === 'resource:connection_alerts'
  )
    return 'heavy'
  return 'read'
}

function jsonRpcRateLimitResponse(
  c: Context,
  payloadId: string | number | null,
  retryAfterSeconds: number,
  bucket: WorkBucket
) {
  return c.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32_029,
        message:
          'MCP work budget exhausted. Retry after the indicated delay; other work budgets remain available.',
        data: {
          retryAfter: retryAfterSeconds,
          bucket,
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
    const method = parseMcpJsonRpcMethod(body)
    const discovery = method !== null && DISCOVERY_METHODS.has(method)
    if (!isMcpToolsCallMethod(body) && !isMcpResourcesReadMethod(body) && !discovery) {
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
          toolName: discovery
            ? `method:${method}`
            : isMcpToolsCallMethod(body)
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
    const bucket = bucketForOperation(toolCall.toolName)
    const policy = MCP_RATE_LIMIT_POLICIES[bucket]
    const result = rateLimitStore.take(`mcp:${principalKey}:${bucket}`, policy)
    c.header('X-RateLimit-Limit', String(policy.capacity))
    c.header('X-RateLimit-Remaining', String(result.remaining))
    c.header('X-RateLimit-Reset', String(result.resetAfter))

    if (!result.allowed) {
      c.header('Retry-After', String(result.retryAfter))

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
        denialReason: `work_budget_exhausted:${bucket}`,
        inputHash: hashMcpToolInput(toolCall.arguments),
        responseClass: 'rate_limited',
      })

      return jsonRpcRateLimitResponse(c, toolCall.payloadId, result.retryAfter, bucket)
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
