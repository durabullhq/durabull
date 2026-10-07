import { describe, expect, it, mock } from 'bun:test'
import { getMcpToolDefinition, MCP_WRITE_TOOL_NAMES } from '../../tools/tool-catalog'
import { callReadTool, refreshToolCall } from './read-tools'

describe('MCP App read boundary', () => {
  it('never sends a mutation or unknown tool through a permissive host bridge', async () => {
    const callServerTool = mock(async () => ({ content: [] }))
    for (const name of [...MCP_WRITE_TOOL_NAMES, 'unknown_tool']) {
      await expect(callReadTool({ callServerTool }, { name, arguments: {} })).rejects.toThrow(
        'Use the assistant'
      )
    }
    expect(callServerTool).not.toHaveBeenCalled()
  })

  it('refreshes every mutation through a read, preserving entity ids and dropping write args', async () => {
    const ids = {
      connectionId: 'connection-1',
      queueName: 'email',
      jobId: 'job-1',
      eventId: 'event-1',
      ruleId: 'rule-1',
      minutes: 60,
    }
    const callServerTool = mock(async () => ({ content: [] }))
    for (const name of MCP_WRITE_TOOL_NAMES) {
      const call = refreshToolCall(name, ids)!
      expect(call).not.toBeNull()
      expect(getMcpToolDefinition(call.name)?.annotations.readOnlyHint).toBe(true)
      expect(call.arguments?.connectionId).toBe(ids.connectionId)
      expect(call.arguments).not.toHaveProperty('minutes')
      await callReadTool({ callServerTool }, call)
    }
    expect(refreshToolCall('retry_job', ids)).toEqual({
      name: 'get_job',
      arguments: { connectionId: 'connection-1', queueName: 'email', jobId: 'job-1' },
    })
    expect(callServerTool).toHaveBeenCalledTimes(MCP_WRITE_TOOL_NAMES.length)
    expect(refreshToolCall('unknown_tool', ids)).toBeNull()
  })

  it('keeps read pagination, filters and request cancellation on refresh', async () => {
    const args = {
      connectionId: 'connection-1',
      queueName: 'email',
      cursor: 'page-2',
      status: 'failed',
    }
    const call = refreshToolCall('list_jobs', args)!
    const options = { signal: new AbortController().signal, timeout: 30_000 }
    const callServerTool = mock(async () => ({ content: [] }))
    await callReadTool({ callServerTool }, call, options)
    expect(callServerTool).toHaveBeenCalledWith({ name: 'list_jobs', arguments: args }, options)
  })
})
