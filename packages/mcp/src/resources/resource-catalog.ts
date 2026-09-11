import { MCP_SCOPE_DISCOVER, MCP_SCOPE_FAILURES_READ, MCP_SCOPE_JOBS_READ } from '../auth/scopes'

/**
 * MCP resources expose stable, addressable snapshots that clients can pin into context.
 * Every `resources/read` is authorized by the same policy engine as `tools/call`, using the
 * `requiredScopes` declared here and the `connectionId` parsed from the URI.
 */

export const MCP_RESOURCE_URI_SCHEME = 'durabull'

export interface McpResourceDefinition {
  name: string
  title: string
  description: string
  /** RFC 6570 URI template. Variables: `connectionId`, `queueName`. */
  uriTemplate: string
  requiredScopes: readonly string[]
  mimeType: 'application/json'
}

export const MCP_RESOURCE_CATALOG: readonly McpResourceDefinition[] = [
  {
    name: 'server',
    title: 'Durabull MCP server',
    description:
      'Server metadata: version, scopes granted to this token, and the full tool, resource, and prompt catalog with required scopes. Read it first to learn what this token can do.',
    uriTemplate: `${MCP_RESOURCE_URI_SCHEME}://server`,
    requiredScopes: [MCP_SCOPE_DISCOVER],
    mimeType: 'application/json',
  },
  {
    name: 'connections',
    title: 'Connections',
    description: 'Redis connections visible to the caller (first 100).',
    uriTemplate: `${MCP_RESOURCE_URI_SCHEME}://connections`,
    requiredScopes: [MCP_SCOPE_JOBS_READ],
    mimeType: 'application/json',
  },
  {
    name: 'connection_queues',
    title: 'Connection queues',
    description: 'Queues on a connection with paused state and live job counts (first 100).',
    uriTemplate: `${MCP_RESOURCE_URI_SCHEME}://connections/{connectionId}/queues`,
    requiredScopes: [MCP_SCOPE_JOBS_READ],
    mimeType: 'application/json',
  },
  {
    name: 'queue',
    title: 'Queue',
    description: 'One queue: paused state, job counts, scheduler count, and attached workers.',
    uriTemplate: `${MCP_RESOURCE_URI_SCHEME}://connections/{connectionId}/queues/{queueName}`,
    requiredScopes: [MCP_SCOPE_JOBS_READ],
    mimeType: 'application/json',
  },
  {
    name: 'connection_alerts',
    title: 'Connection alerts',
    description: 'Open alert summary for a connection by queue and rule.',
    uriTemplate: `${MCP_RESOURCE_URI_SCHEME}://connections/{connectionId}/alerts`,
    requiredScopes: [MCP_SCOPE_FAILURES_READ],
    mimeType: 'application/json',
  },
]

const RESOURCES_BY_NAME = new Map(MCP_RESOURCE_CATALOG.map((resource) => [resource.name, resource]))

export function getMcpResourceDefinition(name: string): McpResourceDefinition | null {
  return RESOURCES_BY_NAME.get(name) ?? null
}

export interface ParsedMcpResourceUri {
  definition: McpResourceDefinition
  uri: string
  variables: {
    connectionId?: string
    queueName?: string
  }
}

function decodeSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment)
    return decoded.length > 0 ? decoded : null
  } catch {
    return null
  }
}

/**
 * Parses a `durabull://` URI into its catalog definition and template variables.
 * Returns null for anything unrecognized so callers fail closed.
 */
export function parseMcpResourceUri(rawUri: unknown): ParsedMcpResourceUri | null {
  if (typeof rawUri !== 'string') return null
  const uri = rawUri.trim()
  const prefix = `${MCP_RESOURCE_URI_SCHEME}://`
  if (!uri.startsWith(prefix)) return null

  const rest = uri.slice(prefix.length).replace(/\/+$/, '')
  if (rest.length === 0) return null
  const segments = rest.split('/')
  const [root, connectionId, collection, queueName, ...extra] = segments
  if (extra.length > 0) return null

  if (root === 'server' && segments.length === 1) {
    return { definition: RESOURCES_BY_NAME.get('server')!, uri, variables: {} }
  }

  if (root !== 'connections') return null
  if (segments.length === 1) {
    return { definition: RESOURCES_BY_NAME.get('connections')!, uri, variables: {} }
  }

  const decodedConnectionId = decodeSegment(connectionId ?? '')
  if (!decodedConnectionId) return null

  if (segments.length === 3 && collection === 'queues') {
    return {
      definition: RESOURCES_BY_NAME.get('connection_queues')!,
      uri,
      variables: { connectionId: decodedConnectionId },
    }
  }
  if (segments.length === 3 && collection === 'alerts') {
    return {
      definition: RESOURCES_BY_NAME.get('connection_alerts')!,
      uri,
      variables: { connectionId: decodedConnectionId },
    }
  }
  if (segments.length === 4 && collection === 'queues') {
    const decodedQueueName = decodeSegment(queueName ?? '')
    if (!decodedQueueName) return null
    return {
      definition: RESOURCES_BY_NAME.get('queue')!,
      uri,
      variables: { connectionId: decodedConnectionId, queueName: decodedQueueName },
    }
  }

  return null
}

export function buildMcpResourceUri(name: 'server' | 'connections'): string
export function buildMcpResourceUri(
  name: 'connection_queues' | 'connection_alerts',
  variables: { connectionId: string }
): string
export function buildMcpResourceUri(
  name: 'queue',
  variables: { connectionId: string; queueName: string }
): string
export function buildMcpResourceUri(
  name: string,
  variables: { connectionId?: string; queueName?: string } = {}
): string {
  const definition = RESOURCES_BY_NAME.get(name)
  if (!definition) {
    throw new Error(`Unknown MCP resource ${name}`)
  }
  return definition.uriTemplate
    .replace('{connectionId}', encodeURIComponent(variables.connectionId ?? ''))
    .replace('{queueName}', encodeURIComponent(variables.queueName ?? ''))
}
