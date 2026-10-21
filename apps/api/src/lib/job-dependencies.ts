import type { Redis } from 'ioredis'

export type DependencyKind = 'unprocessed' | 'processed' | 'failed' | 'ignored'

export function parseJobReference(key: string, prefix: string) {
  const namespace = `${prefix}:`
  if (!key.startsWith(namespace)) return null
  const remainder = key.slice(namespace.length)
  const separator = remainder.indexOf(':')
  if (separator < 1 || separator === remainder.length - 1) return null
  return { queueName: remainder.slice(0, separator), jobId: remainder.slice(separator + 1) }
}

/** Scan only one dependency collection, preserving Redis's opaque 64-bit cursor. */
export async function readDependencyPage(
  client: Pick<Redis, 'sscan' | 'hscan' | 'zscan'>,
  jobKey: string,
  kind: DependencyKind,
  cursor: string,
  count: number
) {
  const [nextCursor, entries] =
    kind === 'unprocessed'
      ? await client.sscan(`${jobKey}:dependencies`, cursor, 'COUNT', count)
      : kind === 'failed'
        ? await client.zscan(`${jobKey}:unsuccessful`, cursor, 'COUNT', count)
        : await client.hscan(
            `${jobKey}:${kind === 'processed' ? 'processed' : 'failed'}`,
            cursor,
            'COUNT',
            count
          )

  // HASH/ZSET scans alternate keys and values. Return values and failure reasons
  // belong to the child detail page, not the dependency response.
  const keys = kind === 'unprocessed' ? entries : entries.filter((_, index) => index % 2 === 0)
  // COUNT is a hint: retain overflow so no child is lost between cursors.
  return { keys: [...new Set(keys)], nextCursor: nextCursor === '0' ? null : nextCursor }
}
