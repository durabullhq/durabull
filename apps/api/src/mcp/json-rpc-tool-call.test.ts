import { describe, expect, it } from 'bun:test'

import {
  isMcpResourcesReadMethod,
  parseMcpPolicyOperation,
  parseMcpResourceReadBody,
  parseMcpToolCallBody,
} from './json-rpc-tool-call'

describe('MCP JSON-RPC operation parsing', () => {
  it('parses tools/call with a trimmed connectionId', () => {
    const parsed = parseMcpToolCallBody({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'get_queue', arguments: { connectionId: ' conn-1 ', queueName: 'q' } },
    })
    expect(parsed).toEqual({
      toolName: 'get_queue',
      arguments: { connectionId: ' conn-1 ', queueName: 'q' },
      connectionId: 'conn-1',
      payloadId: 7,
    })
  })

  it('rejects tools/call without a string name', () => {
    expect(
      parseMcpToolCallBody({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} })
    ).toBeNull()
  })

  it('parses resources/read into a policy operation carrying catalog scopes', () => {
    const body = {
      jsonrpc: '2.0',
      id: 'abc',
      method: 'resources/read',
      params: { uri: 'durabull://connections/conn-9/queues/email' },
    }
    expect(isMcpResourcesReadMethod(body)).toBe(true)
    const parsed = parseMcpResourceReadBody(body)
    expect(parsed).toEqual({
      resourceName: 'queue',
      operationName: 'resource:queue',
      uri: 'durabull://connections/conn-9/queues/email',
      requiredScopes: ['mcp:jobs:read'],
      connectionId: 'conn-9',
      payloadId: 'abc',
    })

    const operation = parseMcpPolicyOperation(body)
    expect(operation?.kind).toBe('resource')
    expect(operation?.name).toBe('resource:queue')
    expect(operation?.connectionId).toBe('conn-9')
    expect(operation?.requiredScopes).toEqual(['mcp:jobs:read'])
  })

  it('returns null for unknown resource URIs so the middleware fails closed', () => {
    expect(
      parseMcpResourceReadBody({
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/read',
        params: { uri: 'durabull://connections/conn-9/redis-keys' },
      })
    ).toBeNull()
    expect(
      parseMcpPolicyOperation({
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/read',
        params: { uri: 'file:///etc/hosts' },
      })
    ).toBeNull()
  })

  it('ignores non-policy methods', () => {
    expect(parseMcpPolicyOperation({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).toBeNull()
    expect(parseMcpPolicyOperation({ jsonrpc: '2.0', id: 1, method: 'prompts/get' })).toBeNull()
    expect(parseMcpPolicyOperation([{ method: 'tools/call' }])).toBeNull()
  })
})
