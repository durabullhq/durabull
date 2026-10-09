import html from 'virtual:durabull-mcp-app'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import { useEffect, useRef, useState } from 'react'
import { getMcpToolDefinition } from '../../../packages/mcp/src/tools/tool-catalog'
import { mcpFixture } from './fixtures/mcp'

/** Conversation surfaces the app is embedded in, approximated for visual review. */
const HOSTS = {
  chatgpt: { name: 'ChatGPT', light: '#ffffff', dark: '#212121' },
  claude: { name: 'Claude', light: '#faf9f5', dark: '#262624' },
} as const

export interface McpPreviewProps {
  tool: string
  /** Extra tool arguments, merged over the default demo identifiers. */
  args?: Record<string, unknown>
  host?: keyof typeof HOSTS
  theme?: 'light' | 'dark'
  device?: 'desktop' | 'phone'
  displayMode?: 'inline' | 'fullscreen'
  state?: 'ready' | 'empty' | 'loading' | 'error'
}
const DEFAULT_ARGS = {
  connectionId: 'preview-production',
  queueName: 'email:receipts',
  jobId: 'job-1042',
  schedulerId: 'daily-summary',
  ruleId: 'rule-1',
  eventId: 'evt-1',
  minutes: 60,
}

export function McpPreview({
  tool,
  args: extraArgs,
  host = 'chatgpt',
  theme = 'light',
  device = 'desktop',
  displayMode = 'inline',
  state = 'ready',
}: McpPreviewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [requests, setRequests] = useState<string[]>([])
  const [messages, setMessages] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const argsKey = JSON.stringify(extraArgs ?? {})
  useEffect(() => {
    const iframe = frameRef.current!
    const args =
      tool === 'list_connections' ? {} : { ...DEFAULT_ARGS, ...(JSON.parse(argsKey) as object) }
    let disposed = false
    const result = (name: string, input: Record<string, unknown>) => {
      if (state === 'error')
        return {
          content: [{ type: 'text' as const, text: 'Demo host: Redis temporarily unavailable' }],
          isError: true,
        }
      let data = mcpFixture(name, input)
      if (state === 'empty') {
        data = Object.fromEntries(
          Object.entries(data).map(([key, value]) => [
            key,
            Array.isArray(value) ? [] : key === 'total' ? 0 : key === 'nextCursor' ? null : value,
          ])
        )
      }
      getMcpToolDefinition(name)!.outputSchema!.parse(data)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        structuredContent: data,
        _meta: { 'durabull/view': { toolName: name, arguments: input } },
      }
    }
    const bridge = new AppBridge(
      null,
      { name: `Durabull Storybook host (${HOSTS[host].name})`, version: '1.0.0' },
      { serverTools: {}, message: { text: {} }, updateModelContext: {}, openLinks: {} },
      {
        hostContext: {
          theme,
          displayMode,
          availableDisplayModes: ['inline', 'fullscreen'],
          platform: device === 'phone' ? 'mobile' : 'web',
          toolInfo: { tool: { name: tool, inputSchema: { type: 'object' } } },
        },
      }
    )
    bridge.oncalltool = async ({ name, arguments: input }) => {
      if (!getMcpToolDefinition(name)?.annotations.readOnlyHint)
        throw new Error('Only fixture-backed read tools are available')
      setRequests((current) => [...current, name])
      return result(name, input ?? {})
    }
    bridge.onmessage = async (message) => {
      setMessages((current) => [...current, JSON.stringify(message)])
      return {}
    }
    bridge.onupdatemodelcontext = async () => ({})
    bridge.onrequestdisplaymode = async ({ mode }) => {
      bridge.setHostContext({ displayMode: mode })
      return { mode }
    }
    bridge.onsizechange = ({ height }) => {
      if (height) iframe.style.height = `${Math.ceil(height)}px`
    }
    bridge.oninitialized = async () => {
      if (disposed || state === 'loading') return
      await bridge.sendToolInput({ arguments: args })
      await bridge.sendToolResult(result(tool, args))
    }
    setRequests([])
    setMessages([])
    setError(null)
    bridge
      .connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!))
      .then(() => {
        if (!disposed) iframe.srcdoc = html
      })
      .catch((reason) => {
        if (!disposed) setError(String(reason))
      })
    return () => {
      disposed = true
      void bridge.close()
    }
  }, [tool, argsKey, host, theme, device, displayMode, state])
  const width = device === 'phone' ? 375 : displayMode === 'fullscreen' ? '100%' : 560
  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          background: HOSTS[host][theme],
          colorScheme: theme,
          padding: device === 'phone' ? 12 : 24,
          borderRadius: 12,
        }}
      >
        <iframe
          ref={frameRef}
          title="Durabull MCP app"
          sandbox="allow-scripts"
          style={{
            display: 'block',
            width,
            maxWidth: '100%',
            height: 160,
            border: '1px solid rgba(128, 128, 128, 0.3)',
            borderRadius: 16,
          }}
        />
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <details className="catalog-panel">
        <summary>
          Host activity ({requests.length} tool calls, {messages.length} assistant requests) ·{' '}
          {HOSTS[host].name} · fixture data
        </summary>
        <pre className="text-xs whitespace-pre-wrap mt-3">
          {[...requests, ...messages].join('\n') ||
            'No activity yet. Explore the app to call fixture tools.'}
        </pre>
      </details>
    </section>
  )
}
