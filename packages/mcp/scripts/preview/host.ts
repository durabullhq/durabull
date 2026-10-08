import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import { getMcpToolDefinition } from '../../src/tools/tool-catalog'
import { fixture } from './fixtures'

const iframe = document.querySelector('iframe')!
const params = new URLSearchParams(location.search)
const calls: string[] = []
const messages: unknown[] = []
/** Validate preview data against the server output schema before sending it through the bridge. */
const result = (name: string, args: Record<string, unknown>) => {
  const data = fixture(name, args)
  const definition = getMcpToolDefinition(name)!
  // The preview must obey the same schemas as the real server.
  definition.outputSchema!.parse(data)
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    structuredContent: data,
    _meta: { 'durabull/view': { toolName: name, arguments: args } },
  }
}
const bridge = new AppBridge(
  null,
  { name: 'Durabull preview host', version: '1.0.0' },
  { serverTools: {}, message: { text: {} }, updateModelContext: {}, openLinks: {} },
  {
    hostContext: {
      theme: params.get('theme') === 'dark' ? 'dark' : 'light',
      displayMode: 'inline',
      availableDisplayModes: ['inline', 'fullscreen'],
      toolInfo: { tool: { name: 'list_connections', inputSchema: { type: 'object' } } },
    },
  }
)
bridge.oncalltool = async ({ name, arguments: args }) => {
  calls.push(name)
  const definition = getMcpToolDefinition(name)
  if (!definition?.annotations.readOnlyHint)
    throw new Error('The UI must never invoke a mutation directly')
  await new Promise((resolve) => setTimeout(resolve, 120))
  return result(name, args ?? {})
}
bridge.onmessage = async (message) => {
  messages.push(message)
  return {}
}
bridge.onupdatemodelcontext = async () => ({})
bridge.onrequestdisplaymode = async ({ mode }) => {
  bridge.setHostContext({ displayMode: mode })
  return { mode }
}
bridge.onsizechange = ({ height }) => {
  if (height) iframe.style.height = `${height}px`
}
bridge.oninitialized = async () => {
  await bridge.sendToolInput({ arguments: {} })
  await bridge.sendToolResult(result('list_connections', {}))
}
Object.assign(window, { preview: { calls, messages, bridge } })
await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!))
iframe.src = '/app'
