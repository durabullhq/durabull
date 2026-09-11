import { describe, expect, it } from 'bun:test'

import { isKnownMcpScope } from '../auth/scopes'
import { buildMcpResourceUri, MCP_RESOURCE_CATALOG, parseMcpResourceUri } from './resource-catalog'

describe('MCP resource catalog', () => {
  it('declares known scopes and durabull:// templates', () => {
    for (const resource of MCP_RESOURCE_CATALOG) {
      expect(resource.uriTemplate.startsWith('durabull://')).toBe(true)
      expect(resource.requiredScopes.length).toBeGreaterThan(0)
      for (const scope of resource.requiredScopes) {
        expect(isKnownMcpScope(scope)).toBe(true)
      }
    }
  })

  it('parses every template shape', () => {
    expect(parseMcpResourceUri('durabull://server')?.definition.name).toBe('server')
    expect(parseMcpResourceUri('durabull://connections')?.definition.name).toBe('connections')
    expect(parseMcpResourceUri('durabull://connections/')?.definition.name).toBe('connections')

    const queues = parseMcpResourceUri('durabull://connections/conn-1/queues')
    expect(queues?.definition.name).toBe('connection_queues')
    expect(queues?.variables).toEqual({ connectionId: 'conn-1' })

    const queue = parseMcpResourceUri('durabull://connections/conn-1/queues/email%3Asend')
    expect(queue?.definition.name).toBe('queue')
    expect(queue?.variables).toEqual({ connectionId: 'conn-1', queueName: 'email:send' })

    const alerts = parseMcpResourceUri('durabull://connections/conn-1/alerts')
    expect(alerts?.definition.name).toBe('connection_alerts')
    expect(alerts?.variables).toEqual({ connectionId: 'conn-1' })
  })

  it('fails closed on unknown or malformed URIs', () => {
    expect(parseMcpResourceUri(undefined)).toBeNull()
    expect(parseMcpResourceUri('file:///etc/passwd')).toBeNull()
    expect(parseMcpResourceUri('durabull://')).toBeNull()
    expect(parseMcpResourceUri('durabull://secrets')).toBeNull()
    expect(parseMcpResourceUri('durabull://connections//queues')).toBeNull()
    expect(parseMcpResourceUri('durabull://connections/conn-1/keys')).toBeNull()
    expect(parseMcpResourceUri('durabull://connections/conn-1/queues/a/b')).toBeNull()
    expect(parseMcpResourceUri('durabull://connections/conn-1/queues/%E0%A4%A')).toBeNull()
  })

  it('round-trips built URIs', () => {
    const uri = buildMcpResourceUri('queue', { connectionId: 'conn 1', queueName: 'a/b' })
    expect(uri).toBe('durabull://connections/conn%201/queues/a%2Fb')
    expect(parseMcpResourceUri(uri)?.variables).toEqual({
      connectionId: 'conn 1',
      queueName: 'a/b',
    })
    expect(buildMcpResourceUri('server')).toBe('durabull://server')
  })
})
