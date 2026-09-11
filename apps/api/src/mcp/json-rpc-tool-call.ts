import { parseMcpResourceUri } from '@durabull/mcp'

export interface ParsedMcpToolCall {
  toolName: string
  arguments: Record<string, unknown>
  connectionId: string | null
  payloadId: string | number | null
}

export interface ParsedMcpResourceRead {
  /** Catalog resource name, e.g. `queue`. */
  resourceName: string
  /** Audit/policy name, e.g. `resource:queue`. Service-account bindings may target it. */
  operationName: string
  uri: string
  requiredScopes: readonly string[]
  connectionId: string | null
  payloadId: string | number | null
}

/**
 * A policy-relevant JSON-RPC operation: either a `tools/call` or a `resources/read`.
 * Both are authorized by the same policy engine and rate-limited per operation name.
 */
export type ParsedMcpPolicyOperation =
  | {
      kind: 'tool'
      name: string
      arguments: Record<string, unknown>
      connectionId: string | null
      payloadId: string | number | null
      requiredScopes: null
    }
  | {
      kind: 'resource'
      name: string
      arguments: Record<string, unknown>
      connectionId: string | null
      payloadId: string | number | null
      requiredScopes: readonly string[]
    }

interface JsonRpcBody {
  id?: string | number | null
  method?: string
  params?: {
    name?: string
    arguments?: Record<string, unknown>
    uri?: string
  }
}

function asObject(body: unknown): JsonRpcBody | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  return body as JsonRpcBody
}

export function parseMcpJsonRpcPayloadId(body: unknown): string | number | null {
  const payload = asObject(body)
  if (!payload || !('id' in payload)) return null
  const candidate = payload.id
  return typeof candidate === 'string' ||
    typeof candidate === 'number' ||
    candidate === null ||
    candidate === undefined
    ? (candidate ?? null)
    : null
}

export function parseMcpToolCallBody(body: unknown): ParsedMcpToolCall | null {
  const payload = asObject(body)
  if (!payload || payload.method !== 'tools/call') return null
  const toolName = payload.params?.name
  if (!toolName || typeof toolName !== 'string') return null
  const args = payload.params?.arguments
  const safeArgs: Record<string, unknown> =
    args && typeof args === 'object' && !Array.isArray(args) ? args : {}
  const connectionId =
    typeof safeArgs.connectionId === 'string' && safeArgs.connectionId.trim().length > 0
      ? safeArgs.connectionId.trim()
      : null

  return {
    toolName,
    arguments: safeArgs,
    connectionId,
    payloadId: parseMcpJsonRpcPayloadId(body),
  }
}

export function parseMcpResourceReadBody(body: unknown): ParsedMcpResourceRead | null {
  const payload = asObject(body)
  if (!payload || payload.method !== 'resources/read') return null
  const parsed = parseMcpResourceUri(payload.params?.uri)
  if (!parsed) return null

  return {
    resourceName: parsed.definition.name,
    operationName: `resource:${parsed.definition.name}`,
    uri: parsed.uri,
    requiredScopes: parsed.definition.requiredScopes,
    connectionId: parsed.variables.connectionId ?? null,
    payloadId: parseMcpJsonRpcPayloadId(body),
  }
}

export function parseMcpPolicyOperation(body: unknown): ParsedMcpPolicyOperation | null {
  const toolCall = parseMcpToolCallBody(body)
  if (toolCall) {
    return {
      kind: 'tool',
      name: toolCall.toolName,
      arguments: toolCall.arguments,
      connectionId: toolCall.connectionId,
      payloadId: toolCall.payloadId,
      requiredScopes: null,
    }
  }

  const resourceRead = parseMcpResourceReadBody(body)
  if (resourceRead) {
    return {
      kind: 'resource',
      name: resourceRead.operationName,
      arguments: { uri: resourceRead.uri },
      connectionId: resourceRead.connectionId,
      payloadId: resourceRead.payloadId,
      requiredScopes: resourceRead.requiredScopes,
    }
  }

  return null
}

export function isMcpToolsCallMethod(body: unknown): boolean {
  return asObject(body)?.method === 'tools/call'
}

export function isMcpResourcesReadMethod(body: unknown): boolean {
  return asObject(body)?.method === 'resources/read'
}

export function parseMcpJsonRpcMethod(body: unknown): string | null {
  const method = asObject(body)?.method
  return typeof method === 'string' && method.trim().length > 0 ? method.trim() : null
}
