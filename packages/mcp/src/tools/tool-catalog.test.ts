import { describe, expect, it } from 'bun:test'

import {
  isKnownMcpScope,
  isMcpWriteScope,
  MCP_ALL_SCOPES,
  MCP_SCOPE_DISCOVER,
} from '../auth/scopes'
import {
  getMcpToolRequiredScopes,
  MCP_HEAVY_TOOL_NAMES,
  MCP_READ_TOOL_NAMES,
  MCP_TOOL_CATALOG,
  MCP_TOOL_NAMES,
  MCP_WRITE_TOOL_NAMES,
} from './tool-catalog'

describe('MCP tool catalog', () => {
  it('has unique snake_case names', () => {
    const names = MCP_TOOL_CATALOG.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it('gives every tool a title, a substantive description, and annotations', () => {
    for (const tool of MCP_TOOL_CATALOG) {
      expect(tool.title.length).toBeGreaterThan(2)
      expect(tool.description.length).toBeGreaterThan(40)
      expect(typeof tool.annotations.readOnlyHint).toBe('boolean')
      expect(typeof tool.annotations.destructiveHint).toBe('boolean')
      expect(typeof tool.annotations.idempotentHint).toBe('boolean')
      expect(tool.annotations.openWorldHint).toBe(false)
      expect(tool.annotations.title).toBe(tool.title)
    }
  })

  it('maps every tool to at least one known scope and never to unknown scopes', () => {
    for (const tool of MCP_TOOL_CATALOG) {
      expect(tool.requiredScopes.length).toBeGreaterThan(0)
      for (const scope of [...tool.requiredScopes, ...tool.optionalScopes]) {
        expect(isKnownMcpScope(scope)).toBe(true)
      }
    }
  })

  it('marks tools read-only exactly when they require no write scope', () => {
    for (const tool of MCP_TOOL_CATALOG) {
      const requiresWrite = tool.requiredScopes.some((scope) => isMcpWriteScope(scope))
      expect(tool.annotations.readOnlyHint).toBe(!requiresWrite)
      if (requiresWrite) {
        // Write tools must require exactly one write scope and nothing else, so a scope maps to a
        // clear, auditable set of operations.
        expect(tool.requiredScopes.length).toBe(1)
      }
      // No MCP tool is destructive by design (remove/purge/obliterate have no MCP scope).
      expect(tool.annotations.destructiveHint).toBe(false)
    }
  })

  it('never registers destructive operations', () => {
    for (const name of MCP_TOOL_NAMES) {
      expect(name).not.toMatch(/remove|purge|obliterate|delete|clean|drain/)
    }
  })

  it('declares an output schema for every tool except ping', () => {
    for (const tool of MCP_TOOL_CATALOG) {
      if (tool.name === 'ping') {
        expect(tool.outputSchema).toBeNull()
        expect(tool.requiredScopes).toEqual([MCP_SCOPE_DISCOVER])
      } else {
        expect(tool.outputSchema).not.toBeNull()
      }
    }
  })

  it('requires connectionId on every tool except ping and list_connections', () => {
    for (const tool of MCP_TOOL_CATALOG) {
      if (tool.name === 'ping' || tool.name === 'list_connections') continue
      expect(Object.keys(tool.inputSchema)).toContain('connectionId')
    }
  })

  it('partitions tools into read and write sets', () => {
    expect(MCP_READ_TOOL_NAMES.length + MCP_WRITE_TOOL_NAMES.length).toBe(MCP_TOOL_NAMES.length)
    expect(MCP_WRITE_TOOL_NAMES).toEqual([
      'resolve_alert_event',
      'acknowledge_alert_event',
      'unacknowledge_alert_event',
      'snooze_alert_rule',
      'unsnooze_alert_rule',
      'retry_job',
      'promote_job',
      'pause_queue',
      'resume_queue',
    ])
  })

  it('keeps the heavy set within the catalog', () => {
    for (const name of MCP_HEAVY_TOOL_NAMES) {
      expect(MCP_TOOL_NAMES).toContain(name)
    }
    expect(MCP_HEAVY_TOOL_NAMES.has('get_job_logs')).toBe(true)
    expect(MCP_HEAVY_TOOL_NAMES.has('explain_job_failure')).toBe(true)
  })

  it('fails closed for unknown tools', () => {
    expect(getMcpToolRequiredScopes('unmapped_future_tool')).toBeNull()
    expect(getMcpToolRequiredScopes('resolve_alert_event')).toEqual(['mcp:failures:write'])
  })

  it('covers every scope with at least one tool', () => {
    const used = new Set(MCP_TOOL_CATALOG.flatMap((tool) => [...tool.requiredScopes]))
    for (const scope of MCP_ALL_SCOPES) {
      expect(used.has(scope)).toBe(true)
    }
  })
})
