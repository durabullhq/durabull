import type { PoolClient } from 'pg'

// Stable application-scoped session lock serializes migration journal updates.
const MIGRATION_LOCK_NAMESPACE = 0x44555241
const MIGRATION_LOCK_ID = 0x42554c4c

export async function withMigrationLock(
  client: Pick<PoolClient, 'query' | 'release'>,
  migrate: () => Promise<void>
): Promise<void> {
  let operationError: unknown
  let failed = false
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [
      MIGRATION_LOCK_NAMESPACE,
      MIGRATION_LOCK_ID,
    ])
    await migrate()
  } catch (error) {
    operationError = error
    failed = true
  } finally {
    let unlockError: Error | undefined
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [
        MIGRATION_LOCK_NAMESPACE,
        MIGRATION_LOCK_ID,
      ])
    } catch (error) {
      unlockError = error instanceof Error ? error : new Error(String(error))
    } finally {
      // An unlock failure may leave a session lock behind. Destroy that session
      // instead of handing it back to the pool and blocking every other replica.
      client.release(unlockError)
    }
    if (unlockError && !failed) {
      operationError = unlockError
      failed = true
    }
  }
  if (failed) throw operationError
}
