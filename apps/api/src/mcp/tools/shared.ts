import type {
  McpJobSummary,
  McpToolErrorCode,
  ToolPrincipal as McpToolPrincipal,
} from '@durabull/mcp'
import { getMcpRequestContext } from '@durabull/mcp'
import type { Job } from 'bullmq'

import { toRedisConnectionOptions } from '../../lib/connection-options'
import { getQueue } from '../../lib/redis'
import { resolveConnectionForPrincipal } from '../connections/resolve-connection'

export { toIsoString, toRecord } from './format'

export type ToolPrincipal = McpToolPrincipal

/**
 * Typed domain error surfaced to MCP clients as `{ error: { code, message } }`.
 * Messages are authored by handlers and are passed through to clients (after redaction), so keep
 * them actionable and free of internal identifiers such as Redis URLs.
 */
export class McpToolError extends Error {
  readonly code: McpToolErrorCode

  constructor(code: McpToolErrorCode, message: string) {
    super(message)
    this.name = 'McpToolError'
    this.code = code
  }
}

export async function requireConnectionForPrincipal(
  principal: ToolPrincipal,
  connectionId: string
) {
  const connection = await resolveConnectionForPrincipal(principal, connectionId)
  if (!connection) {
    throw new McpToolError('not_found', `Connection ${connectionId} not found.`)
  }
  return connection
}

export type ResolvedToolConnection = NonNullable<
  Awaited<ReturnType<typeof requireConnectionForPrincipal>>
>

/** Opens (or reuses) the BullMQ Queue handle for a resolved connection. */
export function getQueueForConnection(connection: ResolvedToolConnection, queueName: string) {
  return getQueue(
    connection.id,
    connection.url,
    queueName,
    connection.prefix,
    toRedisConnectionOptions(connection.allowSelfSignedCerts)
  )
}

/** True when the current MCP request's effective scopes include `scope`. */
export function hasGrantedScope(
  grantedScopes: readonly string[] | undefined,
  scope: string
): boolean {
  const scopes = grantedScopes ?? getMcpRequestContext()?.grantedScopes ?? []
  return scopes.includes(scope)
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0
  const parsed = Number.parseInt(cursor, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new McpToolError('validation_error', 'Invalid cursor.')
  }
  return parsed
}

export function encodeCursor(offset: number): string {
  return String(offset)
}

export function parseOffsetPageSize(
  cursor: string | undefined,
  pageSize: number
): {
  offset: number
  limit: number
} {
  return {
    offset: decodeCursor(cursor),
    limit: Math.min(100, Math.max(1, pageSize)),
  }
}

/**
 * Compound cursor for tools that page across queues and then within a queue
 * (`<queueIndex>:<offsetWithinQueue>`). Used by get_workers and list_scheduled_jobs.
 */
export function parseQueueOffsetCursor(cursor: string | undefined): {
  queueIndex: number
  offset: number
} {
  if (!cursor) {
    return { queueIndex: 0, offset: 0 }
  }

  const [queuePart, offsetPart] = cursor.split(':')
  const queueIndex = Number.parseInt(queuePart ?? '', 10)
  const offset = Number.parseInt(offsetPart ?? '', 10)
  if (!Number.isFinite(queueIndex) || queueIndex < 0 || !Number.isFinite(offset) || offset < 0) {
    throw new McpToolError('validation_error', 'Invalid cursor.')
  }

  return { queueIndex, offset }
}

export function encodeQueueOffsetCursor(queueIndex: number, offset: number): string {
  return `${queueIndex}:${offset}`
}

export function parseWorkersCursor(cursor: string | undefined): {
  queueIndex: number
  workerOffset: number
} {
  const { queueIndex, offset } = parseQueueOffsetCursor(cursor)
  return { queueIndex, workerOffset: offset }
}

export const encodeWorkersCursor = encodeQueueOffsetCursor

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)

  async function runWorker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
  return results
}

type JobLike = Pick<
  Job,
  | 'id'
  | 'name'
  | 'attemptsMade'
  | 'opts'
  | 'failedReason'
  | 'processedOn'
  | 'finishedOn'
  | 'timestamp'
  | 'delay'
>

/** Projects a BullMQ job into the MCP job summary shape shared by list_jobs and find_job. */
export function toMcpJobSummary(job: JobLike, state: string): McpJobSummary {
  return {
    id: String(job.id ?? ''),
    name: job.name,
    status: state,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts ?? 1,
    failedReason: job.failedReason ?? null,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null,
    timestamp: job.timestamp ?? null,
    delay: job.delay ?? 0,
    priority: job.opts.priority ?? 0,
  }
}
