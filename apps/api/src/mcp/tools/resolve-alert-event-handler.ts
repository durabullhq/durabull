import { alertEventRepository } from '@durabull/dal'
import type { ResolveAlertEventHandlerInput, ResolveAlertEventHandlerOutput } from '@durabull/mcp'
import { toMcpAlertEventSummary } from './mcp-sanitize'
import { McpToolError, requireConnectionForPrincipal } from './shared'

export async function resolveAlertEventHandler(
  input: ResolveAlertEventHandlerInput
): Promise<ResolveAlertEventHandlerOutput> {
  const connection = await requireConnectionForPrincipal(input.principal, input.connectionId)

  const existing = await alertEventRepository.findById(input.eventId, connection.organizationId)
  if (!existing || existing.connectionId !== connection.id) {
    throw new McpToolError('not_found', `Alert event ${input.eventId} not found.`)
  }
  if (existing.status === 'suppressed') {
    throw new McpToolError(
      'validation_error',
      'Suppressed events are informational cooldown records and cannot be resolved.'
    )
  }
  if (existing.status === 'resolved') {
    throw new McpToolError('conflict', 'This alert event is already resolved.')
  }

  // Service accounts have no member to credit; a user principal is recorded as the resolver.
  const resolvedBy = input.principal.type === 'delegated_user' ? input.principal.userId : null
  const event = await alertEventRepository.resolve(
    input.eventId,
    connection.organizationId,
    'manual',
    resolvedBy
  )
  if (!event) {
    throw new McpToolError('conflict', 'The alert event changed before it could be resolved.')
  }

  return {
    connectionId: connection.id,
    event: toMcpAlertEventSummary(event),
  }
}
