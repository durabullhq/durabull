import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { MCP_SERVER_NAME } from '../constants'
import { registerPrompts } from '../prompts/register-prompts'
import { registerResources } from '../resources/register-resources'
import { type RegisterToolsOptions, registerTools } from '../tools/register-tools'

export interface CreateMcpServerOptions {
  version: string
  toolHandlers?: RegisterToolsOptions
}

export function createMcpServer({ version, toolHandlers }: CreateMcpServerOptions): McpServer {
  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      version,
      title: 'Durabull',
    },
    {
      instructions:
        'Durabull exposes BullMQ queue diagnostics and narrowly scoped operations. Start with list_connections (or read durabull://server) to learn the connection ids and the scopes this token holds; every other tool takes a connectionId. Read tools are annotated readOnlyHint=true. Write tools (retry_job, promote_job, pause_queue, resume_queue, resolve_alert_event, acknowledge_alert_event, unacknowledge_alert_event, snooze_alert_rule, unsnooze_alert_rule) need explicit write scopes and should only be called when the user asks for the change. Responses are redacted: secrets are removed and long strings truncated; _mcpSafety.redactionCount reports how many redactions occurred.',
    }
  )

  const handlers = toolHandlers ?? {}
  registerTools(server, handlers)
  registerResources(server, { version, toolHandlers: handlers })
  registerPrompts(server)

  return server
}
