#!/usr/bin/env bun
/**
 * Database and Redis Wipe Script
 *
 * Completely wipes all data from Docker PostgreSQL and Redis.
 * Use this for a fresh start during development.
 *
 * Usage:
 *   bun docker:wipe
 */

import '@durabull/env'
import { closeDb, getPgPool } from '@durabull/dal'
import { Redis } from 'ioredis'

function defaultRedisUrlFromEnv(): string {
  const port = process.env.DURABULL_REDIS_PORT?.trim()
  if (port) return `redis://localhost:${port}`
  return 'redis://localhost:56379'
}

const REDIS_URL = process.env.REDIS_URL || defaultRedisUrlFromEnv()

async function wipePostgres(): Promise<void> {
  console.log('\n🗑️  Wiping PostgreSQL database...')

  try {
    const pool = await getPgPool()

    // Get all tables in public schema
    const result = await pool.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename != 'drizzle_migrations'
    `)

    if (result.rows.length === 0) {
      console.log('  ✅ No tables to wipe')
      return
    }

    // Disable foreign key checks, truncate all tables, re-enable
    const tableNames = result.rows.map((r) => `"${r.tablename}"`).join(', ')
    await pool.query(`TRUNCATE TABLE ${tableNames} CASCADE`)

    console.log(`  ✅ Wiped ${result.rows.length} tables`)
  } catch (error) {
    if ((error as Error).message.includes('ECONNREFUSED')) {
      console.log('  ⚠️  PostgreSQL not running, skipping...')
    } else {
      throw error
    }
  }
}

async function wipeRedis(): Promise<void> {
  console.log('\n🗑️  Wiping Redis database...')

  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  })

  try {
    await redis.connect()

    // FLUSHDB removes all keys from the current database
    await redis.flushdb()

    console.log('  ✅ Redis database flushed')
  } catch (error) {
    if ((error as Error).message.includes('ECONNREFUSED')) {
      console.log('  ⚠️  Redis not running, skipping...')
    } else {
      throw error
    }
  } finally {
    await redis.quit().catch(() => {})
  }
}

async function main(): Promise<void> {
  console.log('🗑️  Durabull Data Wipe')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('⚠️  This will delete ALL data from PostgreSQL and Redis!')

  // Check for --force flag
  const force = process.argv.includes('--force') || process.argv.includes('-f')

  if (!force) {
    console.log('\n⏳ Proceeding in 3 seconds... (use --force to skip)')
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  try {
    await wipePostgres()
    await wipeRedis()

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ Wipe complete!')
    console.log('\n💡 Run `bun docker:seed` to re-seed the database')
  } catch (error) {
    console.error('❌ Wipe failed:', error)
    process.exit(1)
  } finally {
    await closeDb().catch(() => {})
    process.exit(0)
  }
}

main()
