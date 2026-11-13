import { randomBytes } from 'node:crypto'
import {
  alertDestinationRepository,
  billingRepository,
  decryptSecret,
  eq,
  getDb,
  organization,
  type SlackInstallation,
  slackAlertMessageRepository,
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
  slackAppsUninstall,
  slackAuthRevoke,
  slackAuthTest,
} from '../lib/slack/client'
import {
  appBaseUrl,
  buildSlackAuthorizeUrl,
  getSlackConfig,
  isSlackConfigured,
  SLACK_BOT_SCOPES,
  slackInstallUrl,
  SlackNotConfiguredError,
} from '../lib/slack/config'
import {
  findActiveSlackInstallation,
  queueSlackMessageSync,
  slackDestinationMatchesWorkspace,
} from '../lib/slack/alerts'
import { buildSlackAppManifest } from '../lib/slack/manifest'
import { withSlackToken } from '../lib/slack/token'
import { isAuthlessMode } from '../lib/authless'
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

/** Enabled Slack destinations whose channel belongs to the connected workspace. */
async function countSlackDestinations(installation: SlackInstallation): Promise<number> {
  const destinations = await alertDestinationRepository.listByOrganization(
    installation.organizationId,
    { type: 'slack' }
  )
  return destinations.filter(
    (destination) =>
      destination.enabled && slackDestinationMatchesWorkspace(destination, installation)
  ).length
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

const ADMIN_ROLES = new Set(['owner', 'admin'])
const ADMIN_ONLY_MESSAGE = 'Only organization owners and admins can change the Slack integration.'

/** Connecting, configuring and removing Slack is limited to owners and admins. */
async function isOrganizationAdmin(c: Context, organizationId: string): Promise<boolean> {
  if (isAuthlessMode()) return true
  const user = c.get('user')
  if (!user) return false
  const membership = await billingRepository.findMembership(organizationId, user.id)
  return (membership?.role ?? '').split(',').some((role) => ADMIN_ROLES.has(role.trim()))
}

/** JSON error response for a failed Slack call; anything that is not a Slack error is rethrown. */
function slackFailure(c: Context, error: unknown) {
  if (!(error instanceof SlackApiError)) throw error
  const status = error.retryable ? 503 : error.isAuthError ? 401 : 400
  return c.json({ error: error.message, code: error.code }, status)
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
    const [installation, entitled, canManage] = await Promise.all([
      slackInstallationRepository.findByOrganization(organizationId),
      hasFeature(organizationId, 'integrations.slack'),
      isOrganizationAdmin(c, organizationId),
    ])
    return c.json({
      // Lets clients tell which organization this answer is for when the
      // session's active organization changes mid-request.
      organizationId,
      configured: isSlackConfigured(),
      entitled,
      canManage,
      installation: installation
        ? serializeInstallation(installation, await countSlackDestinations(installation))
        : null,
    })
  })
  .post('/connect', zValidator('json', connectSchema), async (c) => {
    const organizationId = c.get('organizationId')
    const user = c.get('user')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)
    if (!(await isOrganizationAdmin(c, organizationId))) {
      return c.json({ error: ADMIN_ONLY_MESSAGE }, 403)
    }
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
    if (!query.state && query.code) {
      // Installed from Slack (the App Directory or a shareable install link),
      // so nothing ties this workspace to an organization or to a signed-in
      // member. Accepting the code here would let anyone attach their
      // workspace to whoever opens the link. Restart from Durabull's direct
      // install URL instead: Slack re-approves an installed app in one click.
      return c.redirect(slackInstallUrl(), 302)
    }
    if (!oauthState || !query.code) {
      return redirectWithResult(c, slug, page, {
        slack: 'error',
        message: 'The Slack sign-in link expired. Start the connection again.',
      })
    }
    // The browser finishing the install must be signed in as the member who
    // started it. Otherwise someone could send their own install link to a
    // Slack admin and attach that workspace to the sender's organization.
    if (!isAuthlessMode() && c.get('user')?.id !== oauthState.userId) {
      return redirectWithResult(c, slug, page, {
        slack: 'error',
        message:
          'Finish connecting Slack while signed in to Durabull as the member who started it.',
      })
    }
    // Roles can change while the Slack consent screen is open.
    if (!(await isOrganizationAdmin(c, oauthState.organizationId))) {
      return redirectWithResult(c, slug, page, { slack: 'error', message: ADMIN_ONLY_MESSAGE })
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
      // Messages parked while Slack access was lost can update again.
      await slackAlertMessageRepository.reviveForWorkspace(oauthState.organizationId, token.teamId)
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
    if (!(await isOrganizationAdmin(c, organizationId))) {
      return c.json({ error: ADMIN_ONLY_MESSAGE }, 403)
    }
    const settings = c.req.valid('json')
    const before = await slackInstallationRepository.findByOrganization(organizationId)
    if (!before) return c.json({ error: 'Slack is not connected.' }, 404)
    const installation = await slackInstallationRepository.updateSettings(organizationId, settings)
    if (!installation) return c.json({ error: 'Slack is not connected.' }, 404)
    if (installation.actionsEnabled !== before.actionsEnabled) {
      // Open incidents' messages show or hide their buttons to match.
      queueSlackMessageSync(
        await slackAlertMessageRepository.requestRefreshForOpenIncidents(organizationId)
      )
    }
    return c.json({
      installation: serializeInstallation(installation, await countSlackDestinations(installation)),
    })
  })
  .delete('/', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)
    if (!(await isOrganizationAdmin(c, organizationId))) {
      return c.json({ error: ADMIN_ONLY_MESSAGE }, 403)
    }
    const installation = await slackInstallationRepository.findByOrganization(organizationId)
    if (!installation) return c.json({ success: true })

    // A workspace shared with another Durabull organization uses the same bot
    // token; revoking it would disconnect that organization too.
    const shared = await slackInstallationRepository.countOtherInstallationsForTeam(
      installation.slackTeamId,
      organizationId
    )
    let revokedToken = false
    if (shared === 0 && installation.status === 'active') {
      try {
        const token = decryptSecret(installation.encryptedBotToken)
        if (isSlackConfigured()) {
          // Uninstalling revokes every token the app holds in the workspace.
          const { clientId, clientSecret } = getSlackConfig()
          await slackAppsUninstall({ token, clientId, clientSecret })
        } else {
          await slackAuthRevoke(token)
        }
        revokedToken = true
      } catch (error) {
        // A token Slack already rejects is as good as revoked. Anything else
        // (a timeout, a Slack outage) keeps the installation so removal can be
        // retried without leaving a live token behind in the workspace.
        if (!(error instanceof SlackApiError && error.isAuthError)) {
          return c.json(
            {
              error:
                'Slack did not confirm that the app’s access was revoked, so Slack is still connected. Try again in a moment.',
              code: error instanceof SlackApiError ? error.code : 'revoke_failed',
            },
            503
          )
        }
        revokedToken = true
      }
    }
    await slackInstallationRepository.delete(organizationId)
    channelCache.delete(organizationId)
    return c.json({ success: true, revokedToken })
  })
  .post('/test', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)
    await requireFeature(organizationId, 'integrations.slack')
    const installation = await slackInstallationRepository.findByOrganization(organizationId)
    if (!installation) return c.json({ error: 'Slack is not connected.' }, 404)
    try {
      // A revoked installation is still worth testing: if Slack accepts the
      // token again, the test marks it active.
      const identity = await withSlackToken(installation, (token) => slackAuthTest(token), {
        allowRevoked: true,
      })
      if (identity.teamId && identity.teamId !== installation.slackTeamId) {
        return c.json({ error: 'The bot token belongs to a different Slack workspace.' }, 400)
      }
      await slackInstallationRepository.markValidated(organizationId)
      return c.json({ ok: true, teamName: identity.teamName, url: identity.url })
    } catch (error) {
      return slackFailure(c, error)
    }
  })
  .get('/channels', zValidator('query', channelsQuerySchema), async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)
    await requireFeature(organizationId, 'integrations.slack')
    const installation = await findActiveSlackInstallation(organizationId)
    if (!installation) return c.json({ error: 'Slack is not connected.' }, 400)
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
      return slackFailure(c, error)
    }
  })
  .get('/user-groups', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)
    await requireFeature(organizationId, 'integrations.slack')
    const installation = await findActiveSlackInstallation(organizationId)
    if (!installation) return c.json({ error: 'Slack is not connected.' }, 400)
    try {
      const userGroups = await withSlackToken(installation, (token) => listSlackUserGroups(token))
      userGroups.sort((a, b) => a.handle.localeCompare(b.handle))
      return c.json({ userGroups })
    } catch (error) {
      return slackFailure(c, error)
    }
  })
  .get('/manifest', (c) => {
    // Lets self-hosters copy the exact app manifest for this deployment from settings.
    return c.json({
      manifest: buildSlackAppManifest({
        baseUrl: appBaseUrl(),
        redirectUri: env.SLACK_OAUTH_REDIRECT_URI?.trim() || undefined,
        // Slack verifies the events URL when the manifest is saved, and this
        // deployment cannot answer that check until its Slack secrets are set.
        skipEvents: !isSlackConfigured(),
      }),
    })
  })

export function clearSlackChannelCache(): void {
  channelCache.clear()
}

export default app
