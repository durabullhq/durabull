import { describe, expect, it } from 'bun:test'

import { MCP_TOOL_NAMES } from '../tools/tool-catalog'
import { MCP_PROMPT_CATALOG } from './prompt-catalog'

describe('MCP prompt catalog', () => {
  it('renders every prompt and only references real tools', () => {
    for (const prompt of MCP_PROMPT_CATALOG) {
      const text = prompt.render({
        connectionId: 'conn-1',
        queueName: 'email',
        limit: '5',
        recentEvents: '20',
      })
      expect(text).toContain('conn-1')
      const referencedTools = text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []
      const toolLike = referencedTools.filter((token) =>
        /^(list|get|find|explain|retry|promote|pause|resume|resolve|acknowledge|unacknowledge|snooze|unsnooze)_/.test(
          token
        )
      )
      expect(toolLike.length).toBeGreaterThan(0)
      for (const token of toolLike) {
        expect(MCP_TOOL_NAMES).toContain(token)
      }
    }
  })

  it('clamps numeric arguments', () => {
    const triage = MCP_PROMPT_CATALOG.find((prompt) => prompt.name === 'triage_failed_jobs')!
    expect(triage.render({ connectionId: 'c', queueName: 'q', limit: '999' })).toContain(
      'pageSize 50'
    )
    expect(triage.render({ connectionId: 'c', queueName: 'q', limit: 'abc' })).toContain(
      'pageSize 10'
    )
  })

  it('marks connectionId as required on every prompt', () => {
    for (const prompt of MCP_PROMPT_CATALOG) {
      const connectionArg = prompt.arguments.find((argument) => argument.name === 'connectionId')
      expect(connectionArg?.required).toBe(true)
    }
  })
})
