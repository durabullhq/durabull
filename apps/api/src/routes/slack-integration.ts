import { randomBytes } from 'node:crypto'
import { AnalyticsEvents, AnalyticsProperties, SlackSurface } from '@durabull/analytics/events'
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
import { isAuthlessMode } from '../lib/authless'
import {
  findActiveSlackInstallation,
  queueSlackMessageSync,
  slackDestinationMatchesWorkspace,
} from '../lib/slack/alerts'
import { oauthErrorCode, recordSlackEvent, slackErrorCode } from '../lib/slack/analytics'
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
  SlackNotConfiguredError,
  slackInstallUrl,
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
    // Refusals here never reach OAuth, so they are recorded as failed connects.
    const refused = (reason: 'not_admin' | 'not_entitled' | 'not_configured') =>
      recordSlackEvent(
        AnalyticsEvents.SLACK_CONNECT_FAILED,
        { organizationId, userId: user?.id ?? null },
        {
          [AnalyticsProperties.SLACK_SURFACE]: SlackSurface.SETTINGS,
          [AnalyticsProperties.SLACK_REASON]: reason,
        }
      )
    if (!(await isOrganizationAdmin(c, organizationId))) {
      refused('not_admin')
      return c.json({ error: ADMIN_ONLY_MESSAGE }, 403)
    }
    if (!(await hasFeature(organizationId, 'integrations.slack'))) refused('not_entitled')
    await requireFeature(organizationId, 'integrations.slack')
    if (!user) return c.json({ error: 'User is required' }, 401)

    let config: ReturnType<typeof getSlackConfig>
    try {
      config = getSlackConfig()
    } catch (error) {
      if (error instanceof SlackNotConfiguredError) {
        refused('not_configured')
        return c.json({ error: error.message }, 503)
      }
      throw error
    }

    await slackOauthStateRepository.deleteExpired()
    const returnTo = c.req.valid('json')?.returnTo ?? 'integrations'
    const existing = await slackInstallationRepository.findByOrganization(organizationId)
    recordSlackEvent(
      AnalyticsEvents.SLACK_CONNECT_STARTED,
      { organizationId, userId: user.id },
      {
        [AnalyticsProperties.SLACK_SURFACE]: SlackSurface.SETTINGS,
        [AnalyticsProperties.SLACK_RETURN_TO]: returnTo,
        [AnalyticsProperties.SLACK_REINSTALL]: Boolean(existing),
        [AnalyticsProperties.SLACK_REASON]: existing
          ? existing.status === 'active'
            ? 'scopes'
            : 'reconnect'
          : 'new',
      }
    )
    const state = randomBytes(32).toString('base64url')
    await slackOauthStateRepository.create({
      organizationId,
      userId: user.id,
      state,
      redirectUri: config.redirectUri,
      returnTo,
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
    const actor = {
      organizationId: oauthState?.organizationId ?? null,
      userId: oauthState?.userId ?? null,
    }
    const connectFailed = (reason: string, errorCode?: string) =>
      recordSlackEvent(AnalyticsEvents.SLACK_CONNECT_FAILED, actor, {
        [AnalyticsProperties.SLACK_SURFACE]: SlackSurface.OAUTH,
        [AnalyticsProperties.SLACK_RETURN_TO]: page,
        [AnalyticsProperties.SLACK_REASON]: reason,
        [AnalyticsProperties.SLACK_ERROR_CODE]: errorCode,
      })

    if (query.error) {
      connectFailed(
        query.error === 'access_denied' ? 'cancelled' : 'slack_error',
        // Anyone can put text in the callback URL; only known OAuth errors are kept.
        oauthErrorCode(query.error)
      )
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
      recordSlackEvent(
        AnalyticsEvents.SLACK_INSTALL_LINK_OPENED,
        {},
        { slack_surface: SlackSurface.OAUTH, slack_source: 'slack_initiated' }
      )
      return c.redirect(slackInstallUrl(), 302)
    }
    if (!oauthState || !query.code) {
      connectFailed(oauthState ? 'missing_code' : 'expired')
      return redirectWithResult(c, slug, page, {
        slack: 'error',
        message: 'The Slack sign-in link expired. Start the connection again.',
      })
    }
    // The browser finishing the install must be signed in as the member who
    // started it. Otherwise someone could send their own install link to a
    // Slack admin and attach that workspace to the sender's organization.
    if (!isAuthlessMode() && c.get('user')?.id !== oauthState.userId) {
      connectFailed('wrong_user')
      return redirectWithResult(c, slug, page, {
        slack: 'error',
        message:
          'Finish connecting Slack while signed in to Durabull as the member who started it.',
      })
    }
    // Roles can change while the Slack consent screen is open.
    if (!(await isOrganizationAdmin(c, oauthState.organizationId))) {
      connectFailed('not_admin')
      return redirectWithResult(c, slug, page, { slack: 'error', message: ADMIN_ONLY_MESSAGE })
    }

    try {
      if (!(await hasFeature(oauthState.organizationId, 'integrations.slack'))) {
        connectFailed('not_entitled')
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
      const previous = await slackInstallationRepository.findByOrganization(
        oauthState.organizationId
      )
      const installation = await slackInstallationRepository.upsert({
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
      recordSlackEvent(AnalyticsEvents.SLACK_CONNECTED, actor, {
        [AnalyticsProperties.SLACK_SURFACE]: SlackSurface.OAUTH,
        [AnalyticsProperties.SLACK_RETURN_TO]: page,
        [AnalyticsProperties.SLACK_REINSTALL]: Boolean(previous),
        [AnalyticsProperties.SLACK_REASON]: !previous
          ? 'new'
          : previous.slackTeamId !== token.teamId
            ? 'workspace_changed'
            : previous.status === 'active'
              ? 'scopes'
              : 'reconnect',
        [AnalyticsProperties.SLACK_MISSING_SCOPE_COUNT]: missingScopes(installation).length,
        [AnalyticsProperties.SLACK_ACTIONS_ENABLED]: installation.actionsEnabled,
        [AnalyticsProperties.SLACK_UNFURLS_ENABLED]: installation.unfurlsEnabled,
      })
      return redirectWithResult(c, slug, page, { slack: 'connected' })
    } catch (error) {
      if (error instanceof SlackApiError || error instanceof SlackNotConfiguredError) {
        connectFailed(
          error instanceof SlackNotConfiguredError ? 'not_configured' : 'slack_error',
          error instanceof SlackApiError ? slackErrorCode(error) : undefined
        )
        return redirectWithResult(c, slug, page, { slack: 'error', message: error.message })
      }
      connectFailed('internal_error')
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
    const settingsActor = { organizationId, userId: c.get('user')?.id ?? null }
    for (const [setting, changed, enabled] of [
      [
        'actions',
        installation.actionsEnabled !== before.actionsEnabled,
        installation.actionsEnabled,
      ],
      [
        'unfurls',
        installation.unfurlsEnabled !== before.unfurlsEnabled,
        installation.unfurlsEnabled,
      ],
    ] as const) {
      if (!changed) continue
      recordSlackEvent(AnalyticsEvents.SLACK_SETTINGS_UPDATED, settingsActor, {
        [AnalyticsProperties.SLACK_SURFACE]: SlackSurface.SETTINGS,
        [AnalyticsProperties.SLACK_SETTING]: setting,
        [AnalyticsProperties.SLACK_ENABLED]: enabled,
      })
    }
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
    const removeActor = { organizationId, userId: c.get('user')?.id ?? null }
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
          recordSlackEvent(AnalyticsEvents.SLACK_DISCONNECTED, removeActor, {
            [AnalyticsProperties.SLACK_SURFACE]: SlackSurface.SETTINGS,
            [AnalyticsProperties.SUCCESS]: false,
            [AnalyticsProperties.SLACK_ERROR_CODE]:
              error instanceof SlackApiError ? slackErrorCode(error) : 'revoke_failed',
            [AnalyticsProperties.SLACK_SHARED_WORKSPACE]: false,
          })
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
    recordSlackEvent(AnalyticsEvents.SLACK_DISCONNECTED, removeActor, {
      [AnalyticsProperties.SLACK_SURFACE]: SlackSurface.SETTINGS,
      [AnalyticsProperties.SUCCESS]: true,
      [AnalyticsProperties.SLACK_REVOKED_TOKEN]: revokedToken,
      [AnalyticsProperties.SLACK_SHARED_WORKSPACE]: shared > 0,
      [AnalyticsProperties.SLACK_REASON]: installation.status === 'active' ? 'active' : 'revoked',
    })
    return c.json({ success: true, revokedToken })
  })
  .post('/test', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)
    await requireFeature(organizationId, 'integrations.slack')
    const installation = await slackInstallationRepository.findByOrganization(organizationId)
    if (!installation) return c.json({ error: 'Slack is not connected.' }, 404)
    const testActor = { organizationId, userId: c.get('user')?.id ?? null }
    const recordTest = (success: boolean, errorCode?: string) =>
      recordSlackEvent(AnalyticsEvents.SLACK_CONNECTION_TESTED, testActor, {
        [AnalyticsProperties.SLACK_SURFACE]: SlackSurface.SETTINGS,
        [AnalyticsProperties.SUCCESS]: success,
        [AnalyticsProperties.SLACK_ERROR_CODE]: errorCode,
        [AnalyticsProperties.SLACK_REASON]: installation.status,
      })
    try {
      // A revoked installation is still worth testing: if Slack accepts the
      // token again, the test marks it active.
      const identity = await withSlackToken(installation, (token) => slackAuthTest(token), {
        allowRevoked: true,
      })
      if (identity.teamId && identity.teamId !== installation.slackTeamId) {
        recordTest(false, 'workspace_mismatch')
        return c.json({ error: 'The bot token belongs to a different Slack workspace.' }, 400)
      }
      await slackInstallationRepository.markValidated(organizationId)
      recordTest(true)
      return c.json({ ok: true, teamName: identity.teamName, url: identity.url })
    } catch (error) {
      recordTest(false, slackErrorCode(error))
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
