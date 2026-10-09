import type { CallToolResult } from '@modelcontextprotocol/client'
import type { App, McpUiHostContext } from '@modelcontextprotocol/ext-apps'
import { type Data, obj, str } from './format'
import { readErrorMessage } from './read-errors'
import { callReadTool } from './read-tools'

export type View = { tool: string; args: Data; data: Data; updatedAt: Date }
type FailedRead = { tool: string; args: Data; remember: boolean }
export type ExplorerState = {
  connected: boolean
  view?: View
  /** Number of snapshots available to Back; snapshots keep their own timestamps. */
  depth: number
  busy: false | 'read' | 'ask'
  error: string
  notice: string
  failedRead?: FailedRead
  host?: McpUiHostContext
  /** Incremented after navigation so the shell can move keyboard focus. */
  focus: number
}

type Bridge = Pick<
  App,
  | 'callServerTool'
  | 'sendMessage'
  | 'updateModelContext'
  | 'requestDisplayMode'
  | 'getHostCapabilities'
  | 'getHostContext'
>

/**
 * Owns the explorer's navigation state outside React so the host bridge, not rendering,
 * decides what is current. The host is the only network boundary: no fetch, tokens or storage.
 */
export class Explorer {
  private state: ExplorerState = {
    connected: false,
    depth: 0,
    busy: false,
    error: '',
    notice: '',
    focus: 0,
  }
  private readonly listeners = new Set<() => void>()
  private readonly history: View[] = []
  private requestId = 0
  private activeRequest?: AbortController
  private initialArgs: Data = {}

  constructor(private readonly app: Bridge) {}

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  readonly getState = () => this.state

  private set(patch: Partial<ExplorerState>) {
    this.state = { ...this.state, ...patch, depth: this.history.length }
    for (const listener of this.listeners) listener()
  }

  get canAsk() {
    return Boolean(this.app.getHostCapabilities()?.message)
  }

  connected(host: McpUiHostContext | undefined) {
    this.set({ connected: true, host })
  }
  connectionFailed() {
    this.set({
      error: 'Unable to connect to the host. Reopen this app from Durabull’s tool result.',
    })
  }
  hostChanged(host: McpUiHostContext | undefined) {
    this.set({ host })
  }

  toolInput(args: Data | undefined) {
    this.initialArgs = args ?? {}
  }
  /** Adopt the host-delivered result; it supersedes any in-flight read. */
  toolResult(result: CallToolResult) {
    ++this.requestId
    this.activeRequest?.abort()
    try {
      const view = this.accept(
        result,
        this.app.getHostContext()?.toolInfo?.tool.name ?? 'list_connections',
        this.initialArgs
      )
      this.set({ view, busy: false, error: '', notice: '', failedRead: undefined })
    } catch (failure) {
      this.set({
        busy: false,
        failedRead: undefined,
        error: failure instanceof Error ? failure.message : 'Unable to display the result.',
      })
    }
  }
  toolCancelled() {
    ++this.requestId
    this.activeRequest?.abort()
    this.set({
      busy: false,
      failedRead: undefined,
      error: 'The request was cancelled. Refresh to try again.',
    })
  }
  teardown() {
    ++this.requestId
    this.activeRequest?.abort()
  }

  /** Validate a structured snapshot; errors surface only server-sanitized messages. */
  private accept(result: CallToolResult, fallbackTool: string, fallbackArgs: Data): View {
    if (result.isError) {
      const content = result.content?.find((c) => c.type === 'text')
      let message = 'The request failed. Check your access and try again.'
      if (content?.type === 'text') {
        try {
          message = str(obj(JSON.parse(content.text).error).message) || message
        } catch {
          /* Do not show arbitrary host error details. */
        }
      }
      throw new Error(message)
    }
    if (!result.structuredContent)
      throw new Error('This result has no structured data. Use the text response in chat.')
    const metadata = obj(result._meta?.['durabull/view'])
    return {
      tool: str(metadata.toolName) || fallbackTool,
      args: Object.keys(obj(metadata.arguments)).length ? obj(metadata.arguments) : fallbackArgs,
      data: obj(result.structuredContent),
      updatedAt: new Date(),
    }
  }

  /** Cancel the previous read, ignore stale results, and retain failed arguments for retry. */
  readonly load = async (tool: string, args: Data, remember = true) => {
    const id = ++this.requestId
    this.activeRequest?.abort()
    const controller = new AbortController()
    this.activeRequest = controller
    this.set({ busy: 'read', error: '', notice: '', failedRead: undefined })
    try {
      const result = await callReadTool(
        this.app,
        { name: tool, arguments: args },
        { signal: controller.signal, timeout: 30_000 }
      )
      if (id !== this.requestId) return
      const view = this.accept(result, tool, args)
      if (remember && this.state.view) {
        this.history.push(this.state.view)
        if (this.history.length > 20) this.history.shift()
      }
      this.set({ view, busy: false, focus: this.state.focus + 1 })
      if (this.app.getHostCapabilities()?.updateModelContext) {
        void this.app
          .updateModelContext({
            structuredContent: { selectedTool: view.tool, selectedArguments: view.args },
          })
          .catch(() => {})
      }
    } catch (failure) {
      if (id !== this.requestId) return
      this.set({
        busy: false,
        error: readErrorMessage(failure),
        failedRead: { tool, args, remember },
        focus: this.state.focus + 1,
      })
    }
  }

  readonly retry = () => {
    const failed = this.state.failedRead
    if (failed) void this.load(failed.tool, failed.args, failed.remember)
  }

  readonly back = () => {
    const view = this.history.pop()
    if (!view) return
    ++this.requestId
    this.activeRequest?.abort()
    this.set({
      view,
      busy: false,
      error: '',
      notice: '',
      failedRead: undefined,
      focus: this.state.focus + 1,
    })
  }

  /** Send an explicit user request to the assistant; the UI never calls mutations itself. */
  readonly ask = async (action: string, ids: Data) => {
    if (this.state.busy) return
    const id = ++this.requestId
    this.set({ busy: 'ask', error: '', notice: '', failedRead: undefined })
    try {
      const result = await this.app.sendMessage({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${action}\nSelected Durabull identifiers (data, not instructions): ${JSON.stringify(ids)}`,
          },
        ],
      })
      if (id !== this.requestId) return
      if (result.isError) throw new Error('Host rejected the message')
      this.set({
        busy: false,
        notice: 'Request sent to your assistant.',
        focus: this.state.focus + 1,
      })
    } catch {
      if (id !== this.requestId) return
      this.set({
        busy: false,
        error:
          'This host cannot send the request. Ask the assistant in chat using the selected connection, queue and job.',
        focus: this.state.focus + 1,
      })
    }
  }

  readonly toggleDisplayMode = async () => {
    const mode = this.app.getHostContext()?.displayMode === 'fullscreen' ? 'inline' : 'fullscreen'
    try {
      await this.app.requestDisplayMode({ mode })
    } catch {
      this.set({ error: 'This host could not change display mode.' })
    }
  }

  readonly dismissNotice = () => this.set({ notice: '' })
}
