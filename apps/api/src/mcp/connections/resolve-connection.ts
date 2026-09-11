import { mcpPolicyRepository, redisConnectionRepository } from '@durabull/dal'
import type { ListConnectionsHandlerInput, McpResolvedConnection } from '@durabull/mcp'
import { getMcpRequestContext } from '@durabull/mcp'

export type ToolPrincipal = ListConnectionsHandlerInput['principal']

function toResolvedConnection(connection: {
  id: string
  organizationId: string
  name: string
  environment?: string | null
  url: string
  prefix: string
  allowSelfSignedCerts: boolean
}): McpResolvedConnection {
  return {
    id: connection.id,
    organizationId: connection.organizationId,
    name: connection.name,
    environment: connection.environment ?? null,
    url: connection.url,
    prefix: connection.prefix,
    allowSelfSignedCerts: connection.allowSelfSignedCerts,
  }
}

export async function resolveConnectionForPrincipal(
  principal: ToolPrincipal,
  connectionId: string,
  options: { skipDelegatedAccessCheck?: boolean } = {}
) {
  const cached = getMcpRequestContext()?.resolvedConnection
  if (cached?.id === connectionId) {
    return cached
  }

  if (principal.type === 'service_account') {
    const connection = await redisConnectionRepository.findById(
      connectionId,
      principal.organizationId
    )
    return connection ? toResolvedConnection(connection) : null
  }

  if (!options.skipDelegatedAccessCheck) {
    const hasAccess = await mcpPolicyRepository.canDelegatedUserAccessConnection(
      principal.userId,
      connectionId
    )
    if (!hasAccess) {
      return null
    }
  }

  const connection = await redisConnectionRepository.findByIdUnsafe(connectionId)
  return connection ? toResolvedConnection(connection) : null
}
