import type { App } from '@modelcontextprotocol/ext-apps'
import { getMcpToolDefinition } from '../../tools/tool-catalog'

type ToolCall = Parameters<App['callServerTool']>[0]

/** UI visibility is advisory. Enforce read-only calls at the browser bridge too. */
export async function callReadTool(
  app: Pick<App, 'callServerTool'>,
  call: ToolCall,
  options?: Parameters<App['callServerTool']>[1]
) {
  if (!getMcpToolDefinition(call.name)?.annotations.readOnlyHint) {
    throw new Error('Use the assistant to request this operation.')
  }
  return app.callServerTool(call, options)
}

const MUTATION_READS: Record<string, string> = {
  retry_job: 'get_job',
  promote_job: 'get_job',
  pause_queue: 'get_queue',
  resume_queue: 'get_queue',
  resolve_alert_event: 'get_alert_event',
  acknowledge_alert_event: 'get_alert_event',
  unacknowledge_alert_event: 'get_alert_event',
  snooze_alert_rule: 'get_alert_rule',
  unsnooze_alert_rule: 'get_alert_rule',
}

/** Refresh a mutation's affected entity; never replay the operation. */
export function refreshToolCall(name: string, args: Record<string, unknown>): ToolCall | null {
  const readName = MUTATION_READS[name] ?? name
  const definition = getMcpToolDefinition(readName)
  if (!definition?.annotations.readOnlyHint) return null
  return {
    name: readName,
    // Exclude write-only arguments such as snooze duration.
    arguments: Object.fromEntries(
      Object.keys(definition.inputSchema)
        .filter((key) => args[key] !== undefined)
        .map((key) => [key, args[key]])
    ),
  }
}
