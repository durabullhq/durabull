import { describe, expect, it } from 'bun:test'

import { MAX_KEY_SCAN_ROUNDS, type RedisScanClient, scanKeysMatching } from './redis-key-scan'

/** Fake SCAN over a fixed key order, returning `slice` keys per round like a real hash-table walk. */
function fakeRedis(allKeys: string[], slice: number) {
  const calls: Array<{ cursor: string; pattern: string; count: number }> = []
  const client: RedisScanClient = {
    async scan(cursor, _match, pattern, _countToken, count) {
      calls.push({ cursor, pattern, count })
      const start = Number(cursor)
      const end = Math.min(start + slice, allKeys.length)
      const regex = new RegExp(
        `^${pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.')}$`
      )
      const matched = allKeys.slice(start, end).filter((key) => regex.test(key))
      return [end >= allKeys.length ? '0' : String(end), matched]
    },
  }
  return { client, calls }
}

const KEYS = [
  ...Array.from({ length: 120 }, (_, index) => `bull:queue:${index}`),
  ...Array.from({ length: 120 }, (_, index) => `cache:${index}`),
  'session:usr_target',
  ...Array.from({ length: 7 }, (_, index) => `rate:${index}`),
]

describe('scanKeysMatching', () => {
  it('keeps scanning until an exact key deep in the keyspace is found', async () => {
    const { client, calls } = fakeRedis(KEYS, 100)
    const result = await scanKeysMatching(client, {
      cursor: '0',
      pattern: 'session:usr_target',
      pageSize: 50,
      excludeBull: false,
    })

    expect(result.keys).toEqual(['session:usr_target'])
    expect(result.roundsScanned).toBe(3)
    expect(calls.map((call) => call.cursor)).toEqual(['0', '100', '200'])
    expect(result.hasMore).toBe(false)
    expect(result.cursor).toBe('0')
  })

  it('stops after one round when a broad pattern already fills the page', async () => {
    const { client } = fakeRedis(KEYS, 100)
    const result = await scanKeysMatching(client, {
      cursor: '0',
      pattern: '*',
      pageSize: 50,
      excludeBull: false,
    })

    expect(result.keys).toHaveLength(50)
    expect(result.roundsScanned).toBe(1)
    expect(result.hasMore).toBe(true)
    expect(result.cursor).toBe('100')
  })

  it('filters bull keys and scans with a larger COUNT when excluding them', async () => {
    const { client, calls } = fakeRedis(KEYS, 200)
    const result = await scanKeysMatching(client, {
      cursor: '0',
      pattern: '*',
      pageSize: 50,
      excludeBull: true,
    })

    expect(calls[0]?.count).toBe(200)
    expect(result.keys.every((key) => !key.startsWith('bull:'))).toBe(true)
    expect(result.keys).toHaveLength(50)
  })

  it('bounds the number of rounds for patterns that never match', async () => {
    const huge = Array.from({ length: 5_000 }, (_, index) => `k:${index}`)
    const { client } = fakeRedis(huge, 100)
    const result = await scanKeysMatching(client, {
      cursor: '0',
      pattern: 'missing:*',
      pageSize: 50,
      excludeBull: false,
    })

    expect(result.keys).toEqual([])
    expect(result.roundsScanned).toBe(MAX_KEY_SCAN_ROUNDS)
    expect(result.hasMore).toBe(true)
    expect(result.cursor).toBe(String(MAX_KEY_SCAN_ROUNDS * 100))
  })

  it('resumes from a caller-supplied cursor', async () => {
    const { client, calls } = fakeRedis(KEYS, 100)
    const result = await scanKeysMatching(client, {
      cursor: '200',
      pattern: 'rate:*',
      pageSize: 50,
      excludeBull: false,
    })

    expect(calls[0]?.cursor).toBe('200')
    expect(result.keys).toHaveLength(7)
    expect(result.hasMore).toBe(false)
  })
})
