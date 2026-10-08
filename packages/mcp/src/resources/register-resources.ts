import {
  type McpServer,
  ProtocolError,
  ProtocolErrorCode,
  ResourceTemplate,
} from '@modelcontextprotocol/server'

import { MCP_SERVER_NAME } from '../constants'
import { MCP_PROMPT_CATALOG } from '../prompts/prompt-catalog'
import { getMcpRequestContext } from '../request-context'
import { sanitizeMcpOutput } from '../safety/sanitize-output'
import type { RegisterToolsOptions } from '../tools/register-tools'
import { getPrincipalFromContext, toToolError } from '../tools/register-tools'
import { MCP_TOOL_CATALOG } from '../tools/tool-catalog'
import {
  getMcpResourceDefinition,
  MCP_RESOURCE_CATALOG,
  type McpResourceDefinition,
} from './resource-catalog'

export interface RegisterResourcesOptions {
  version: string
  toolHandlers: RegisterToolsOptions
}

const RESOURCE_PAGE_SIZE = 100

/** Fail during registration if a resource lacks its shared policy and metadata definition. */
function requireResource(name: string): McpResourceDefinition {
  const definition = getMcpResourceDefinition(name)
  if (!definition) {
    throw new Error(`MCP resource ${name} is not in the catalog.`)
  }
  return definition
}

/** Extract one required URI-template value or report invalid protocol parameters. */
function variable(value: string | string[] | undefined): string {
  const single = Array.isArray(value) ? value[0] : value
  if (!single) {
    throw new ProtocolError(
      ProtocolErrorCode.InvalidParams,
      'Resource URI is missing a required segment.'
    )
  }
  return single
}

/** Redact resource snapshots and report redaction counts before serializing content. */
function jsonContents(uri: URL, definition: McpResourceDefinition, value: unknown) {
  const { value: sanitized, redactionCount } = sanitizeMcpOutput(value)
  const payload: Record<string, unknown> =
    typeof sanitized === 'object' && sanitized != null && !Array.isArray(sanitized)
      ? { ...(sanitized as Record<string, unknown>) }
      : { value: sanitized }
  if (redactionCount > 0) {
    payload._mcpSafety = { redactionCount }
    getMcpRequestContext()?.onRedactionApplied?.(redactionCount)
  }
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: definition.mimeType,
        text: JSON.stringify(payload),
      },
    ],
  }
}

/** Audit resource reads and translate handler failures into safe protocol errors. */
async function readResource(
  definition: McpResourceDefinition,
  uri: URL,
  connectionId: string | null,
  load: () => Promise<unknown>
) {
  const auditName = `resource:${definition.name}`
  try {
    const value = await load()
    getMcpRequestContext()?.onToolInvocationComplete?.({
      toolName: auditName,
      arguments: { uri: uri.href },
      connectionId,
      responseClass: 'success',
    })
    return jsonContents(uri, definition, value)
  } catch (error) {
    getMcpRequestContext()?.onToolInvocationComplete?.({
      toolName: auditName,
      arguments: { uri: uri.href },
      connectionId,
      responseClass: 'tool_error',
    })
    if (error instanceof ProtocolError) throw error
    const toolError = toToolError(error)
    throw new ProtocolError(
      toolError.code === 'internal_error'
        ? ProtocolErrorCode.InternalError
        : ProtocolErrorCode.InvalidParams,
      `${toolError.code}: ${toolError.message}`
    )
  }
}

/** Report a resource whose backing handler is not installed on this server. */
function unavailable(name: string): never {
  throw new ProtocolError(
    ProtocolErrorCode.MethodNotFound,
    `Resource ${name} is not available on this server.`
  )
}

