import { billingRepository, mcpPolicyRepository, redisConnectionRepository } from '@durabull/dal'
import type { ListConnectionsHandlerInput, ListConnectionsHandlerOutput } from '@durabull/mcp'
import { isBillingEnabled, isEnforcedFor } from '../../billing/config'
import { decodeCursor, encodeCursor } from './shared'

/**
 * Organization-wide listings span every organization the user belongs to, so
 * plan state is applied per organization: connections paused by a plan limit
 * and organizations where the caller's seat is paused are filtered out.
 */
async function filterByPlan<T extends { id: string; organizationId: string }>(
  connections: T[],
  userId: string | null
): Promise<T[]> {
  if (!isBillingEnabled()) return connections
  const result: T[] = []
  const memberSuspended = new Map<string, boolean>()
  const suspendedConnections = new Map<string, Set<string>>()
  for (const connection of connections) {
    const organizationId = connection.organizationId
    if (!isEnforcedFor(organizationId)) {
      result.push(connection)
      continue
    }
    if (userId) {
      if (!memberSuspended.has(organizationId)) {
        memberSuspended.set(
          organizationId,
          await billingRepository.isMemberSuspended(organizationId, userId)
        )
      }
      if (memberSuspended.get(organizationId)) continue
    }
    if (!suspendedConnections.has(organizationId)) {
      suspendedConnections.set(
        organizationId,
        await billingRepository.suspendedIds(organizationId, 'connection')
      )
    }
    if (suspendedConnections.get(organizationId)?.has(connection.id)) continue
    result.push(connection)
  }
  return result
}

export async function listConnectionsHandler(
  input: ListConnectionsHandlerInput
): Promise<ListConnectionsHandlerOutput> {
  const offset = decodeCursor(input.cursor)
  const pageSize = Math.min(100, Math.max(1, input.pageSize))

  const listed =
    input.principal.type === 'delegated_user'
      ? await mcpPolicyRepository.listDelegatedUserConnections(input.principal.userId)
      : (await redisConnectionRepository.findAll(input.principal.organizationId))
          .filter((connection) => connection.enabled)
          .map((connection) => ({
            id: connection.id,
            name: connection.name,
            environment: connection.environment ?? null,
            prefix: connection.prefix,
            isDefault: connection.isDefault,
            organizationId: connection.organizationId,
          }))
  const allConnections = await filterByPlan(
    listed,
    input.principal.type === 'delegated_user' ? input.principal.userId : null
  )

  const page = allConnections.slice(offset, offset + pageSize)
  const nextOffset = offset + page.length
  const nextCursor = nextOffset < allConnections.length ? encodeCursor(nextOffset) : null

  return {
    connections: page,
    nextCursor,
  }
}
