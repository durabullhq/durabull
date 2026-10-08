import { describe, expect, it } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { readMigrationFiles } from 'drizzle-orm/migrator'

const migrations = readMigrationFiles({ migrationsFolder: join(import.meta.dir, 'migrations') })
const recoveryStart = migrations.findIndex((migration) =>
  migration.sql.some((statement) =>
    statement.includes('ADD COLUMN "linear_resolution_sync_pending"')
  )
)

async function applyMigrations(client: PGlite, start: number, end: number) {
  await client.transaction(async (tx) => {
    for (const migration of migrations.slice(start, end)) {
      for (const statement of migration.sql) await tx.exec(statement)
    }
  })
}

describe('alert recovery migration upgrade', () => {
  it('recovers explicit legacy markers without rearming previously synchronized historical Linear issues', async () => {
    const client = new PGlite()
    try {
      expect(recoveryStart).toBeGreaterThan(0)
      await applyMigrations(client, 0, recoveryStart)
      const connectionId = randomUUID()
      const ruleId = randomUUID()
      await client.query('INSERT INTO organization (id, name, slug) VALUES ($1, $2, $3)', [
        'upgrade-org',
        'Upgrade Org',
        'upgrade-org',
      ])
      await client.query(
        'INSERT INTO redis_connection (id, organization_id, name, url) VALUES ($1, $2, $3, $4)',
        [connectionId, 'upgrade-org', 'Redis', 'redis://localhost:6379']
      )
      await client.query(
        'INSERT INTO alert_rule (id, organization_id, connection_id, name, type, config) VALUES ($1, $2, $3, $4, $5, $6)',
        [ruleId, 'upgrade-org', connectionId, 'Rule', 'job_failed', '{}']
      )
      const cases = [
        { context: {}, delivered: true, pending: false },
        { context: {}, delivered: false, pending: false },
        { context: { migrationLinearSyncPending: true }, delivered: true, pending: true },
        { context: { linearResolutionSyncPending: true }, delivered: true, pending: true },
        { context: { linearResolutionSyncPending: false }, delivered: true, pending: false },
      ]
      const ids: string[] = []
      for (const testCase of cases) {
        const eventId = randomUUID()
        ids.push(eventId)
        await client.query(
          'INSERT INTO alert_event (id, alert_rule_id, organization_id, connection_id, queue_name, type, status, summary, context, fired_at, resolved_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())',
          [
            eventId,
            ruleId,
            'upgrade-org',
            connectionId,
            'jobs',
            'job_failed',
            'resolved',
            'Historical incident',
            JSON.stringify(testCase.context),
          ]
        )
        if (testCase.delivered) {
          await client.query(
            'INSERT INTO alert_delivery (id, alert_event_id, organization_id, channel_type, target, status, external_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [randomUUID(), eventId, 'upgrade-org', 'linear', 'team-id', 'delivered', randomUUID()]
          )
        }
      }
      await applyMigrations(client, recoveryStart, migrations.length)
      for (const [i, eventId] of ids.entries()) {
        const { rows } = await client.query<{ pending: boolean; reason: string | null }>(
          'SELECT linear_resolution_sync_pending AS pending, linear_resolution_reason AS reason FROM alert_event WHERE id = $1',
          [eventId]
        )
        expect(rows).toEqual([
          { pending: cases[i].pending, reason: cases[i].pending ? 'legacy' : null },
        ])
      }
      const { rows } = await client.query(
        'SELECT linear_resolution_failed_at, linear_resolution_last_error FROM alert_event'
      )
      expect(rows).toHaveLength(cases.length)
    } finally {
      await client.close()
    }
  }, 30_000)
})
