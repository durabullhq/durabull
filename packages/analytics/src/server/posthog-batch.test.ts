import { afterEach, describe, expect, it, mock } from 'bun:test'

import {
  isAllowedPosthogHostname,
  resolvePosthogBatchUrl,
  sendPosthogBatch,
  type PosthogBatchCapture,
} from './posthog-batch'

describe('isAllowedPosthogHostname', () => {
  it('allows official PostHog ingest hosts', () => {
    expect(isAllowedPosthogHostname('us.i.posthog.com')).toBe(true)
    expect(isAllowedPosthogHostname('eu.i.posthog.com')).toBe(true)
    expect(isAllowedPosthogHostname('us.posthog.com')).toBe(true)
  })

  it('rejects non-PostHog and private hosts', () => {
    expect(isAllowedPosthogHostname('evil.example.com')).toBe(false)
    expect(isAllowedPosthogHostname('127.0.0.1')).toBe(false)
    expect(isAllowedPosthogHostname('10.0.0.1')).toBe(false)
    expect(isAllowedPosthogHostname('169.254.169.254')).toBe(false)
    expect(isAllowedPosthogHostname('::1')).toBe(false)
  })
})

describe('resolvePosthogBatchUrl', () => {
  it('resolves default US batch endpoint', () => {
    expect(resolvePosthogBatchUrl(undefined)).toBe('https://us.i.posthog.com/batch/')
  })

  it('rejects non-HTTPS hosts', () => {
    expect(resolvePosthogBatchUrl('http://us.i.posthog.com')).toBeNull()
  })

  it('rejects disallowed hostnames', () => {
    expect(resolvePosthogBatchUrl('https://127.0.0.1')).toBeNull()
    expect(resolvePosthogBatchUrl('https://evil.example.com')).toBeNull()
  })

  it('rejects malformed URLs', () => {
    expect(resolvePosthogBatchUrl('http://[::1')).toBeNull()
  })
})

describe('sendPosthogBatch', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('cancels the response body after sending the batch', async () => {
    const cancel = mock(async () => {})
    const captures: PosthogBatchCapture[] = [
      {
        event: 'mcp_tool_called',
        properties: { tool_name: 'list_jobs' },
        distinctId: 'distinct-1',
        processPersonProfile: false,
      },
    ]

    globalThis.fetch = Object.assign(
      async () =>
        ({
          ok: true,
          status: 200,
          body: { cancel },
        }) as unknown as Response,
      { preconnect: mock(() => {}) }
    )

    const accepted = await sendPosthogBatch(
      { posthogBatchUrl: 'https://us.i.posthog.com/batch/', posthogKey: 'phc_test' },
      captures
    )

    expect(accepted).toBe(true)
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('returns false for redirect responses', async () => {
    const cancel = mock(async () => {})
    const captures: PosthogBatchCapture[] = [
      {
        event: 'mcp_tool_called',
        properties: { tool_name: 'list_jobs' },
        distinctId: 'distinct-1',
        processPersonProfile: false,
      },
    ]

    globalThis.fetch = Object.assign(
      async () =>
        ({
          ok: false,
          status: 302,
          body: { cancel },
        }) as unknown as Response,
      { preconnect: mock(() => {}) }
    )

    const accepted = await sendPosthogBatch(
      { posthogBatchUrl: 'https://us.i.posthog.com/batch/', posthogKey: 'phc_test' },
      captures
    )

    expect(accepted).toBe(false)
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
