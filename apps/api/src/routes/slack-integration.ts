import { randomBytes } from 'node:crypto'
import {
  alertDestinationRepository,
  decryptSecret,
  eq,
  getDb,
  organization,
  type SlackInstallation,
  slackInstallationRepository,
  slackOauthStateRepository,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { zValidator } from '@hono/zod-validator'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { hasFeature, requireFeature } from '../billing/entitlements'
import {
  exchangeSlackOauthCode,
  listSlackChannels,
  listSlackUserGroups,
  SlackApiError,
  type SlackChannel,
  slackAuthRevoke,
  slackAuthTest,
} from '../lib/slack/client'
import {
  appBaseUrl,
  buildSlackAuthorizeUrl,
  getSlackConfig,
  isSlackConfigured,
  SLACK_BOT_SCOPES,
  SlackNotConfiguredError,
} from '../lib/slack/config'
import { buildSlackAppManifest } from '../lib/slack/manifest'
import { withSlackToken } from '../lib/slack/token'
import { requireOrganization } from '../middleware/auth'

const RETURN_TO_PAGES = ['integrations', 'destinations'] as const
type ReturnToPage = (typeof RETURN_TO_PAGES)[number]

const connectSchema = z
  .object({ returnTo: z.enum(RETURN_TO_PAGES).optional() })
  .strict()
  .optional()

const callbackSchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().min(1).optional(),
})

const updateSchema = z
  .object({
    actionsEnabled: z.boolean().optional(),
    unfurlsEnabled: z.boolean().optional(),
  })
  .strict()

const channelsQuerySchema = z.object({ refresh: z.enum(['true', 'false']).optional() })

const CHANNEL_CACHE_TTL_MS = 60_000
const channelCache = new Map<
  string,
  { value: { channels: SlackChannel[]; truncated: boolean }; expiresAt: number }
>()

/** Missing scopes compared to what the current Durabull version requests. */
function missingScopes(installation: SlackInstallation): string[] {
  const granted = new Set(
    installation.scopes
      .split(/[,\s]+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
  )
  return SLACK_BOT_SCOPES.filter((scope) => !granted.has(scope))
}

function serializeInstallation(installation: SlackInstallation, slackDestinationCount: number) {
  return {
    id: installation.id,
    organizationId: installation.organizationId,
    status: installation.status,
    statusReason: installation.statusReason,
    slackTeamId: installation.slackTeamId,
    slackTeamName: installation.slackTeamName,
    slackTeamUrl: installation.slackTeamUrl,
    botUserId: installation.botUserId,
    scopes: installation.scopes,
    missingScopes: missingScopes(installation),
    actionsEnabled: installation.actionsEnabled,
    unfurlsEnabled: installation.unfurlsEnabled,
    installedByUserId: installation.installedByUserId,
    lastValidatedAt: installation.lastValidatedAt,
    slackDestinationCount,
    createdAt: installation.createdAt,
    updatedAt: installation.updatedAt,
  }
}

async function countSlackDestinations(organizationId: string): Promise<number> {
  const destinations = await alertDestinationRepository.listByOrganization(organizationId, {
    type: 'slack',
  })
  return destinations.length
}

async function organizationSlug(organizationId: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)
  return rows[0]?.slug ?? null
}

