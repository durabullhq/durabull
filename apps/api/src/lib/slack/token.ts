import { decryptSecret, type SlackInstallation, slackInstallationRepository } from '@durabull/dal'
import { refreshSlackToken, SlackApiError } from './client'
import { getSlackConfig } from './config'

const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000

/**
 * Refresh errors caused by Durabull's own app credentials (a wrong client ID
 * or secret in the deployment), not by the workspace revoking access. Fixing
 * the deployment fixes these, so they never mark an installation revoked.
 */
const CLIENT_CONFIG_ERROR_CODES = new Set([
  'bad_client_secret',
  'invalid_client_id',
  'invalid_client',
  'bad_redirect_uri',
  'invalid_grant_type',
])

export class SlackInstallationUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SlackInstallationUnavailableError'
  }
}

interface ResolvedToken {
  token: string
  /** The stored (encrypted) form of `token`, used to scope a later revoke to it. */
  encryptedBotToken: string
}

/** Refreshes in flight in this process, so concurrent callers share one redemption. */
const refreshesInFlight = new Map<string, Promise<ResolvedToken>>()

function storedToken(installation: SlackInstallation): ResolvedToken {
  return {
    token: decryptSecret(installation.encryptedBotToken),
    encryptedBotToken: installation.encryptedBotToken,
  }
}

function needsRefresh(installation: SlackInstallation): boolean {
  const expiresAt = installation.botTokenExpiresAt?.getTime()
  if (!expiresAt || !installation.encryptedRefreshToken) return false
  return expiresAt - TOKEN_REFRESH_SKEW_MS <= Date.now()
}

async function resolveSlackBotToken(
  installation: SlackInstallation,
  options: { allowRevoked?: boolean } = {}
): Promise<ResolvedToken> {
  if (installation.status !== 'active' && !options.allowRevoked) {
    throw new SlackInstallationUnavailableError(
      'Slack needs to be reconnected for this organization.'
    )
  }
  if (!needsRefresh(installation)) return storedToken(installation)

  const organizationId = installation.organizationId
  const inFlight = refreshesInFlight.get(organizationId)
  if (inFlight) return inFlight
  const refresh = refreshInstallationToken(organizationId).finally(() => {
    refreshesInFlight.delete(organizationId)
  })
  refreshesInFlight.set(organizationId, refresh)
  return refresh
}

/**
 * Redeems the stored refresh token. The installation is re-read first, and the
 * new tokens are written only if the refresh token is still the one redeemed,
 * so another API process that rotated first keeps its (newer) tokens.
 */
async function refreshInstallationToken(organizationId: string): Promise<ResolvedToken> {
  const current = await slackInstallationRepository.findByOrganization(organizationId)
  if (!current) {
    throw new SlackInstallationUnavailableError('Slack is not connected for this organization.')
  }
  if (!needsRefresh(current) || !current.encryptedRefreshToken) return storedToken(current)
  const redeemed = current.encryptedRefreshToken

  const { clientId, clientSecret } = getSlackConfig()
  try {
    const refreshed = await refreshSlackToken({
      refreshToken: decryptSecret(redeemed),
      clientId,
      clientSecret,
    })
    const updated = await slackInstallationRepository.updateTokens(
      organizationId,
      {
        botToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        botTokenExpiresAt: refreshed.expiresAt,
      },
      { expectedRefreshToken: redeemed }
    )
    if (updated) return storedToken(updated)
    // Another process rotated the tokens while this one was refreshing; use theirs.
    const latest = await slackInstallationRepository.findByOrganization(organizationId)
    if (!latest) {
      throw new SlackInstallationUnavailableError('Slack is not connected for this organization.')
    }
    return storedToken(latest)
  } catch (error) {
    if (error instanceof SlackInstallationUnavailableError) throw error
    // A redemption that lost the race fails, but the winner's tokens work.
    const latest = await slackInstallationRepository.findByOrganization(organizationId)
    if (latest?.encryptedRefreshToken && latest.encryptedRefreshToken !== redeemed) {
      return storedToken(latest)
    }
    if (
      error instanceof SlackApiError &&
      !error.retryable &&
      !CLIENT_CONFIG_ERROR_CODES.has(error.code)
    ) {
      await slackInstallationRepository.markStatus(
        organizationId,
        'revoked',
        `Token refresh failed: ${error.code}`,
        { onlyIfBotToken: current.encryptedBotToken }
      )
    }
    throw error
  }
}

/**
 * A usable bot token for the installation. Rotating tokens (only issued when
 * the Slack app enables token rotation) are refreshed shortly before expiry.
 */
export async function getSlackBotToken(
  installation: SlackInstallation,
  options: { allowRevoked?: boolean } = {}
): Promise<string> {
  return (await resolveSlackBotToken(installation, options)).token
}

/**
 * Runs a Slack call for an installation and records a revoked or removed app
 * so settings can prompt a reconnect instead of failing silently. The revoke
 * only applies while the failing token is still the stored one, so a slow call
 * made with an old token cannot revoke a fresh reconnect.
 */
export async function withSlackToken<T>(
  installation: SlackInstallation,
  fn: (token: string) => Promise<T>,
  options: {
    /** Try the stored token even when it was marked revoked (connection test, recovery). */
    allowRevoked?: boolean
  } = {}
): Promise<T> {
  const resolved = await resolveSlackBotToken(installation, options)
  try {
    return await fn(resolved.token)
  } catch (error) {
    if (error instanceof SlackApiError && error.isAuthError) {
      await slackInstallationRepository.markStatus(
        installation.organizationId,
        'revoked',
        error.code,
        { onlyIfBotToken: resolved.encryptedBotToken }
      )
    }
    throw error
  }
}
