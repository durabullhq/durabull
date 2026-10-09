import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { getMcpToolDefinition, MCP_READ_TOOL_NAMES } from '@durabull/mcp'
import { DEMO_CONNECTION_ID, demoToolResult } from './mcp-demo-fixtures'

const registry = await Bun.file(
  resolve(import.meta.dir, '../../../../packages/mcp/src/apps/ui/views/registry.tsx')
).text()
/** Every read view the production Queue Explorer can navigate to. */
const readViews = [...registry.matchAll(/^ {2}([a-z_]+): /gm)]
  .map((match) => match[1])
  .filter((name) => MCP_READ_TOOL_NAMES.includes(name))

describe('marketing MCP app fixtures', () => {
  test('cover the app views', () => expect(readViews.length).toBeGreaterThan(10))

  for (const name of readViews) {
    test(`${name} matches the server output schema`, () => {
      const data = demoToolResult(name, {
        connectionId: DEMO_CONNECTION_ID,
        queueName: 'email:receipts',
        jobId: '48213',
      })
      expect(data).not.toBeNull()
      getMcpToolDefinition(name)!.outputSchema!.parse(data)
    })
  }
})
