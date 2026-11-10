import type { ServerAnalyticsRuntimeContext } from './config'

/**
 * Where a Durabull install runs. Stamped by the server on every telemetry event so
 * Cloud and self-hosted usage can be separated without trusting browser input.
 */
export const TELEMETRY_DEPLOYMENTS = ['cloud', 'self_hosted'] as const
export type TelemetryDeployment = (typeof TELEMETRY_DEPLOYMENTS)[number]

/**
 * How a Durabull install was obtained. `unknown` covers installs too old to report it.
 * Homebrew installs the desktop cask, so it reports as `desktop`.
 */
export const TELEMETRY_DISTRIBUTIONS = ['cloud', 'docker', 'desktop', 'source', 'unknown'] as const
export type TelemetryDistribution = (typeof TELEMETRY_DISTRIBUTIONS)[number]

const DESKTOP_RELEASE_CHANNELS = new Set(['desktop', 'desktop-dev'])

export function resolveTelemetryDistribution(input: {
  cloud: boolean
  releaseChannel: string
}): TelemetryDistribution {
  if (input.cloud) return 'cloud'
  if (input.releaseChannel === 'docker') return 'docker'
  if (DESKTOP_RELEASE_CHANNELS.has(input.releaseChannel)) return 'desktop'
  return 'source'
}

function isSelfHostedDistribution(value: unknown): value is TelemetryDistribution {
  return (
    typeof value === 'string' &&
    value !== 'cloud' &&
    (TELEMETRY_DISTRIBUTIONS as readonly string[]).includes(value)
  )
}

/** Runtime fields a self-hosted instance may send with a forwarded `/collect` batch. */
export interface TelemetryCollectClientRuntime {
  authless: boolean
  env_connections: boolean
  environment: string
  persistence: string
  stateless: boolean
  deployment?: string
  distribution?: string
  release_channel?: string
  app_version?: string
}

/**
 * Build the runtime context for a batch forwarded from a self-hosted instance.
 *
 * Anything that reaches the cloud collector came from outside Durabull Cloud, so the
 * deployment is always `self_hosted` and a claimed `cloud` distribution is discarded.
 * Older instances that predate these fields report `unknown`.
 */
export function resolveCollectRuntimeContext(
  clientRuntime: TelemetryCollectClientRuntime
): ServerAnalyticsRuntimeContext {
  const runtime: ServerAnalyticsRuntimeContext = {
    authless: clientRuntime.authless,
    env_connections: clientRuntime.env_connections,
    environment: clientRuntime.environment,
    persistence: clientRuntime.persistence,
    stateless: clientRuntime.stateless,
    deployment: 'self_hosted',
    distribution: isSelfHostedDistribution(clientRuntime.distribution)
      ? clientRuntime.distribution
      : 'unknown',
  }

  // Omit absent keys so a browser-supplied value on the event is not overwritten with nothing.
  if (clientRuntime.release_channel) runtime.release_channel = clientRuntime.release_channel
  if (clientRuntime.app_version) runtime.app_version = clientRuntime.app_version

  return runtime
}
