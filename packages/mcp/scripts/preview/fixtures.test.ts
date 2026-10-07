import { describe, expect, it } from 'bun:test'
import { getMcpToolDefinition } from '../../src/tools/tool-catalog'
import { fixture } from './fixtures'

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
