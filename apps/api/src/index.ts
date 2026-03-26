import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { closeDb, getEnvRedisConnections, shouldUseEnvConnections } from '@durabull/dal'
import { isEmailConfigured } from '@durabull/email'
import { env } from '@durabull/env'
import { serveStatic } from 'hono/bun'

import { createApiApp } from './app'
import { startAlertMonitor, stopAlertMonitor } from './lib/alert-monitor'
import { isAuthlessMode } from './lib/authless'

process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled promise rejection:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('[process] Uncaught exception:', error)
})

let shutdownPromise: Promise<void> | null = null

async function shutdown(reason: NodeJS.Signals): Promise<void> {
  if (shutdownPromise) return shutdownPromise

  shutdownPromise = (async () => {
    console.log(`[shutdown] Received ${reason}, stopping alert monitor...`)

    try {
      stopAlertMonitor()
      console.log('[shutdown] Alert monitor stopped.')

      console.log('[shutdown] Closing database...')
      await closeDb()
      console.log('[shutdown] Database closed cleanly.')
      process.exit(0)
    } catch (error) {
      console.error('[shutdown] Failed to close database cleanly:', error)
      process.exit(1)
    }
  })()

  return shutdownPromise
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal)
  })
}

if (!process.stdin.isTTY) {
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    if (chunk.includes('__durabull_shutdown__')) {
      void shutdown('SIGTERM')
    }
  })
}

// Create the API app
const { app } = await createApiApp()
startAlertMonitor()

// Serve static files from web app build (for production)
const webDistPath = join(import.meta.dir, '../../web/dist')
const hasWebBuild = existsSync(webDistPath)

if (hasWebBuild) {
  // Serve static assets with immutable cache headers (hashed filenames)
  app.use(
    '/assets/*',
    serveStatic({
      root: webDistPath,
      onFound: (_path, c) => {
        c.header('Cache-Control', 'public, max-age=31536000, immutable')
      },
    })
  )

  // Serve other static files (favicons, etc.)
  app.use('*', serveStatic({ root: webDistPath }))

  // SPA fallback - serve index.html for all unmatched routes
  app.get('*', serveStatic({ root: webDistPath, path: 'index.html' }))
}

// Re-export the API type for RPC client
export type { ApiType } from './app'

// Port: 3000 for production, 3001 for development
const port = env.PORT ?? (env.NODE_ENV === 'production' ? 3000 : 3001)

const emailBanner = isEmailConfigured()
  ? '📧 Email: Resend configured'
  : '⚠️  Email: Not configured (RESEND_API_KEY missing)'

const dbBanner = env.DATABASE_URL ? '🐘 DB:     PostgreSQL' : '🪶 DB:     PGlite (local)'
const envConnectionCount = shouldUseEnvConnections() ? getEnvRedisConnections().length : 0
const authBanner = isAuthlessMode() ? '🔐 Auth:   Authless' : '🔐 Auth:   Better Auth'
const connectionsBanner = shouldUseEnvConnections()
  ? `🔌 Connections: Env (${envConnectionCount})`
  : '🔌 Connections: DB'
const alertBanner =
  env.DURABULL_ALERT_ENABLED === false
    ? '🔔 Alerts: Disabled'
    : `🔔 Alerts: Monitor active (${Math.round((env.DURABULL_ALERT_POLL_INTERVAL_MS ?? 60000) / 1000)}s)`
const authlessProductionWarning =
  isAuthlessMode() && env.NODE_ENV === 'production'
    ? '⚠️  WARNING: Authless mode is enabled in production. Restrict network access to trusted environments only.'
    : null

console.log(`
🚀 Durabull API Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 API:    http://localhost:${port}/api
🏥 Health: http://localhost:${port}/api/health
${dbBanner}
${authBanner}
${connectionsBanner}
${alertBanner}
${emailBanner}
${authlessProductionWarning ? `${authlessProductionWarning}` : ''}
${hasWebBuild ? `🌐 Web:    http://localhost:${port}` : '⚠️  Web: Run "bun run build" first'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)

export default {
  port,
  fetch: app.fetch,
}
