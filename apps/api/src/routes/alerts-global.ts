import { randomBytes } from 'node:crypto'
import {
  alertDeliveryRepository,
  alertEventRepository,
  decryptSecret,
  linearIntegrationRepository,
  linearOauthStateRepository,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { zValidator } from '@hono/zod-validator'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { syncLinearIssuesForResolvedEvents } from '../lib/alert-resolution'
import { sanitizeAlertDeliveryForClient } from '../lib/alert-webhook-channels'
import {
  exchangeLinearOauthCode,
  fetchLinearMetadata,
  LinearApiError,
  revokeLinearOauthToken,
  validateLinearAccessToken,
} from '../lib/linear-client'
import {
  buildLinearOauthAuthorizeUrl,
  getLinearOauthConfig,
  getValidLinearAccessToken,
} from '../lib/linear-oauth'
import { requireOrganization } from '../middleware/auth'

const linearDefaultsSchema = z.object({
  defaultTeamId: z.string().min(1).nullable().optional(),
  defaultProjectId: z.string().min(1).nullable().optional(),
  defaultLabelIds: z.array(z.string().min(1)).max(50).optional().default([]),
  defaultAssigneeId: z.string().min(1).nullable().optional(),
  defaultStateId: z.string().min(1).nullable().optional(),
  defaultPriority: z.number().int().min(0).max(4).nullable().optional(),
})

const putLinearIntegrationSchema = linearDefaultsSchema

const linearOauthCallbackSchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().min(1).optional(),
})

type LinearDefaultsInput = {
  defaultTeamId?: string | null
  defaultProjectId?: string | null
  defaultLabelIds?: string[]
  defaultAssigneeId?: string | null
  defaultStateId?: string | null
  defaultPriority?: number | null
}

