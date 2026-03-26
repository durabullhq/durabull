import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '@durabull/env'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzleNodePg, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import pg from 'pg'
import { shouldUseEnvConnections, syncEnvConnectionsForOrganization } from './env-redis-connections'
import { organization } from './schemas/organization/schema'
import * as schema from './schemas'
import { relations } from './schemas/relations'

// Get the directory of this file to resolve paths relative to the dal package
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, './migrations')

export type Database = NodePgDatabase<typeof schema>

export type DatabaseMode = 'postgres' | 'pglite'

// Internal state
let db: Database | null = null
let pgPool: pg.Pool | null = null
let pgliteClient: PGlite | null = null
let initialized = false

export function getDatabaseMode(): DatabaseMode {
  return env.DATABASE_URL ? 'postgres' : 'pglite'
}

function getPgliteDataDir(): string {
  const override = process.env.DURABULL_PGLITE_DIR?.trim()
  if (override) return override
  return join(process.cwd(), 'data', 'pglite')
}

/** Local Docker / dev Postgres: disable SSL so pg does not negotiate TLS and drop the connection. */
function shouldDisableSslForPostgresUrl(connectionString: string): boolean {
  try {
    const u = new URL(connectionString)
    const host = u.hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

/**
 * Get or create the database instance.
 * Uses lazy initialization to avoid creating the connection until needed.
 * Automatically runs migrations on first connection.
 */
export async function getDb(): Promise<Database> {
  if (!db) {
    const dbMode = getDatabaseMode()

    if (dbMode === 'postgres') {
      const connectionString = env.DATABASE_URL
      if (!connectionString) {
        throw new Error('DATABASE_URL is required for PostgreSQL mode.')
      }

      pgPool = new pg.Pool({
        connectionString,
        ...(shouldDisableSslForPostgresUrl(connectionString) ? { ssl: false } : {}),
      })
      const pgDb = drizzleNodePg({ client: pgPool, schema, relations })
      db = pgDb

      if (!initialized) {
        console.log('🐘 Connecting to PostgreSQL...')
        await migrateNodePg(pgDb, { migrationsFolder: migrationsDir })

        if (shouldUseEnvConnections()) {
          const orgs = await pgDb.select({ id: organization.id }).from(organization)
          for (const org of orgs) {
            await syncEnvConnectionsForOrganization(pgDb, org.id)
          }
        }

        console.log('✅ Database migrations applied')
        initialized = true
      }
    } else {
      const dataDir = getPgliteDataDir()
      await mkdir(dataDir, { recursive: true })
      pgliteClient = new PGlite({ dataDir })
      const pgliteDb = drizzlePglite({ client: pgliteClient, schema, relations })
      db = pgliteDb as unknown as Database

      if (!initialized) {
        console.log(`🪶 Using PGlite at ${dataDir}`)
        await migratePglite(pgliteDb, { migrationsFolder: migrationsDir })

        if (shouldUseEnvConnections()) {
          const orgs = await pgliteDb.select({ id: organization.id }).from(organization)
          for (const org of orgs) {
            await syncEnvConnectionsForOrganization(pgliteDb as unknown as Database, org.id)
          }
        }

        console.log('✅ Database migrations applied')
        initialized = true
      }
    }
  }

  return db
}

/**
 * Get the PostgreSQL pool for raw queries.
 */
export async function getPgPool(): Promise<pg.Pool> {
  if (!db) {
    await getDb()
  }

  if (!pgPool) {
    throw new Error('PostgreSQL pool is not available when using PGlite.')
  }

  return pgPool
}

/**
 * Close the database connection.
 */
export async function closeDb(): Promise<void> {
  if (pgPool) {
    await pgPool.end()
    pgPool = null
  }

  if (pgliteClient && typeof pgliteClient.close === 'function') {
    await pgliteClient.close()
    pgliteClient = null
  }

  db = null
  initialized = false
}
