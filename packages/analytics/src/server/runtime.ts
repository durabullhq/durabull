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

export interface TelemetryDeploymentInfo {
  deployment: TelemetryDeployment
  distribution: TelemetryDistribution
}

const DESKTOP_RELEASE_CHANNELS = new Set(['desktop', 'desktop-dev'])

/**
 * Resolve deployment and distribution together so they cannot disagree. Cloud runs the
 * published Docker image, so its release channel alone would read `docker`.
 */
export function resolveTelemetryDeployment(input: {
  cloud: boolean
  releaseChannel: string
}): TelemetryDeploymentInfo {
  if (input.cloud) return { deployment: 'cloud', distribution: 'cloud' }

  let distribution: TelemetryDistribution = 'source'
  if (input.releaseChannel === 'docker') distribution = 'docker'
  else if (DESKTOP_RELEASE_CHANNELS.has(input.releaseChannel)) distribution = 'desktop'

  return { deployment: 'self_hosted', distribution }
}

function isSelfHostedDistribution(value: unknown): value is TelemetryDistribution {
  return (
    typeof value === 'string' &&
    value !== 'cloud' &&
    (TELEMETRY_DISTRIBUTIONS as readonly string[]).includes(value)
  )
}

/**
 * Runtime a self-hosted instance sends with a forwarded `/collect` batch. Same shape as the
 * server runtime, except older instances omit `distribution` and any claimed value is
 * untrusted. A sent `deployment` is ignored, since the collector always decides it.
 */
export type TelemetryCollectClientRuntime = Omit<
  ServerAnalyticsRuntimeContext,
  'deployment' | 'distribution'
> & { distribution?: string }

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
  const { distribution, release_channel, api_version, ...base } = clientRuntime
  const runtime: ServerAnalyticsRuntimeContext = {
    ...base,
    deployment: 'self_hosted',
    distribution: isSelfHostedDistribution(distribution) ? distribution : 'unknown',
  }

  // Omit absent keys so a browser-supplied value on the event is not overwritten with nothing.
  if (release_channel) runtime.release_channel = release_channel
  if (api_version) runtime.api_version = api_version

  return runtime
}