const app = new Hono()
  .use('*', async (c, next) => {
    if (c.req.path.endsWith('/integrations/linear/callback')) {
      await next()
      return
    }

    return requireOrganization(c, next)
  })
  .get(
    '/events',
    zValidator(
      'query',
      z.object({
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        status: z.enum(['firing', 'resolved', 'suppressed']).optional(),
        acknowledged: z.enum(['true', 'false']).optional(),
        connectionId: z.string().uuid().optional(),
      })
    ),
    async (c) => {
      const { offset, limit, status, acknowledged, connectionId } = c.req.valid('query')
      const organizationId = c.get('organizationId')
      if (!organizationId) {
        return c.json({ error: 'Organization is required' }, 403)
      }

      const events = await alertEventRepository.findByOrganization(organizationId, {
        offset,
        limit,
        status,
        acknowledged: acknowledged === undefined ? undefined : acknowledged === 'true',
        connectionId,
      })
      return c.json({ events: await attachDeliveries(events) })
    }
  )
  .get('/summary', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const summaries = await alertEventRepository.summarizeOpenByOrganization(organizationId)
    return c.json({
      connections: summaries.map((summary) => ({
        ...summary,
        // Legacy key consumed by older clients; open = firing + acknowledged.
        count: summary.open,
      })),
    })
  })
  .post('/events/:eventId/resolve', async (c) => {
    const { eventId } = c.req.param()
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const existing = await alertEventRepository.findById(eventId, organizationId)
    if (!existing) {
      return c.json({ error: 'Event not found' }, 404)
    }
    if (existing.status === 'suppressed') {
      return c.json({ error: 'Suppressed events are informational and cannot be resolved.' }, 409)
    }
    const wasFiring = existing.status === 'firing'

    const event = await alertEventRepository.resolve(eventId, organizationId)
    if (!event) {
      return c.json({ error: 'Event not found' }, 404)
    }

    // Mirror the connection-scoped resolve: close linked Linear issues in the
    // background so resolving from the org feed behaves identically.
    if (wasFiring) {
      void syncLinearIssuesForResolvedEvents([event], { kind: 'manual' })
    }

    return c.json({ event })
  })
  .post('/events/:eventId/acknowledge', async (c) => {
    const { eventId } = c.req.param()
    const organizationId = c.get('organizationId')
    const user = c.get('user')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }
    if (!user) {
      return c.json({ error: 'Authentication is required to acknowledge alerts' }, 401)
    }

    const event = await alertEventRepository.acknowledge(eventId, organizationId, user.id)
    if (!event) {
      const existing = await alertEventRepository.findById(eventId, organizationId)
      if (!existing) {
        return c.json({ error: 'Event not found' }, 404)
      }
      return c.json({ error: 'Only unacknowledged firing events can be acknowledged.' }, 409)
    }

    return c.json({ event: { ...event, acknowledgedByName: user.name } })
  })
  .delete('/events/:eventId/acknowledge', async (c) => {
    const { eventId } = c.req.param()
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const event = await alertEventRepository.unacknowledge(eventId, organizationId)
    if (!event) {
      const existing = await alertEventRepository.findById(eventId, organizationId)
      if (!existing) {
        return c.json({ error: 'Event not found' }, 404)
      }
      return c.json({ error: 'Only acknowledged firing events can be unacknowledged.' }, 409)
    }

    return c.json({ event: { ...event, acknowledgedByName: null } })
  })
  .get('/integrations/linear', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const integration = await linearIntegrationRepository.findByOrganization(organizationId)
    return c.json({ integration: integration ? serializeLinearIntegration(integration) : null })
  })
  .post('/integrations/linear/connect', async (c) => {
    const organizationId = c.get('organizationId')
    const user = c.get('user')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }
    if (!user) {
      return c.json({ error: 'User is required' }, 401)
    }

    let config: ReturnType<typeof getLinearOauthConfig>
    try {
      config = getLinearOauthConfig()
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : 'Linear OAuth is not configured.' },
        503
      )
    }

    await linearOauthStateRepository.deleteExpired()
    const state = randomBytes(32).toString('base64url')
    await linearOauthStateRepository.create({
      organizationId,
      userId: user.id,
      state,
      redirectUri: config.redirectUri,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    })

    const authorizationUrl = buildLinearOauthAuthorizeUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
      actor: config.actor,
    })

    if (env.NODE_ENV !== 'production') {
      const safeAuthorizationUrl = new URL(authorizationUrl)
      safeAuthorizationUrl.search = ''
      console.info('[linear-oauth] starting authorization', {
        organizationId,
        userId: user.id,
        redirectUri: config.redirectUri,
        actor: config.actor,
        authorizationUrl: safeAuthorizationUrl.toString(),
      })
    }

    return c.json({ authorizationUrl })
  })
  .get(
    '/integrations/linear/callback',
    zValidator('query', linearOauthCallbackSchema),
    async (c) => {
      const query = c.req.valid('query')
      if (query.error) {
        return redirectToSettings(c, {
          linear: 'error',
          message: query.error_description ?? query.error,
        })
      }
      if (!query.code || !query.state) {
        return c.json({ error: 'Linear OAuth callback is missing code or state.' }, 400)
      }

      const oauthState = await linearOauthStateRepository.consumeByState(query.state)
      if (!oauthState) {
        return c.json({ error: 'Linear OAuth state is invalid or expired.' }, 400)
      }

      try {
        const { clientId, clientSecret } = getLinearOauthConfig()
        const token = await exchangeLinearOauthCode({
          code: query.code,
          redirectUri: oauthState.redirectUri,
          clientId,
          clientSecret,
        })
        const validation = await validateLinearAccessToken(token.accessToken)
        const existing = await linearIntegrationRepository.findByOrganization(
          oauthState.organizationId
        )

        await linearIntegrationRepository.upsertOauth({
          organizationId: oauthState.organizationId,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          tokenType: token.tokenType,
          scopes: token.scopes,
          accessTokenExpiresAt: token.accessTokenExpiresAt,
          linearOrganizationName: validation.organizationName,
          validationStatus: 'valid',
          lastValidatedAt: new Date(),
          ...normalizeLinearDefaults(existing ?? {}),
        })

        return redirectToSettings(c, { linear: 'connected' })
      } catch (error) {
        if (error instanceof LinearApiError) {
          return redirectToSettings(c, { linear: 'error', message: error.message })
        }
        throw error
      }
    }
  )
  .put('/integrations/linear', zValidator('json', putLinearIntegrationSchema), async (c) => {
    const body = c.req.valid('json')
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const existing = await linearIntegrationRepository.findByOrganization(organizationId)
    if (!existing) {
      return c.json({ error: 'Linear integration is not configured.' }, 404)
    }

    const integration = await linearIntegrationRepository.updateDefaults(organizationId, {
      validationStatus: existing.validationStatus,
      lastValidatedAt: existing.lastValidatedAt,
      ...normalizeLinearDefaults(body),
    })

    return c.json({ integration: integration ? serializeLinearIntegration(integration) : null })
  })
  .delete('/integrations/linear', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const integration = await linearIntegrationRepository.findByOrganization(organizationId)
    if (integration) {
      await revokeLinearIntegrationTokens(integration)
    }
    await linearIntegrationRepository.delete(organizationId)
    return c.json({ success: true })
  })
  .post('/integrations/linear/test', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const integration = await linearIntegrationRepository.findByOrganization(organizationId)
    if (!integration) {
      return c.json({ error: 'Linear integration is not configured.' }, 404)
    }

    try {
      const accessToken = await getValidLinearAccessToken(integration)
      const result = await validateLinearAccessToken(accessToken)
      await linearIntegrationRepository.markValidationStatus(organizationId, 'valid')
      return c.json({ ok: true, organizationName: result.organizationName })
    } catch (error) {
      if (error instanceof LinearApiError) {
        if (!error.retryable) {
          await linearIntegrationRepository.markValidationStatus(organizationId, 'invalid')
        }
        return c.json(
          { error: error.message },
          error.retryable ? 503 : error.status === 401 ? 401 : 400
        )
      }
      throw error
    }
  })
  .get('/integrations/linear/metadata', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const integration = await linearIntegrationRepository.findByOrganization(organizationId)
    if (!integration || integration.validationStatus !== 'valid') {
      return c.json({ error: 'Linear integration is not configured or valid.' }, 400)
    }

    try {
      const accessToken = await getValidLinearAccessToken(integration)
      const metadata = await fetchLinearMetadata(accessToken)
      return c.json({ metadata })
    } catch (error) {
      if (error instanceof LinearApiError) {
        return c.json({ error: error.message }, error.retryable ? 503 : 400)
      }
      throw error
    }
  })

