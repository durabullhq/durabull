import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { createLinearComment, fetchLinearIssueStatus, LinearApiError } from './linear-client'

const commentId = '55555555-5555-4555-8555-555555555555'
const issueId = '66666666-6666-4666-8666-666666666666'
const json = (data: unknown, status = 200) => Response.json(data, { status })

afterEach(() => mock.restore())

describe('Linear resolution client', () => {
  it('uses the persisted comment UUID in the provider mutation', async () => {
    const requests: Array<{ query: string; variables: Record<string, unknown> }> = []
    spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(
        async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
          requests.push(JSON.parse(String(init?.body)))
          return json({ data: { commentCreate: { success: true } } })
        },
        { preconnect: fetch.preconnect }
      )
    )
    await createLinearComment('token', issueId, 'Resolved', commentId)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.variables).toEqual({ input: { issueId, body: 'Resolved', id: commentId } })
  })

  it('verifies a comment after its create response is lost, avoiding duplicate comments', async () => {
    const fetchMock = spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Network response lost'))
      .mockResolvedValueOnce(json({ data: { comment: { id: commentId, issue: { id: issueId } } } }))
    await createLinearComment('token', issueId, 'Resolved', commentId)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const lookup = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(lookup.query).toContain('comment(id: $commentId)')
    expect(lookup.variables).toEqual({ commentId })
  })

  it('accepts a duplicate UUID only after verifying its issue', async () => {
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ errors: [{ message: 'Duplicate ID' }] }, 400))
      .mockResolvedValueOnce(json({ data: { comment: { id: commentId, issue: { id: issueId } } } }))
    await expect(
      createLinearComment('token', issueId, 'Resolved', commentId)
    ).resolves.toBeUndefined()
  })

  it('preserves the original retryable failure when comment verification fails', async () => {
    spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Network response lost'))
      .mockResolvedValueOnce(json({ errors: [{ message: 'Not found' }] }, 404))
    try {
      await createLinearComment('token', issueId, 'Resolved', commentId)
      throw new Error('Expected the provider failure')
    } catch (error) {
      expect(error).toBeInstanceOf(LinearApiError)
      expect((error as LinearApiError).retryable).toBe(true)
      expect((error as Error).message).toBe('Network response lost')
    }
  })

  it('retries duplicate UUID verification when the provider lookup is unavailable', async () => {
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ errors: [{ message: 'Duplicate ID' }] }, 400))
      .mockResolvedValueOnce(json({ errors: [{ message: 'Unavailable' }] }, 503))
    try {
      await createLinearComment('token', issueId, 'Resolved', commentId)
      throw new Error('Expected verification failure')
    } catch (error) {
      expect(error).toBeInstanceOf(LinearApiError)
      expect((error as LinearApiError).status).toBe(503)
      expect((error as LinearApiError).retryable).toBe(true)
    }
  })

  it('rejects a lookup that belongs to another issue', async () => {
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ data: { commentCreate: { success: false } } }))
      .mockResolvedValueOnce(
        json({ data: { comment: { id: commentId, issue: { id: 'other-issue' } } } })
      )
    await expect(createLinearComment('token', issueId, 'Resolved', commentId)).rejects.toThrow(
      'did not create'
    )
  })

  it('classifies an unavailable issue as terminal instead of dereferencing null', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ data: { issue: null } }))
    try {
      await fetchLinearIssueStatus('token', issueId)
      throw new Error('Expected missing issue failure')
    } catch (error) {
      expect(error).toBeInstanceOf(LinearApiError)
      expect((error as LinearApiError).status).toBe(404)
      expect((error as LinearApiError).retryable).toBe(false)
    }
  })

  it('ignores invalid rate-limit reset timestamps', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Rate limited', {
        status: 429,
        headers: { 'x-ratelimit-reset': '100000000000000000000' },
      })
    )
    try {
      await createLinearComment('token', issueId, 'Resolved')
      throw new Error('Expected rate limit failure')
    } catch (error) {
      expect(error).toBeInstanceOf(LinearApiError)
      expect((error as LinearApiError).rateLimitResetAt).toBeNull()
      expect((error as LinearApiError).retryable).toBe(true)
    }
  })

  it('redacts credentials in network exception messages', async () => {
    spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Failed using lin_api_secret_token'))
    await expect(createLinearComment('token', issueId, 'Resolved')).rejects.toThrow(
      '[REDACTED_LINEAR_TOKEN]'
    )
  })
})
