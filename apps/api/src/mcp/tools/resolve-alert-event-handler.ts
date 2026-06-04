import { alertEventRepository } from '@durabull/dal'
import type {
  ResolveAlertEventHandlerInput,
  ResolveAlertEventHandlerOutput,
} from '@durabull/mcp'

import { McpToolError, requireConnectionForPrincipal } from './shared'
import { toMcpAlertEventSummary } from './mcp-sanitize'

export async function resolveAlertEventHandler(
  input: ResolveAlertEventHandlerInput
): Promise<ResolveAlertEventHandlerOutput> {
  const connection = await requireConnectionForPrincipal(input.principal, input.connectionId)

  const existing = await alertEventRepository.findById(input.eventId, connection.organizationId)
  if (!existing || existing.connectionId !== connection.id) {
    throw new McpToolError('not_found', `Alert event ${input.eventId} not found.`)
  }

  const event = await alertEventRepository.resolve(input.eventId, connection.organizationId)
  if (!event) {
    throw new McpToolError('not_found', `Alert event ${input.eventId} not found.`)
  }

  return {
    connectionId: connection.id,
    event: toMcpAlertEventSummary(event),
  }
}
