import { describe, expect, it } from 'bun:test'
import { readErrorMessage } from './read-errors'

describe('MCP App access errors', () => {
  it('distinguishes OAuth scope elevation from tenant policy denial', () => {
    const message = 'Forbidden: MCP policy denied this tool call.'
    const scope = Object.assign(new Error(message), { data: { code: 'insufficient_scope' } })
    const tenant = Object.assign(new Error(message), { data: { code: 'policy_denied' } })
    expect(readErrorMessage(scope)).toContain('additional scopes')
    expect(readErrorMessage(tenant)).toContain('administrator')
    expect(readErrorMessage(tenant)).not.toContain('Reconnect')
  })

  it('does not promise OAuth can fix a generic forbidden response', () => {
    expect(readErrorMessage(new Error('HTTP403 Forbidden'))).toContain('administrator')
    expect(readErrorMessage(new Error('401 Unauthorized'))).toContain('Reconnect')
    expect(readErrorMessage(new Error('insufficient_scope'))).toContain('additional scopes')
  })

  it('does not expose arbitrary transport errors or tokens', () => {
    expect(readErrorMessage(new Error('secret backend details'))).not.toContain('secret')
    expect(readErrorMessage(null)).toContain('Retry')
  })
})
