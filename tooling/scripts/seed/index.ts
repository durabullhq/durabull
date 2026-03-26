#!/usr/bin/env bun
/**
 * Enhanced Database and Redis Seed Script
 *
 * Creates a production-like development environment with:
 * - 3 organizations (Acme, TechStart, Personal)
 * - 3 users with different roles
 * - 5 Redis connections across 3 environments
 * - 12 realistic queues with comprehensive job states
 * - Delayed jobs ranging from 30 seconds to 7 days
 * - Realistic error messages and stacktraces
 * - Scheduled jobs with cron patterns
 * - General Redis keys for key browser testing
 * - Mock workers for development
 *
 * Usage:
 *   bun docker:seed           # Seed database and Redis
 *   bun docker:seed --workers # Also start mock workers
 */

import '@durabull/env'
import { closeDb } from '@durabull/dal'
import { Redis } from 'ioredis'
import { REDIS_URL } from './config'
import { seedDatabase } from './database'
import { seedRedis, startMockWorkers } from './redis'
import { logSection, logSuccess, logError } from './utils'

async function main(): Promise<void> {
  console.log('🚀 Durabull Enhanced Development Seed')
  console.log('━'.repeat(50))

  // Check for required env vars
  if (!process.env.DATABASE_URL) {
    logError('DATABASE_URL is required. Make sure Docker is running.')
    console.log('   Run: bun docker')
    process.exit(1)
  }

  // Connect to Redis
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  })

  try {
    await redis.connect()
    logSuccess(`Connected to Redis at ${REDIS_URL}`)
  } catch (error) {
    logError('Failed to connect to Redis. Make sure Docker is running.')
    console.log('   Run: bun docker')
    process.exit(1)
  }

  try {
    // Seed database (users, orgs, connections)
    await seedDatabase()

    // Seed Redis (queues, jobs, keys)
    await seedRedis(redis)

    // Start mock workers if requested
    const startWorkers = process.argv.includes('--workers')
    if (startWorkers) {
      await startMockWorkers(redis)
      logSection('Seed Complete')
      logSuccess('Workers running in background. Press Ctrl+C to stop.')
      // Keep running for workers
    } else {
      logSection('Seed Complete')
      console.log('\n🔑 Login credentials:')
      console.log('   Email:    admin@example.com')
      console.log('   Password: password')
      console.log('\n📊 Test data is in: Acme Corporation > Acme Production')
      console.log('\n💡 Tip: Run with --workers to start mock workers')

      await redis.quit()
      await closeDb()
      process.exit(0)
    }
  } catch (error) {
    logError(`Seed failed: ${error}`)
    if (error instanceof Error) {
      if (error.cause) console.error('  cause:', error.cause)
      if ('code' in error && typeof (error as NodeJS.ErrnoException).code === 'string') {
        console.error('  code:', (error as NodeJS.ErrnoException).code)
      }
    }
    if (process.env.DATABASE_URL) {
      try {
        const u = new URL(process.env.DATABASE_URL)
        console.error(
          `  DATABASE_URL host: ${u.hostname} port: ${u.port || '(default)'} db: ${u.pathname.slice(1) || '(default)'}`
        )
      } catch {
        console.error('  DATABASE_URL: (could not parse for logging)')
      }
    }
    await redis.quit().catch(() => {})
    await closeDb().catch(() => {})
    process.exit(1)
  }
}

main()
