import { alertEventRepository } from '@durabull/dal'
import type { GetFailureEventsHandlerInput, GetFailureEventsHandlerOutput } from '@durabull/mcp'
import { toMcpAlertEventSummary } from './mcp-sanitize'
import { parseOffsetPageSize, requireConnectionForPrincipal } from './shared'

export async function getFailureEventsHandler(
  input: GetFailureEventsHandlerInput
): Promise<GetFailureEventsHandlerOutput> {
  const connection = await requireConnectionForPrincipal(input.principal, input.connectionId)
  const { offset, limit } = parseOffsetPageSize(input.cursor, input.pageSize)

  const filters = {
    status: input.status,
    queueName: input.queueName,
    jobId: input.jobId,
    acknowledged: input.acknowledged,
    alertRuleId: input.alertRuleId,
  }

  const [total, events] = await Promise.all([
    alertEventRepository.countByConnection(connection.id, connection.organizationId, filters),
    alertEventRepository.findByConnection(connection.id, connection.organizationId, {
      ...filters,
      offset,
      limit,
    }),
  ])

  const nextOffset = offset + events.length
  const nextCursor = nextOffset < total ? String(nextOffset) : null

  return {
    connectionId: connection.id,
    total,
    events: events.map((event) => toMcpAlertEventSummary(event)),
    nextCursor,
  }
}
