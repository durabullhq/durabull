import { decryptSecret, type SlackInstallation, slackInstallationRepository } from '@durabull/dal'
import { refreshSlackToken, SlackApiError } from './client'
import { getSlackConfig } from './config'

const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000

export class SlackInstallationUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SlackInstallationUnavailableError'
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
  if (installation.status !== 'active' && !options.allowRevoked) {
    throw new SlackInstallationUnavailableError(
      'Slack needs to be reconnected for this organization.'
    )
  }
  const expiresAt = installation.botTokenExpiresAt?.getTime()
  if (!expiresAt || !installation.encryptedRefreshToken) {
    return decryptSecret(installation.encryptedBotToken)
  }
  if (expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now()) {
    return decryptSecret(installation.encryptedBotToken)
  }

  const { clientId, clientSecret } = getSlackConfig()
  try {
    const refreshed = await refreshSlackToken({
      refreshToken: decryptSecret(installation.encryptedRefreshToken),
      clientId,
      clientSecret,
    })
    await slackInstallationRepository.updateTokens(installation.organizationId, {
      botToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      botTokenExpiresAt: refreshed.expiresAt,
    })
    return refreshed.accessToken
  } catch (error) {
    if (error instanceof SlackApiError && !error.retryable) {
      await slackInstallationRepository.markStatus(
        installation.organizationId,
        'revoked',
        `Token refresh failed: ${error.code}`
      )
    }
    throw error
  }
}

/**
 * Runs a Slack call for an installation and records a revoked or removed app
 * so settings can prompt a reconnect instead of failing silently.
 */
export async function withSlackToken<T>(
  installation: SlackInstallation,
  fn: (token: string) => Promise<T>,
  options: {
    /** Try the stored token even when it was marked revoked (connection test, recovery). */
    allowRevoked?: boolean
  } = {}
): Promise<T> {
  const token = await getSlackBotToken(installation, options)
  try {
    return await fn(token)
  } catch (error) {
    if (error instanceof SlackApiError && error.isAuthError) {
      await slackInstallationRepository.markStatus(
        installation.organizationId,
        'revoked',
        error.code
      )
    }
    throw error
  }
}
