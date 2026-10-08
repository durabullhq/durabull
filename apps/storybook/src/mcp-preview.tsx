import html from 'virtual:durabull-mcp-app'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import { useEffect, useRef, useState } from 'react'
import { getMcpToolDefinition } from '../../../packages/mcp/src/tools/tool-catalog'
import { mcpFixture } from './fixtures/mcp'

export interface McpPreviewProps {
  tool: string
  theme?: 'light' | 'dark'
  state?: 'ready' | 'empty' | 'loading' | 'error'
  width?: number
}
export function McpPreview({ tool, theme = 'light', state = 'ready', width }: McpPreviewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [requests, setRequests] = useState<string[]>([])
  const [messages, setMessages] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const iframe = frameRef.current!
    const args =
      tool === 'list_connections'
        ? {}
        : {
            connectionId: 'preview-production',
            queueName: 'email:receipts',
            jobId: 'job-1042',
            schedulerId: 'daily-summary',
          }
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
      { name: 'Durabull Storybook host', version: '1.0.0' },
      { serverTools: {}, message: { text: {} }, updateModelContext: {}, openLinks: {} },
      {
        hostContext: {
          theme,
          displayMode: 'inline',
          availableDisplayModes: ['inline', 'fullscreen'],
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
      if (height) iframe.style.height = `${Math.max(height, 400)}px`
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
  }, [tool, theme, state])
  return (
    <section style={{ maxWidth: width, margin: '0 auto' }}>
      <p className="catalog-eyebrow mb-3">Local MCP host · Fixture data</p>
      {error ? <p role="alert">{error}</p> : null}
      <iframe
        ref={frameRef}
        title="Durabull MCP app"
        sandbox="allow-scripts"
        style={{ border: 0, width: '100%', minHeight: 500 }}
      />
      <details className="catalog-panel mt-4">
        <summary>
          Host activity ({requests.length} tool calls, {messages.length} assistant requests)
        </summary>
        <pre className="text-xs whitespace-pre-wrap mt-3">
          {[...requests, ...messages].join('\n') ||
            'No activity yet. Explore the app to call fixture tools.'}
        </pre>
      </details>
    </section>
  )
}
