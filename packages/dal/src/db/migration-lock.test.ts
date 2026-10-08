import { describe, expect, it, mock } from 'bun:test'
import type { PoolClient } from 'pg'
import { withMigrationLock } from './migration-lock'

function lockClient(failUnlock?: unknown, failLock?: Error) {
  const queries: string[] = []
  const release = mock((_error?: Error | boolean) => {})
  const query = mock(async (text: string) => {
    queries.push(text)
    if (text.includes('pg_advisory_unlock') && failUnlock) throw failUnlock
    if (text.includes('pg_advisory_lock') && failLock) throw failLock
    return { rows: [] }
  })
  return {
    client: { query, release } as unknown as Pick<PoolClient, 'query' | 'release'>,
    queries,
    release,
  }
}

describe('migration session lock cleanup', () => {
  it('holds the same session until migration completes and releases it on success', async () => {
    const { client, queries, release } = lockClient()
    await withMigrationLock(client, async () => {
      expect(queries).toEqual(['SELECT pg_advisory_lock($1, $2)'])
      expect(release).not.toHaveBeenCalled()
    })
    expect(queries).toEqual([
      'SELECT pg_advisory_lock($1, $2)',
      'SELECT pg_advisory_unlock($1, $2)',
    ])
    expect(release).toHaveBeenCalledWith(undefined)
  })

  it('destroys a session when unlocking fails, and preserves the original migration error', async () => {
    const unlockError = new Error('Connection lost while unlocking')
    const migrationError = new Error('Migration failed')
    const { client, release } = lockClient(unlockError)
    await expect(
      withMigrationLock(client, async () => {
        throw migrationError
      })
    ).rejects.toBe(migrationError)
    expect(release).toHaveBeenCalledWith(unlockError)
  })

  it('fails initialization and destroys the session if only unlocking failed', async () => {
    const { client, release } = lockClient('unlock failed')
    await expect(withMigrationLock(client, async () => {})).rejects.toThrow('unlock failed')
    expect(release.mock.calls[0][0]).toBeInstanceOf(Error)
  })

  it('releases the session when lock acquisition fails', async () => {
    const lockError = new Error('Cannot acquire advisory lock')
    const { client, release } = lockClient(undefined, lockError)
    const migrate = mock(async () => {})
    await expect(withMigrationLock(client, migrate)).rejects.toBe(lockError)
    expect(migrate).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledTimes(1)
  })
})
