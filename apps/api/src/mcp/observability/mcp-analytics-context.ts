import { AsyncLocalStorage } from 'node:async_hooks'
import { createHmac } from 'node:crypto'
import { tryGetServerAnalyticsOptions } from '@durabull/analytics/server'
import type { McpAnalyticsIdentity } from './mcp-analytics'

export interface McpAnalyticsContext {
  properties: Record<string, unknown>
  identity: () => McpAnalyticsIdentity | null
  clientId: () => string | undefined
  clientName?: () => string | undefined
  connectionId?: () => string | undefined
  toolOutcome?: 'success' | 'tool_error'
  redactionCount?: number
}

export const mcpAnalyticsContext = new AsyncLocalStorage<McpAnalyticsContext | undefined>()

export function mcpAnalyticsKey(kind: string, value: string | undefined): string | undefined {
  const secret = tryGetServerAnalyticsOptions()?.hmacSecret
  return value && secret
    ? createHmac('sha256', secret).update(`mcp:${kind}:${value}`).digest('hex')
    : undefined
}

/** Only emit a fixed family label; arbitrary client names and user agents can contain PII. */
export function mcpClientFamily(value: unknown): string {
  if (typeof value !== 'string') return 'unknown'
  if (/codex/i.test(value)) return 'codex'
  if (/chatgpt|openai/i.test(value)) return 'chatgpt'
  if (/claude/i.test(value)) return 'claude'
  if (/cursor/i.test(value)) return 'cursor'
  if (/visual studio code|vscode|copilot/i.test(value)) return 'vscode'
  if (/inspector/i.test(value)) return 'mcp_inspector'
  return 'other'
}

export function mcpClientVersion(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^\d+(?:\.\d+){0,3}(?:-[a-zA-Z0-9.]+)?$/.test(value) &&
    value.length <= 32
    ? value
    : undefined
}
