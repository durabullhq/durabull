import { describe, expect, it, mock } from 'bun:test'
import { Explorer } from './explorer'
import { refreshToolCall } from './read-tools'

function setup() {
  const callServerTool = mock(
    async (_call: { name: string; arguments?: Record<string, unknown> }) => ({
      content: [],
      structuredContent: { connectionId: 'one', queueName: 'email', counts: {} },
    })
  )
  const bridge: ConstructorParameters<typeof Explorer>[0] = {
    callServerTool,
    sendMessage: async () => ({}),
    updateModelContext: async () => ({}),
    requestDisplayMode: async ({ mode }) => ({ mode }),
    getHostCapabilities: () => ({}),
    getHostContext: () => ({
      toolInfo: { tool: { name: 'render_ui', inputSchema: { type: 'object' } } },
    }),
  }
  const explorer = new Explorer(bridge)
  return { explorer, callServerTool }
}

const args = { connectionId: 'one', queueName: 'email' }
const display = (toolName = 'get_queue', arguments_ = args) => ({
  content: [],
  structuredContent: { toolName, arguments: arguments_ },
})

describe('intentional MCP UI rendering', () => {
  it('waits for the display request, then reads the selected view once through the host', async () => {
    const { explorer, callServerTool } = setup()
    explorer.connected(undefined)
    explorer.toolInput({ toolName: 'get_queue', arguments: args })
    expect(callServerTool).not.toHaveBeenCalled()
    await explorer.toolResult(display())
    expect(callServerTool).toHaveBeenCalledTimes(1)
    expect(callServerTool.mock.calls[0]![0]).toEqual({ name: 'get_queue', arguments: args })
    expect(explorer.getState().view).toMatchObject({
      tool: 'get_queue',
      args,
      data: { queueName: 'email' },
    })
    expect(refreshToolCall(explorer.getState().view!.tool, args)).toEqual({
      name: 'get_queue',
      arguments: args,
    })
  })

  it('surfaces denied reads and retries the same read without opening another UI', async () => {
    const { explorer, callServerTool } = setup()
    callServerTool.mockRejectedValueOnce(new Error('insufficient_scope'))
    await explorer.toolResult(display())
    expect(explorer.getState().view).toBeUndefined()
    expect(explorer.getState().error).not.toBe('')
    expect(explorer.getState().failedRead).toEqual({ tool: 'get_queue', args, remember: false })
    const failed = explorer.getState().failedRead!
    await explorer.load(failed.tool, failed.args, failed.remember)
    expect(callServerTool).toHaveBeenCalledTimes(2)
    expect(explorer.getState().error).toBe('')
  })

  it('refuses mutations, recursive rendering and unknown tools even with a permissive host', async () => {
    const { explorer, callServerTool } = setup()
    for (const name of ['pause_queue', 'render_ui', 'unknown_tool', 'ping']) {
      await explorer.toolResult(display(name))
      expect(explorer.getState().view).toBeUndefined()
      expect(explorer.getState().error).not.toBe('')
    }
    expect(callServerTool).not.toHaveBeenCalled()
  })

  it('adopts delivered data snapshots without fetching them again', async () => {
    const { explorer, callServerTool } = setup()
    await explorer.toolResult({
      content: [],
      structuredContent: { queueName: 'email' },
      _meta: { 'durabull/view': { toolName: 'get_queue', arguments: args } },
    })
    expect(explorer.getState().view?.tool).toBe('get_queue')
    expect(callServerTool).not.toHaveBeenCalled()
  })

  it('does not issue any read when the server rejects a display request', async () => {
    const { explorer, callServerTool } = setup()
    explorer.toolInput({ toolName: 'get_queue', arguments: args })
    await explorer.toolResult({
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              code: 'validation_error',
              message: 'Call the read tool directly with the original arguments instead.',
            },
          }),
        },
      ],
    })
    expect(callServerTool).not.toHaveBeenCalled()
    expect(explorer.getState().view).toBeUndefined()
    expect(explorer.getState().error).toContain('read tool directly')
  })
})
