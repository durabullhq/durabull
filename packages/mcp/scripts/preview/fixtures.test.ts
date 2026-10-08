import { describe, expect, it } from 'bun:test'
import { getMcpToolDefinition, MCP_TOOL_CATALOG } from '../../src/tools/tool-catalog'
import { fixture } from './fixtures'

describe('MCP App preview coverage', () => {
  for (const tool of MCP_TOOL_CATALOG.filter(
    (tool) => tool.annotations.readOnlyHint && tool.outputSchema
  )) {
    it(`renders schema-valid evidence for ${tool.name}`, () => {
      const data = fixture(tool.name, {
        connectionId: 'preview-production',
        queueName: 'email:receipts',
        jobId: 'job-1042',
        schedulerId: 'daily-receipts',
        eventId: 'evt-1',
        ruleId: 'rule-1',
      })
      expect(tool.outputSchema!.safeParse(data).success).toBe(true)
    })
  }
})

describe('preview connection navigation', () => {
  const tools = [
    'get_connection_overview',
    'list_queues',
    'get_queue',
    'list_jobs',
    'get_job',
    'get_job_logs',
    'get_job_stacktraces',
    'get_failure_events',
    'get_workers',
  ]

  for (const connectionId of ['preview-production', 'preview-staging']) {
    it(`keeps ${connectionId} throughout queue and job drill-downs`, () => {
      for (const name of tools) {
        const data = fixture(name, { connectionId, queueName: 'email:receipts' })
        expect(data).toMatchObject({ connectionId })
        expect(getMcpToolDefinition(name)!.outputSchema!.safeParse(data).success).toBe(true)
      }
      expect(fixture('get_connection_overview', { connectionId })).toMatchObject({
        name: connectionId === 'preview-staging' ? 'Staging' : 'Production',
        environment: connectionId === 'preview-staging' ? 'staging' : 'production',
      })
    })
  }

  it('rejects an unknown connection instead of showing production data', () => {
    expect(() => fixture('get_connection_overview', { connectionId: 'missing' })).toThrow(
      'Unknown preview connection'
    )
  })
})
