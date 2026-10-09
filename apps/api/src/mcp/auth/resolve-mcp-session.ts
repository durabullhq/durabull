import { eq, getDb, oauthAccessToken, oauthApplication } from '@durabull/dal'

import type { McpSession } from './mcp-session-middleware'

export type ResolvedMcpSession = McpSession & {
  resource: string | null
}

/**
 * Resolves an OAuth access token via DAL (case-normalized bearer), including disabled-client checks.
 * Production ingress uses this instead of `getMcpSession` to avoid duplicate lookups and enforce client state.
 */
export async function resolveMcpSessionFromAccessToken(
  accessToken: string
): Promise<ResolvedMcpSession | null> {
  const db = await getDb()

  const rows = await db
    .select({
      accessToken: oauthAccessToken.accessToken,
      refreshToken: oauthAccessToken.refreshToken,
      accessTokenExpiresAt: oauthAccessToken.accessTokenExpiresAt,
      refreshTokenExpiresAt: oauthAccessToken.refreshTokenExpiresAt,
      clientId: oauthAccessToken.clientId,
      clientName: oauthApplication.name,
      userId: oauthAccessToken.userId,
      scopes: oauthAccessToken.scopes,
      resource: oauthAccessToken.resource,
      clientDisabled: oauthApplication.disabled,
    })
    .from(oauthAccessToken)
    .innerJoin(oauthApplication, eq(oauthAccessToken.clientId, oauthApplication.clientId))
    .where(eq(oauthAccessToken.accessToken, accessToken))
    .limit(1)

  const row = rows[0]
  if (!row || row.clientDisabled) {
    return null
  }

  return {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    accessTokenExpiresAt: row.accessTokenExpiresAt,
    refreshTokenExpiresAt: row.refreshTokenExpiresAt,
    clientId: row.clientId,
    clientName: row.clientName ?? undefined,
    userId: row.userId,
    scopes: row.scopes,
    resource: row.resource,
  }
}
