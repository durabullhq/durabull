import { mcpPolicyRepository, redisConnectionRepository } from '@durabull/dal'
import type { ListConnectionsHandlerInput, ListConnectionsHandlerOutput } from '@durabull/mcp'
import { filterPlanAccessibleConnections } from '../../billing/entitlements'
import { decodeCursor, encodeCursor } from './shared'

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
  const allConnections = await filterPlanAccessibleConnections(
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
