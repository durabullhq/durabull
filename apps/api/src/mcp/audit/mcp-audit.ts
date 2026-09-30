import { createHash } from 'node:crypto'

import { mcpPolicyRepository } from '@durabull/dal'

import { recordMcpTelemetry } from '../observability/mcp-telemetry'

export type McpAuditResponseClass = 'policy_denied' | 'rate_limited' | 'success' | 'tool_error'

export interface McpAuditEventInput {
  correlationId: string
  principalType: 'delegated_user' | 'service_account'
  principalId: string
  userId?: string | null
  organizationId?: string | null
  connectionId?: string | null
  toolName: string
  requiredScopes: string[]
  granted: boolean
  denialReason?: string | null
  inputHash?: string | null
  responseClass?: McpAuditResponseClass | null
}

const MAX_AUDIT_IN_FLIGHT = 16
const MAX_AUDIT_QUEUE_DEPTH = 1024
const AUDIT_DROP_LOG_INTERVAL = 100
let auditInFlight = 0
let droppedAuditEvents = 0
const pendingAuditEvents: McpAuditEventInput[] = []

function dispatchAuditEvent(input: McpAuditEventInput): void {
  auditInFlight += 1
  void mcpPolicyRepository
    .createAuditEvent(input)
    .catch((error) => {
      console.error('[mcp-audit] failed to write audit event', error)
      recordMcpTelemetry({
        signal: 'audit_write_failed',
        toolName: input.toolName,
        principalId: input.principalId,
        correlationId: input.correlationId,
      })
    })
    .finally(() => {
      auditInFlight -= 1
      flushPendingAuditEvents()
    })
}

function flushPendingAuditEvents(): void {
  while (auditInFlight < MAX_AUDIT_IN_FLIGHT && pendingAuditEvents.length > 0) {
    const next = pendingAuditEvents.shift()
    if (!next) break
    dispatchAuditEvent(next)
  }
}

export function writeMcpAuditEventNonBlocking(input: McpAuditEventInput): void {
  if (input.responseClass === 'policy_denied') {
    recordMcpTelemetry({
      signal: 'policy_denied',
      toolName: input.toolName,
      principalId: input.principalId,
      principalType: input.principalType,
      userId: input.userId,
      organizationId: input.organizationId,
      denialReason: input.denialReason,
      correlationId: input.correlationId,
    })
  } else if (input.responseClass === 'rate_limited') {
    recordMcpTelemetry({
      signal: 'rate_limited_tool',
      toolName: input.toolName,
      principalId: input.principalId,
      principalType: input.principalType,
      userId: input.userId,
      organizationId: input.organizationId,
      correlationId: input.correlationId,
    })
  }

  if (auditInFlight < MAX_AUDIT_IN_FLIGHT && pendingAuditEvents.length === 0) {
    dispatchAuditEvent(input)
    return
  }

  if (pendingAuditEvents.length >= MAX_AUDIT_QUEUE_DEPTH) {
    droppedAuditEvents += 1
    recordMcpTelemetry({
      signal: 'audit_dropped',
      toolName: input.toolName,
      principalId: input.principalId,
      principalType: input.principalType,
      userId: input.userId,
      organizationId: input.organizationId,
      correlationId: input.correlationId,
    })
    if (droppedAuditEvents === 1 || droppedAuditEvents % AUDIT_DROP_LOG_INTERVAL === 0) {
      console.warn(
        `[mcp-audit] dropping audit events due to backpressure (dropped=${droppedAuditEvents}, inFlight=${auditInFlight}, queued=${pendingAuditEvents.length})`
      )
    }
    return
  }

  pendingAuditEvents.push(input)
  flushPendingAuditEvents()
}

function stableStringify(value: unknown, depth = 0): string {
  if (depth > 32) {
    return '"[truncated]"'
  }

  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, depth + 1)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key], depth + 1)}`)
    .join(',')}}`
}

export function hashMcpToolInput(args: Record<string, unknown>): string {
  return createHash('sha256').update(stableStringify(args)).digest('hex')
}