/** Describe the catalogs and effective scopes visible in the current request context. */
export function buildServerInfo(version: string) {
  const context = getMcpRequestContext()
  return {
    name: MCP_SERVER_NAME,
    version,
    principalType: context?.principal?.type ?? null,
    grantedScopes: [...(context?.grantedScopes ?? [])],
    limits: {
      maxPageSize: 100,
      maxMetricsWindowMinutes: 1440,
      maxRedisHealthWindowMinutes: 43_200,
    },
    tools: MCP_TOOL_CATALOG.map((tool) => ({
      name: tool.name,
      title: tool.title,
      readOnly: tool.annotations.readOnlyHint,
      requiredScopes: [...tool.requiredScopes],
      optionalScopes: [...tool.optionalScopes],
    })),
    resources: MCP_RESOURCE_CATALOG.map((resource) => ({
      name: resource.name,
      uriTemplate: resource.uriTemplate,
      requiredScopes: [...resource.requiredScopes],
    })),
    prompts: MCP_PROMPT_CATALOG.map((prompt) => ({
      name: prompt.name,
      title: prompt.title,
      arguments: prompt.arguments.map((argument) => argument.name),
    })),
  }
}

/** Register addressable snapshots backed by the same handlers as tool reads. */
export function registerResources(server: McpServer, options: RegisterResourcesOptions): void {
  const handlers = options.toolHandlers

  const serverDefinition = requireResource('server')
  server.registerResource(
    serverDefinition.name,
    serverDefinition.uriTemplate,
    {
      title: serverDefinition.title,
      description: serverDefinition.description,
      mimeType: serverDefinition.mimeType,
    },
    async (uri) =>
      readResource(serverDefinition, uri, null, async () => buildServerInfo(options.version))
  )

  const connectionsDefinition = requireResource('connections')
  server.registerResource(
    connectionsDefinition.name,
    connectionsDefinition.uriTemplate,
    {
      title: connectionsDefinition.title,
      description: connectionsDefinition.description,
      mimeType: connectionsDefinition.mimeType,
    },
    async (uri) =>
      readResource(connectionsDefinition, uri, null, async () => {
        const handler = handlers.listConnections ?? unavailable('connections')
        return handler({ principal: getPrincipalFromContext(), pageSize: RESOURCE_PAGE_SIZE })
      })
  )

  const queuesDefinition = requireResource('connection_queues')
  server.registerResource(
    queuesDefinition.name,
    new ResourceTemplate(queuesDefinition.uriTemplate, { list: undefined }),
    {
      title: queuesDefinition.title,
      description: queuesDefinition.description,
      mimeType: queuesDefinition.mimeType,
    },
    async (uri, variables) => {
      const connectionId = variable(variables.connectionId)
      return readResource(queuesDefinition, uri, connectionId, async () => {
        const handler = handlers.listQueues ?? unavailable('connection_queues')
        return handler({
          principal: getPrincipalFromContext(),
          connectionId,
          pageSize: RESOURCE_PAGE_SIZE,
        })
      })
    }
  )

  const queueDefinition = requireResource('queue')
  server.registerResource(
    queueDefinition.name,
    new ResourceTemplate(queueDefinition.uriTemplate, { list: undefined }),
    {
      title: queueDefinition.title,
      description: queueDefinition.description,
      mimeType: queueDefinition.mimeType,
    },
    async (uri, variables) => {
      const connectionId = variable(variables.connectionId)
      const queueName = variable(variables.queueName)
      return readResource(queueDefinition, uri, connectionId, async () => {
        const handler = handlers.getQueue ?? unavailable('queue')
        return handler({ principal: getPrincipalFromContext(), connectionId, queueName })
      })
    }
  )

  const alertsDefinition = requireResource('connection_alerts')
  server.registerResource(
    alertsDefinition.name,
    new ResourceTemplate(alertsDefinition.uriTemplate, { list: undefined }),
    {
      title: alertsDefinition.title,
      description: alertsDefinition.description,
      mimeType: alertsDefinition.mimeType,
    },
    async (uri, variables) => {
      const connectionId = variable(variables.connectionId)
      return readResource(alertsDefinition, uri, connectionId, async () => {
        const handler = handlers.getAlertSummary ?? unavailable('connection_alerts')
        return handler({ principal: getPrincipalFromContext(), connectionId })
      })
    }
  )
}