function normalizeLinearDefaults(body: LinearDefaultsInput) {
  return {
    defaultTeamId: body.defaultTeamId ?? null,
    defaultProjectId: body.defaultProjectId ?? null,
    defaultLabelIds: body.defaultLabelIds ?? [],
    defaultAssigneeId: body.defaultAssigneeId ?? null,
    defaultStateId: body.defaultStateId ?? null,
    defaultPriority: body.defaultPriority ?? null,
  }
}

function settingsRedirectUrl(params: Record<string, string>): string {
  const url = new URL('/settings', env.APP_BASE_URL)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

function redirectToSettings(c: Context, params: Record<string, string>) {
  return c.redirect(settingsRedirectUrl(params), 302)
}

async function revokeLinearIntegrationTokens(
  integration: NonNullable<
    Awaited<ReturnType<typeof linearIntegrationRepository.findByOrganization>>
  >
) {
  try {
    const { clientId, clientSecret } = getLinearOauthConfig()
    await Promise.allSettled([
      revokeLinearOauthToken({
        token: decryptSecret(integration.encryptedRefreshToken),
        tokenTypeHint: 'refresh_token',
        clientId,
        clientSecret,
      }),
      revokeLinearOauthToken({
        token: decryptSecret(integration.encryptedAccessToken),
        tokenTypeHint: 'access_token',
        clientId,
        clientSecret,
      }),
    ])
  } catch {
    // Deletion should remain possible if Linear OAuth credentials were rotated or removed.
  }
}

async function attachDeliveries<T extends { id: string }>(events: T[]) {
  return Promise.all(
    events.map(async (event) => ({
      ...event,
      deliveries: (await alertDeliveryRepository.listByEvent(event.id)).map((delivery) =>
        sanitizeAlertDeliveryForClient(delivery)
      ),
    }))
  )
}

function serializeLinearIntegration(
  integration: NonNullable<
    Awaited<ReturnType<typeof linearIntegrationRepository.findByOrganization>>
  >
) {
  return {
    id: integration.id,
    organizationId: integration.organizationId,
    connected: true,
    validationStatus: integration.validationStatus,
    scopes: integration.scopes,
    accessTokenExpiresAt: integration.accessTokenExpiresAt,
    linearOrganizationName: integration.linearOrganizationName,
    defaultTeamId: integration.defaultTeamId,
    defaultProjectId: integration.defaultProjectId,
    defaultLabelIds: integration.defaultLabelIds,
    defaultAssigneeId: integration.defaultAssigneeId,
    defaultStateId: integration.defaultStateId,
    defaultPriority: integration.defaultPriority,
    lastValidatedAt: integration.lastValidatedAt,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  }
}

export default app
