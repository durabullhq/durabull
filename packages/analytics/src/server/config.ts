export const TELEMETRY_DISCLOSURE_URL = 'https://durabull.io/privacy'
export const DURABULL_CLOUD_API_HOST = 'app.durabull.io'
export const DEFAULT_CLOUD_COLLECT_URL = `https://${DURABULL_CLOUD_API_HOST}/api/telemetry/collect`

export interface ServerAnalyticsRuntimeContext {
  authless: boolean
  env_connections: boolean
  environment: string
  persistence: string
  stateless: boolean
}

export interface ServerAnalyticsOptions {
  /** Production-only product analytics (false in test/CI/dev). */
  enabled: boolean
  /** Cloud or managed host: ingest directly to PostHog batch. */
  collectEnabled: boolean
  /** When app + Durabull telemetry share one PostHog project, skip duplicate anonymous events. */
  dedupeIdentifiedPosthogEvents: boolean
  disclosureUrl: string
  /** Shared secret for HMAC-signed `/collect` batches (OSS forward + cloud ingest). */
  collectSigningSecret: string | null
  hmacSecret: string | null
  durabullTelemetryPosthogKey: string | null
  durabullTelemetryPosthogHost: string | null
  appPosthogKey: string | null
  appPosthogHost: string | null
  cloudCollectUrl: string
  getRuntimeContext: () => ServerAnalyticsRuntimeContext
  /** Cached anonymous installation id for server-origin events (avoids per-event DB writes). */
  resolveAnonymousInstanceId: () => Promise<string>
}

let configuredOptions: ServerAnalyticsOptions | null = null

export function configureServerAnalytics(options: ServerAnalyticsOptions): void {
  configuredOptions = options
}

export function getServerAnalyticsOptions(): ServerAnalyticsOptions {
  if (!configuredOptions) {
    throw new Error(
      'Server analytics is not configured. Call configureServerAnalytics() during API bootstrap.'
    )
  }
  return configuredOptions
}

export function tryGetServerAnalyticsOptions(): ServerAnalyticsOptions | null {
  return configuredOptions
}

/** Test-only: reset configured options between cases. */
export function resetServerAnalyticsForTests(): void {
  if (process.env.NODE_ENV !== 'test') return
  configuredOptions = null
}

export function getTelemetryStatusFromOptions(options: ServerAnalyticsOptions): {
  enabled: boolean
  collectionRequired: true
  dedupeIdentifiedPosthogEvents: boolean
  disclosureUrl: string
} {
  return {
    enabled: options.enabled,
    collectionRequired: true as const,
    dedupeIdentifiedPosthogEvents: options.dedupeIdentifiedPosthogEvents,
    disclosureUrl: options.disclosureUrl,
  }
}
