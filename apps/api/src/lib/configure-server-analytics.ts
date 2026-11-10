import {
  configureServerAnalytics,
  DEFAULT_CLOUD_COLLECT_URL,
  DURABULL_CLOUD_API_HOST,
  resolveTelemetryDistribution,
  TELEMETRY_DISCLOSURE_URL,
} from '@durabull/analytics/server'
import {
  getDatabaseMode,
  shouldUseEnvConnections,
  telemetryInstallationRepository,
} from '@durabull/dal'
import { env } from '@durabull/env'

import { isAuthlessMode } from './authless'
import { APP_RELEASE_CHANNEL, APP_VERSION } from './build-info'

function isDurabullManagedPosthogProject(): boolean {
  if (env.DURABULL_CLOUD === true) return true

  try {
    return new URL(env.APP_BASE_URL).hostname === DURABULL_CLOUD_API_HOST
  } catch {
    return false
  }
}

function getDurabullTelemetryPosthogKey(): string | null {
  return env.DURABULL_TELEMETRY_POSTHOG_KEY?.trim() || env.POSTHOG_KEY?.trim() || null
}

let cachedAnonymousInstanceId: string | null = null
let inFlightAnonymousInstanceId: Promise<string> | null = null

/**
 * Resolve the anonymous installation id with a process cache and single-flight guard so
 * concurrent cold-start callers share one DB round-trip instead of stampeding the repository.
 */
async function resolveAnonymousInstanceId(): Promise<string> {
  if (cachedAnonymousInstanceId) {
    return cachedAnonymousInstanceId
  }

  if (inFlightAnonymousInstanceId) {
    return inFlightAnonymousInstanceId
  }

  inFlightAnonymousInstanceId = (async () => {
    try {
      // getOrCreateAnonymousInstanceId reads first, so this avoids a redundant SELECT.
      const id = await telemetryInstallationRepository.getOrCreateAnonymousInstanceId()
      cachedAnonymousInstanceId = id
      return id
    } finally {
      inFlightAnonymousInstanceId = null
    }
  })()

  return inFlightAnonymousInstanceId
}

export function bootstrapServerAnalytics(): void {
  const appPosthogKey = env.POSTHOG_KEY?.trim() || null
  const durabullTelemetryPosthogKey = getDurabullTelemetryPosthogKey()
  const isCloud = isDurabullManagedPosthogProject()
  // Cloud runs the published Docker image, so release_channel alone reads "docker" there.
  const distribution = resolveTelemetryDistribution({
    cloud: isCloud,
    releaseChannel: APP_RELEASE_CHANNEL,
  })

  configureServerAnalytics({
    enabled: env.NODE_ENV === 'production' && env.CI !== true,
    collectEnabled: isCloud,
    dedupeIdentifiedPosthogEvents:
      !!appPosthogKey && isCloud && durabullTelemetryPosthogKey === appPosthogKey,
    disclosureUrl: TELEMETRY_DISCLOSURE_URL,
    collectSigningSecret: env.DURABULL_TELEMETRY_COLLECT_SECRET?.trim() || null,
    hmacSecret: env.DURABULL_TELEMETRY_HMAC_SECRET?.trim() || null,
    durabullTelemetryPosthogKey,
    durabullTelemetryPosthogHost: env.DURABULL_TELEMETRY_POSTHOG_HOST?.trim() || null,
    appPosthogKey,
    appPosthogHost: env.POSTHOG_HOST?.trim() || null,
    cloudCollectUrl: DEFAULT_CLOUD_COLLECT_URL,
    getRuntimeContext: () => ({
      authless: isAuthlessMode(),
      env_connections: shouldUseEnvConnections(),
      environment: env.NODE_ENV ?? 'development',
      persistence: getDatabaseMode(),
      stateless: getDatabaseMode() === 'pglite',
      deployment: isCloud ? 'cloud' : 'self_hosted',
      distribution,
      release_channel: APP_RELEASE_CHANNEL,
      app_version: APP_VERSION,
    }),
    resolveAnonymousInstanceId,
  })

  // Eagerly warm the installation id so request paths (/events, MCP analytics)
  // never block on a cold DB read. Telemetry must never affect product runtime.
  if (env.NODE_ENV === 'production' && env.CI !== true) {
    void resolveAnonymousInstanceId().catch(() => {})
  }
}

/** Test-only: clear cached installation id when re-bootstrapping. */
export function resetCachedAnonymousInstanceIdForTests(): void {
  cachedAnonymousInstanceId = null
  inFlightAnonymousInstanceId = null
}
