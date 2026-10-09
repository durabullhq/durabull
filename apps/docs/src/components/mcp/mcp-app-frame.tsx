'use client'

import type { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge'
import { useInView } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { DEMO_CONNECTION_ID, demoToolResult } from '@/lib/mcp-demo-fixtures'
import { cn } from '@/lib/utils'

/** Built by tooling/copy-mcp-app.ts from the production bundle in packages/mcp. */
const APP_URL = '/mcp-app.html'

let appHtml: Promise<string> | undefined
/** One fetch per page, shared by every embed; retried after a failure. */
function loadAppHtml() {
  appHtml ??= fetch(APP_URL).then((response) => {
    if (!response.ok) throw new Error(`MCP app bundle: HTTP ${response.status}`)
    return response.text()
  })
  appHtml.catch(() => {
    appHtml = undefined
  })
  return appHtml
}

/** Conversation surfaces the app is embedded in, approximated like the Storybook host. */
export const MCP_HOST_SURFACES = {
  chatgpt: { name: 'ChatGPT', light: '#ffffff', dark: '#212121' },
  claude: { name: 'Claude', light: '#faf9f5', dark: '#262624' },
} as const

export type McpHostSurface = keyof typeof MCP_HOST_SURFACES

const DEFAULT_ARGS = {
  connectionId: DEMO_CONNECTION_ID,
  queueName: 'email:receipts',
  jobId: '48213',
}

function toolResult(name: string, args: Record<string, unknown>) {
  const data = demoToolResult(name, args)
  if (!data) throw new Error('This view is not part of the demo')
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    structuredContent: data,
    _meta: { 'durabull/view': { toolName: name, arguments: args } },
  }
}

/**
 * The production Queue Explorer MCP App, hosted in-page the way Claude or ChatGPT host it:
 * a sandboxed iframe talking to an AppBridge that answers read tools from marketing fixtures.
 * Assistant requests ("Ask to retry", ...) surface through `onAsk` instead of a real model.
 */
export function McpAppFrame({
  tool,
  args,
  theme = 'dark',
  host = 'claude',
  onAsk,
  className,
}: {
  /** Read tool whose result the app opens on. */
  tool: string
  args?: Record<string, unknown>
  theme?: 'light' | 'dark'
  host?: McpHostSurface
  onAsk?: (text: string) => void
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const inView = useInView(rootRef, { once: true, margin: '400px' })
  const bridgeRef = useRef<AppBridge | null>(null)
  const onAskRef = useRef(onAsk)
  onAskRef.current = onAsk
  const themeRef = useRef(theme)
  themeRef.current = theme
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  /** Bumped by "Try again" to rerun the load effect. */
  const [attempt, setAttempt] = useState(0)
  const [height, setHeight] = useState<number | null>(null)
  const argsKey = JSON.stringify(args ?? {})

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` reruns the load after a failure
  useEffect(() => {
    const iframe = frameRef.current
    if (!iframe || !inView) return
    const input = tool === 'list_connections' ? {} : { ...DEFAULT_ARGS, ...JSON.parse(argsKey) }
    let disposed = false
    let bridge: AppBridge | null = null
    setReady(false)
    setFailed(false)

    void Promise.all([import('@modelcontextprotocol/ext-apps/app-bridge'), loadAppHtml()])
      .then(async ([{ AppBridge, PostMessageTransport }, html]) => {
        if (disposed || !iframe.contentWindow) return
        bridge = new AppBridge(
          null,
          { name: 'Durabull marketing host', version: '1.0.0' },
          { serverTools: {}, message: { text: {} }, updateModelContext: {} },
          {
            hostContext: {
              theme: themeRef.current,
              displayMode: 'inline',
              availableDisplayModes: ['inline'],
              platform: 'web',
              toolInfo: { tool: { name: tool, inputSchema: { type: 'object' } } },
            },
          }
        )
        bridge.oncalltool = async ({ name, arguments: callArgs }) => {
          await new Promise((done) => setTimeout(done, 160))
          return toolResult(name, callArgs ?? {})
        }
        bridge.onmessage = async ({ content }) => {
          const text = content.find((block) => block.type === 'text')
          if (text && 'text' in text) onAskRef.current?.(text.text.split('\n')[0])
          return {}
        }
        bridge.onupdatemodelcontext = async () => ({})
        bridge.onsizechange = ({ height: next }) => {
          if (next) setHeight(Math.ceil(next))
        }
        bridge.oninitialized = async () => {
          if (disposed || !bridge) return
          await bridge.sendToolInput({ arguments: input })
          await bridge.sendToolResult(toolResult(tool, input))
          if (!disposed) setReady(true)
        }
        await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow))
        if (disposed) return
        bridgeRef.current = bridge
        // srcdoc, like the Storybook host: an opaque-origin document with no network access.
        iframe.srcdoc = html
      })
      .catch((error) => {
        if (disposed) return
        console.warn('Durabull MCP app embed failed to load', error)
        setFailed(true)
      })

    return () => {
      disposed = true
      bridgeRef.current = null
      void bridge?.close()
    }
  }, [tool, argsKey, inView, attempt])

  // Theme flips are host-context changes, not a reload, just as in a real host.
  useEffect(() => {
    bridgeRef.current?.setHostContext({ theme })
  }, [theme])

  const surface = MCP_HOST_SURFACES[host][theme]
  return (
    <div
      ref={rootRef}
      className={cn('relative transition-colors duration-300', className)}
      style={{ background: surface, colorScheme: theme }}
    >
      <iframe
        ref={frameRef}
        title={`Durabull Queue Explorer MCP App, ${MCP_HOST_SURFACES[host].name} ${theme} theme`}
        sandbox="allow-scripts"
        className={cn(
          'block w-full transition-opacity duration-300',
          ready ? 'opacity-100' : 'opacity-0'
        )}
        style={{ height: height ?? 420, border: 0, background: 'transparent' }}
      />
      {ready ? null : failed ? (
        <output
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-[13px]"
          style={{ color: theme === 'dark' ? '#d4d4d4' : '#525252' }}
        >
          The Queue Explorer demo couldn’t load.
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded-md border border-current px-3 py-1 text-[12px] font-medium"
          >
            Try again
          </button>
        </output>
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 flex flex-col gap-3 p-4"
          style={{ color: theme === 'dark' ? '#fff' : '#000' }}
        >
          <span className="h-3 w-24 animate-pulse rounded bg-current opacity-10" />
          <span className="h-7 w-48 animate-pulse rounded bg-current opacity-10" />
          <span className="h-24 w-full animate-pulse rounded-xl bg-current opacity-[0.06]" />
          <span className="h-24 w-full animate-pulse rounded-xl bg-current opacity-[0.06]" />
        </div>
      )}
    </div>
  )
}
