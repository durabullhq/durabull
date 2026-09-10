/**
 * Cursor-based key search on top of Redis SCAN.
 *
 * A single SCAN round returns whichever hash-table slots it visited, so a narrow MATCH pattern
 * (an exact key, for example) often yields zero matches on the first round even though the key
 * exists. Iteration order is randomized per Redis process, which made the explorer say
 * "No keys found" nondeterministically. This helper keeps scanning until the page has enough
 * matches, the keyspace is exhausted, or a bounded number of rounds has run.
 */

/** Upper bound on SCAN rounds per request so a rare pattern on a huge keyspace stays cheap. */
export const MAX_KEY_SCAN_ROUNDS = 10

export interface RedisScanClient {
  scan(
    cursor: string,
    matchToken: 'MATCH',
    pattern: string,
    countToken: 'COUNT',
    count: number
  ): Promise<[cursor: string, keys: string[]]>
}

export interface ScanKeysOptions {
  cursor: string
  pattern: string
  pageSize: number
  excludeBull: boolean
}

export interface ScanKeysResult {
  /** Matching keys, at most `pageSize`. */
  keys: string[]
  /** Cursor to continue from; "0" when the keyspace is exhausted. */
  cursor: string
  hasMore: boolean
  roundsScanned: number
}

export function isBullKey(key: string): boolean {
  return key.startsWith('bull:') || key.startsWith('bullmq:')
}

export async function scanKeysMatching(
  redis: RedisScanClient,
  options: ScanKeysOptions
): Promise<ScanKeysResult> {
  // When excluding bull keys we need to scan more to get enough non-bull keys.
  const scanCount = options.excludeBull ? options.pageSize * 4 : options.pageSize * 2
  const keys: string[] = []
  let cursor = options.cursor
  let roundsScanned = 0

  do {
    const [nextCursor, rawKeys] = await redis.scan(
      cursor,
      'MATCH',
      options.pattern,
      'COUNT',
      scanCount
    )
    cursor = nextCursor
    roundsScanned += 1
    for (const key of rawKeys) {
      if (options.excludeBull && isBullKey(key)) continue
      keys.push(key)
    }
  } while (keys.length < options.pageSize && cursor !== '0' && roundsScanned < MAX_KEY_SCAN_ROUNDS)

  return {
    keys: keys.slice(0, options.pageSize),
    cursor,
    hasMore: cursor !== '0',
    roundsScanned,
  }
}