function settingsUrl(slug: string | null, page: ReturnToPage, params: Record<string, string>) {
  const url = new URL(
    slug ? `/${encodeURIComponent(slug)}/settings/${page}` : '/settings',
    env.APP_BASE_URL
  )
  if (!slug) url.searchParams.set('section', page)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

function redirectWithResult(
  c: Context,
  slug: string | null,
  page: ReturnToPage,
  params: Record<string, string>
) {
  return c.redirect(settingsUrl(slug, page, params), 302)
}

function isReturnToPage(value: string): value is ReturnToPage {
  return (RETURN_TO_PAGES as readonly string[]).includes(value)
}

function slackErrorStatus(error: SlackApiError) {
  return error.retryable ? 503 : error.isAuthError ? 401 : 400
}

const app = new Hono()
  .use('*', async (c, next) => {
    if (c.req.path.endsWith('/callback')) {
      await next()
      return
    }
    return requireOrganization(c, next)
  })
  .get('/', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)
    const [installation, entitled] = await Promise.all([
      slackInstallationRepository.findByOrganization(organizationId),
      hasFeature(organizationId, 'integrations.slack'),
    ])
    return c.json({
      configured: isSlackConfigured(),
      entitled,
      installation: installation
        ? serializeInstallation(installation, await countSlackDestinations(organizationId))
        : null,
    })
  })
  .post('/connect', zValidator('json', connectSchema), async (c) => {
    const organizationId = c.get('organizationId')
    const user = c.get('user')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)
    await requireFeature(organizationId, 'integrations.slack')
    if (!user) return c.json({ error: 'User is required' }, 401)

    let config: ReturnType<typeof getSlackConfig>
    try {
      config = getSlackConfig()
    } catch (error) {
      if (error instanceof SlackNotConfiguredError) return c.json({ error: error.message }, 503)
      throw error
    }

    await slackOauthStateRepository.deleteExpired()
    const state = randomBytes(32).toString('base64url')
    await slackOauthStateRepository.create({
      organizationId,
      userId: user.id,
      state,
      redirectUri: config.redirectUri,
      returnTo: c.req.valid('json')?.returnTo ?? 'integrations',
      expiresAt: new Date(Date.now() + 10 * 60_000),
    })
    return c.json({
      authorizationUrl: buildSlackAuthorizeUrl({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        state,
      }),
    })
  })
  .get('/callback', zValidator('query', callbackSchema), async (c) => {
    const query = c.req.valid('query')
    const oauthState = query.state
      ? await slackOauthStateRepository.consumeByState(query.state)
      : null
    const slug = oauthState ? await organizationSlug(oauthState.organizationId) : null
    const page: ReturnToPage =
      oauthState && isReturnToPage(oauthState.returnTo) ? oauthState.returnTo : 'integrations'

    if (query.error) {
      // access_denied means the user cancelled on Slack's consent screen.
      return redirectWithResult(c, slug, page, {
        slack: query.error === 'access_denied' ? 'cancelled' : 'error',
        message: query.error_description ?? query.error,
      })
    }
    if (!oauthState || !query.code) {
      return redirectWithResult(c, slug, page, {
        slack: 'error',
        message: 'The Slack sign-in link expired. Start the connection again.',
      })
    }

    try {
      if (!(await hasFeature(oauthState.organizationId, 'integrations.slack'))) {
        return redirectWithResult(c, slug, 'integrations', {
          slack: 'error',
          message: 'The Slack app is not included in this organization’s plan.',
        })
      }
      const config = getSlackConfig()
      const token = await exchangeSlackOauthCode({
        code: query.code,
        redirectUri: oauthState.redirectUri,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      })
      if (config.appId && token.appId && token.appId !== config.appId) {
        throw new SlackApiError('app_mismatch', {
          message: 'Slack returned a token for a different app than SLACK_APP_ID.',
        })
      }
      const identity = await slackAuthTest(token.accessToken)
      await slackInstallationRepository.upsert({
        organizationId: oauthState.organizationId,
        slackTeamId: token.teamId,
        slackTeamName: identity.teamName || token.teamName,
        slackTeamUrl: identity.url,
        slackEnterpriseId: token.enterpriseId,
        slackAppId: token.appId,
        botUserId: token.botUserId,
        botToken: token.accessToken,
        refreshToken: token.refreshToken,
        botTokenExpiresAt: token.expiresAt,
        scopes: token.scopes,
        installedByUserId: oauthState.userId,
        installedBySlackUserId: token.authedUserId,
      })
      channelCache.delete(oauthState.organizationId)
      return redirectWithResult(c, slug, page, { slack: 'connected' })
    } catch (error) {
      if (error instanceof SlackApiError || error instanceof SlackNotConfiguredError) {
        return redirectWithResult(c, slug, page, { slack: 'error', message: error.message })
      }
      throw error
    }
  })
  .patch('/', zValidator('json', updateSchema), async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)
    const installation = await slackInstallationRepository.updateSettings(
      organizationId,
      c.req.valid('json')
    )
    if (!installation) return c.json({ error: 'Slack is not connected.' }, 404)
    return c.json({
      installation: serializeInstallation(
        installation,
        await countSlackDestinations(organizationId)
      ),
    })
  })
  .delete('/', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)
    const installation = await slackInstallationRepository.findByOrganization(organizationId)
    if (!installation) return c.json({ success: true })

    // A workspace shared with another Durabull organization uses the same bot
    // token; revoking it would disconnect that organization too.
    const shared = await slackInstallationRepository.countOtherInstallationsForTeam(
      installation.slackTeamId,
      organizationId
    )
    if (shared === 0 && installation.status === 'active') {
      try {
        await slackAuthRevoke(decryptSecret(installation.encryptedBotToken))
      } catch {
        // Removal must succeed even if Slack already revoked the token.
      }
    }
    await slackInstallationRepository.delete(organizationId)
    channelCache.delete(organizationId)
    return c.json({ success: true, revokedToken: shared === 0 })
  })
  .post('/test', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)
    const installation = await slackInstallationRepository.findByOrganization(organizationId)
    if (!installation) return c.json({ error: 'Slack is not connected.' }, 404)
    try {
      const identity = await withSlackToken({ ...installation, status: 'active' }, (token) =>
        slackAuthTest(token)
      )
      if (identity.teamId && identity.teamId !== installation.slackTeamId) {
        return c.json({ error: 'The bot token belongs to a different Slack workspace.' }, 400)
      }
      await slackInstallationRepository.markValidated(organizationId)
      return c.json({ ok: true, teamName: identity.teamName, url: identity.url })
    } catch (error) {
      if (error instanceof SlackApiError) {
        return c.json({ error: error.message, code: error.code }, slackErrorStatus(error))
      }
      throw error
    }
  })
  .get('/channels', zValidator('query', channelsQuerySchema), async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)
    const installation = await slackInstallationRepository.findByOrganization(organizationId)
    if (!installation || installation.status !== 'active') {
      return c.json({ error: 'Slack is not connected.' }, 400)
    }
    const cached = channelCache.get(organizationId)
    if (c.req.valid('query').refresh !== 'true' && cached && cached.expiresAt > Date.now()) {
      return c.json(cached.value)
    }
    try {
      const value = await withSlackToken(installation, (token) => listSlackChannels(token))
      value.channels.sort((a, b) => a.name.localeCompare(b.name))
      channelCache.set(organizationId, { value, expiresAt: Date.now() + CHANNEL_CACHE_TTL_MS })
      return c.json(value)
    } catch (error) {
      if (error instanceof SlackApiError) {
        return c.json({ error: error.message, code: error.code }, slackErrorStatus(error))
      }
      throw error
    }
  })
  .get('/user-groups', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)
    const installation = await slackInstallationRepository.findByOrganization(organizationId)
    if (!installation || installation.status !== 'active') {
      return c.json({ error: 'Slack is not connected.' }, 400)
    }
    try {
      const userGroups = await withSlackToken(installation, (token) => listSlackUserGroups(token))
      userGroups.sort((a, b) => a.handle.localeCompare(b.handle))
      return c.json({ userGroups })
    } catch (error) {
      if (error instanceof SlackApiError) {
        return c.json({ error: error.message, code: error.code }, slackErrorStatus(error))
      }
      throw error
    }
  })
  .get('/manifest', (c) => {
    // Lets self-hosters copy the exact app manifest for this deployment from settings.
    return c.json({ manifest: buildSlackAppManifest({ baseUrl: appBaseUrl() }) })
  })

export function clearSlackChannelCache(): void {
  channelCache.clear()
}

export default app
