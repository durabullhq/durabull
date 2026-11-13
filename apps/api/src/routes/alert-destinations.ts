import { AnalyticsEvents, SlackSurface } from '@durabull/analytics/events'
import {
  type AlertDestination,
  type AlertSlackDestinationConfig,
  alertDestinationRepository,
  decryptSecret,
  eq,
  getDb,
  linearIntegrationRepository,
  organization,
  slackInstallationRepository,
} from '@durabull/dal'
import { isEmailConfigured } from '@durabull/email'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  assertCapacity,
  isResourceSuspended,
  rebalanceCapacity,
  requireDeliveryFeature,
  suspendedResourceIds,
} from '../billing/entitlements'
import { toBillingHttpError } from '../billing/errors'
import { validateWebhookUrls } from '../lib/alert-webhook-channels'
import { sendRateLimitedTestWebhook } from '../lib/alert-webhook-rate-limit'
import { LinearApiError, validateLinearAccessToken } from '../lib/linear-client'
import { getValidLinearAccessToken } from '../lib/linear-oauth'
import { buildTestMessage } from '../lib/slack/alert-message'
import {
  findActiveSlackInstallation,
  parseSlackDestinationConfig,
  SLACK_WORKSPACE_CHANGED_MESSAGE,
  slackDestinationMatchesWorkspace,
} from '../lib/slack/alerts'
import { recordSlackEvent, slackErrorCode } from '../lib/slack/analytics'
import { getSlackChannel, postSlackMessage, SlackApiError } from '../lib/slack/client'
import { appBaseUrl } from '../lib/slack/config'
import { withSlackToken } from '../lib/slack/token'
import { requireOrganization } from '../middleware/auth'

const nameSchema = z.string().trim().min(1).max(120)

const linearConfigSchema = z
  .object({
    teamId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    labelIds: z.array(z.string().min(1)).max(50).optional(),
    assigneeId: z.string().min(1).optional(),
    stateId: z.string().min(1).optional(),
    priority: z.number().int().min(0).max(4).optional(),
  })
  .strict()

const slackConfigSchema = z
  .object({
    channelId: z
      .string()
      .trim()
      // Public (C…) and private (G…) channels; direct messages (D…) are not destinations.
      .regex(/^[CG][A-Z0-9]{2,}$/, 'Choose a Slack channel.'),
    channelName: z.string().trim().max(200).optional(),
    mention: z.enum(['none', 'here', 'channel']).optional(),
    userGroupIds: z
      .array(z.string().regex(/^S[A-Z0-9]+$/))
      .max(5)
      .optional(),
    threadUpdates: z.boolean().optional(),
    // Echoed back by clients editing a destination; the server always sets it.
    slackTeamId: z.string().optional(),
  })
  .strict()

const createDestinationSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('webhook'),
      name: nameSchema,
      url: z.string().trim().url().max(2048),
      signingSecret: z.string().min(16).max(256).nullable().optional(),
      enabled: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('email'),
      name: nameSchema,
      config: z.object({ target: z.string().trim().email() }).strict(),
      enabled: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('linear'),
      name: nameSchema,
      config: linearConfigSchema.optional().default({}),
      enabled: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('slack'),
      name: nameSchema,
      config: slackConfigSchema,
      enabled: z.boolean().optional(),
    })
    .strict(),
])

const updateDestinationSchema = z
  .object({
    name: nameSchema.optional(),
    url: z.string().trim().url().max(2048).optional(),
    signingSecret: z.string().min(16).max(256).nullable().optional(),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()

const listQuerySchema = z.object({
  type: z.enum(['webhook', 'email', 'linear', 'slack']).optional(),
})

async function validateLinearDestinationConfig(
  organizationId: string,
  config: { teamId?: string }
): Promise<string | null> {
  const integration = await linearIntegrationRepository.findByOrganization(organizationId)
  if (!integration || integration.validationStatus !== 'valid') {
    return 'Linear integration must be configured and valid before Linear destinations can be created.'
  }
  if (!config.teamId && !integration.defaultTeamId) {
    return 'Linear destinations require a teamId or organization default team.'
  }
  return null
}

/**
 * Checks a Slack destination's channel against the connected workspace and
 * returns the config to store, stamped with that workspace so a later switch
 * to another workspace can tell the channel no longer applies.
 */
async function validateSlackDestinationConfig(
  organizationId: string,
  config: z.infer<typeof slackConfigSchema>,
  /** Workspace an existing destination was saved in (updates only). */
  previous?: { slackTeamId?: unknown }
): Promise<{ error: string } | { config: AlertSlackDestinationConfig }> {
  const installation = await slackInstallationRepository.findByOrganization(organizationId)
  if (!installation) {
    return {
      error: 'Connect Slack under Settings → Integrations before creating Slack destinations.',
    }
  }
  if (installation.status !== 'active') {
    return { error: 'Slack needs to be reconnected before Slack destinations can be saved.' }
  }
  let channelName = config.channelName
  try {
    const channel = await withSlackToken(installation, (token) =>
      getSlackChannel(token, config.channelId)
    )
    if (channel.isArchived) return { error: `#${channel.name} is archived.` }
    if (channel.isPrivate && !channel.isMember) {
      return {
        error: `Invite @Durabull to #${channel.name} first: /invite @Durabull in the channel.`,
      }
    }
    channelName = channel.name || channelName
  } catch (error) {
    // Only a transient Slack outage may skip the check (delivery retries);
    // anything else (an unreadable stored token, say) must not save a
    // destination that cannot deliver.
    if (!(error instanceof SlackApiError)) throw error
    if (!error.retryable) return { error: error.message }
    // Moving a destination to the newly connected workspace needs Slack to
    // confirm the channel exists there, or an old channel id would be rebound.
    if (previous && previous.slackTeamId !== installation.slackTeamId) {
      return {
        error: `Slack could not confirm the channel in the connected workspace (${error.message}). Try again in a moment.`,
      }
    }
  }
  return { config: { ...config, channelName, slackTeamId: installation.slackTeamId } }
}

/** Coarse, id-free description of a Slack destination's settings for analytics. */
function slackDestinationProperties(config: Partial<AlertSlackDestinationConfig> | null) {
  return {
    slack_surface: SlackSurface.DESTINATIONS,
    slack_mention: config?.mention ?? 'none',
    slack_user_group_count: config?.userGroupIds?.length ?? 0,
    slack_thread_updates: config?.threadUpdates !== false,
  }
}

async function findOrganizationLabels(
  organizationId: string
): Promise<{ name: string; slug: string | null }> {
  const db = await getDb()
  const rows = await db
    .select({ name: organization.name, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)
  return { name: rows[0]?.name ?? 'your organization', slug: rows[0]?.slug ?? null }
}

const SLACK_TEST_INTERVAL_MS = 10_000
const lastSlackTestAt = new Map<string, number>()

/** One Slack test message per destination every few seconds; old entries are pruned. */
function takeSlackTestSlot(destinationId: string): boolean {
  const now = Date.now()
  for (const [id, sentAt] of lastSlackTestAt) {
    if (now - sentAt >= SLACK_TEST_INTERVAL_MS) lastSlackTestAt.delete(id)
  }
  if (lastSlackTestAt.has(destinationId)) return false
  lastSlackTestAt.set(destinationId, now)
  return true
}

const app = new Hono()
  .use('*', requireOrganization)
  .get('/', zValidator('query', listQuerySchema), async (c) => {
    const { type } = c.req.valid('query')
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const [destinations, suspended] = await Promise.all([
      alertDestinationRepository.listByOrganization(organizationId, { type }),
      suspendedResourceIds(organizationId, 'alert_destination'),
    ])
    const withUsage = await Promise.all(
      destinations.map(async (destination) => ({
        ...serializeDestination(destination),
        // Paused by the plan's destination limit: nothing is delivered to it.
        suspended: suspended.has(destination.id),
        inUseByRuleCount: await alertDestinationRepository.countRuleReferences(
          destination.id,
          organizationId
        ),
      }))
    )
    return c.json({ destinations: withUsage })
  })
  .post('/', zValidator('json', createDestinationSchema), async (c) => {
    const body = c.req.valid('json')
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    await requireDeliveryFeature(organizationId, body.type)
    await assertCapacity(organizationId, 'alerts.destinations')

    if (body.type === 'webhook') {
      const urlError = await validateWebhookUrls([{ type: 'webhook', url: body.url }])
      if (urlError) {
        return c.json({ error: urlError }, 400)
      }
    }
    if (body.type === 'linear') {
      const linearError = await validateLinearDestinationConfig(organizationId, body.config ?? {})
      if (linearError) {
        return c.json({ error: linearError }, 400)
      }
    }
    let slackConfig: AlertSlackDestinationConfig | null = null
    if (body.type === 'slack') {
      const validated = await validateSlackDestinationConfig(organizationId, body.config)
      if ('error' in validated) {
        return c.json({ error: validated.error }, 400)
      }
      slackConfig = validated.config
    }

    try {
      const destination = await alertDestinationRepository.create({
        organizationId,
        name: body.name,
        type: body.type,
        url: body.type === 'webhook' ? body.url : null,
        signingSecret: body.type === 'webhook' ? body.signingSecret : undefined,
        config: body.type === 'webhook' ? {} : (slackConfig ?? body.config ?? {}),
        enabled: body.enabled,
      })

      if (destination.type === 'slack') {
        recordSlackEvent(
          AnalyticsEvents.SLACK_DESTINATION_CREATED,
          { organizationId, userId: c.get('user')?.id ?? null },
          { ...slackDestinationProperties(slackConfig), slack_enabled: destination.enabled }
        )
      }
      return c.json({ destination: serializeDestination(destination) }, 201)
    } catch (error) {
      if (toBillingHttpError(error)) throw error
      return c.json({ error: normalizeDestinationWriteError(error) }, 400)
    }
  })
  .patch('/:destinationId', zValidator('json', updateDestinationSchema), async (c) => {
    const { destinationId } = c.req.param()
    const body = c.req.valid('json')
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const existing = await alertDestinationRepository.findById(destinationId, organizationId)
    if (!existing) {
      return c.json({ error: 'Destination not found' }, 404)
    }

    // Turning a paid destination back on needs the plan that delivers to it.
    // Editing or disabling one stays possible so a downgraded organization can
    // tidy up.
    if (body.enabled === true && !existing.enabled) {
      await requireDeliveryFeature(organizationId, existing.type)
    }

    if (body.url !== undefined) {
      if (existing.type !== 'webhook') {
        return c.json({ error: 'Only webhook destinations have a URL.' }, 400)
      }
      const urlError = await validateWebhookUrls([{ type: 'webhook', url: body.url }])
      if (urlError) {
        return c.json({ error: urlError }, 400)
      }
    }
    if (body.signingSecret !== undefined && existing.type !== 'webhook') {
      return c.json({ error: 'Only webhook destinations have a signing secret.' }, 400)
    }
    let updatedSlackConfig: AlertSlackDestinationConfig | null = null
    if (body.config !== undefined) {
      if (existing.type === 'email') {
        const parsed = z
          .object({ target: z.string().trim().email() })
          .strict()
          .safeParse(body.config)
        if (!parsed.success) {
          return c.json({ error: 'Email destinations require a valid target email address.' }, 400)
        }
      }
      if (existing.type === 'linear') {
        const parsed = linearConfigSchema.safeParse(body.config)
        if (!parsed.success) {
          return c.json({ error: 'Invalid Linear destination configuration.' }, 400)
        }
        const linearError = await validateLinearDestinationConfig(organizationId, parsed.data)
        if (linearError) {
          return c.json({ error: linearError }, 400)
        }
      }
      if (existing.type === 'slack') {
        const parsed = slackConfigSchema.safeParse(body.config)
        if (!parsed.success) {
          return c.json({ error: 'Slack destinations require a channel.' }, 400)
        }
        await requireDeliveryFeature(organizationId, 'slack')
        const validated = await validateSlackDestinationConfig(
          organizationId,
          parsed.data,
          (existing.config ?? {}) as { slackTeamId?: unknown }
        )
        if ('error' in validated) {
          return c.json({ error: validated.error }, 400)
        }
        updatedSlackConfig = validated.config
      }
      if (existing.type === 'webhook') {
        return c.json({ error: 'Webhook destinations are configured via url and secret.' }, 400)
      }
    }

    if (body.enabled === false) {
      const references = await alertDestinationRepository.countRuleReferences(
        destinationId,
        organizationId
      )
      if (references > 0) {
        return c.json(
          { error: 'Destination is used by alert rules. Remove it from rules before disabling.' },
          409
        )
      }
    }

    try {
      const destination = await alertDestinationRepository.update(destinationId, organizationId, {
        name: body.name,
        url: body.url,
        signingSecret: body.signingSecret,
        config: (updatedSlackConfig ?? body.config) as AlertDestination['config'] | undefined,
        enabled: body.enabled,
      })

      if (!destination) {
        return c.json({ error: 'Destination not found' }, 404)
      }

      if (destination.type === 'slack') {
        recordSlackEvent(
          AnalyticsEvents.SLACK_DESTINATION_UPDATED,
          { organizationId, userId: c.get('user')?.id ?? null },
          {
            ...slackDestinationProperties(
              (destination.config ?? null) as Partial<AlertSlackDestinationConfig> | null
            ),
            slack_enabled: destination.enabled,
            slack_setting:
              body.enabled !== undefined && body.enabled !== existing.enabled
                ? 'enabled'
                : updatedSlackConfig
                  ? 'config'
                  : 'name',
          }
        )
      }
      return c.json({ destination: serializeDestination(destination) })
    } catch (error) {
      if (toBillingHttpError(error)) throw error
      return c.json({ error: normalizeDestinationWriteError(error) }, 400)
    }
  })
  .delete('/:destinationId', async (c) => {
    const { destinationId } = c.req.param()
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const references = await alertDestinationRepository.countRuleReferences(
      destinationId,
      organizationId
    )
    if (references > 0) {
      return c.json(
        { error: 'Destination is used by alert rules. Remove it from rules before deleting.' },
        409
      )
    }

    const existing = await alertDestinationRepository.findById(destinationId, organizationId)
    const deleted = await alertDestinationRepository.delete(destinationId, organizationId)
    if (!deleted) {
      return c.json({ error: 'Destination not found' }, 404)
    }
    await rebalanceCapacity(organizationId)
    if (existing?.type === 'slack') {
      recordSlackEvent(
        AnalyticsEvents.SLACK_DESTINATION_DELETED,
        { organizationId, userId: c.get('user')?.id ?? null },
        slackDestinationProperties(
          (existing.config ?? null) as Partial<AlertSlackDestinationConfig> | null
        )
      )
    }

    return c.json({ ok: true })
  })
  .post('/:destinationId/test', async (c) => {
    const { destinationId } = c.req.param()
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const destination = await alertDestinationRepository.findById(destinationId, organizationId)
    if (!destination) {
      return c.json({ error: 'Destination not found' }, 404)
    }
    if (!destination.enabled) {
      return c.json({ error: 'Destination is disabled.' }, 400)
    }
    if (await isResourceSuspended(organizationId, 'alert_destination', destination.id)) {
      return c.json({ error: 'Destination is paused because it is above your plan limit.' }, 409)
    }
    await requireDeliveryFeature(organizationId, destination.type)

    switch (destination.type) {
      case 'webhook': {
        if (!destination.url) {
          return c.json({ error: 'Webhook destination has no URL configured.' }, 400)
        }

        let secret: string | undefined
        try {
          secret = decryptSecretOrThrow(destination)
        } catch (error) {
          return c.json(
            { error: error instanceof Error ? error.message : 'Invalid signing secret' },
            400
          )
        }

        const result = await sendRateLimitedTestWebhook({
          url: destination.url,
          secret,
          organizationId,
          organizationSlug: null,
          connectionId: 'test-connection',
          connectionName: 'Destination test',
          ruleName: 'Destination test',
          ruleType: 'job_failed',
          queueName: 'example-queue',
        })

        if (result.error?.includes('rate limit')) {
          return c.json({ error: result.error }, 429)
        }

        return c.json({
          success: result.success,
          httpStatus: result.httpStatus,
          durationMs: result.durationMs,
          error: result.error,
        })
      }
      case 'email': {
        if (!isEmailConfigured()) {
          return c.json(
            {
              success: false,
              error: 'Email delivery is not configured because RESEND_API_KEY is missing.',
            },
            400
          )
        }
        return c.json({ success: true })
      }
      case 'linear': {
        const integration = await linearIntegrationRepository.findByOrganization(organizationId)
        if (!integration) {
          return c.json({ error: 'Linear integration is not configured.' }, 400)
        }
        try {
          // Validates the token and org access without creating an issue.
          const accessToken = await getValidLinearAccessToken(integration)
          const result = await validateLinearAccessToken(accessToken)
          return c.json({ success: true, organizationName: result.organizationName })
        } catch (error) {
          if (error instanceof LinearApiError) {
            return c.json({ success: false, error: error.message }, error.retryable ? 503 : 400)
          }
          throw error
        }
      }
      case 'slack': {
        const testActor = { organizationId, userId: c.get('user')?.id ?? null }
        const recordTest = (success: boolean, errorCode?: string) =>
          recordSlackEvent(AnalyticsEvents.SLACK_DESTINATION_TESTED, testActor, {
            ...slackDestinationProperties(
              (destination.config ?? null) as Partial<AlertSlackDestinationConfig> | null
            ),
            success,
            slack_error_code: errorCode,
          })
        if (!takeSlackTestSlot(destination.id)) {
          return c.json({ error: 'Wait a few seconds before sending another test message.' }, 429)
        }
        const installation = await findActiveSlackInstallation(organizationId)
        if (!installation) {
          recordTest(false, 'not_connected')
          return c.json(
            { success: false, error: 'Slack is not connected or needs to be reconnected.' },
            400
          )
        }
        if (!slackDestinationMatchesWorkspace(destination, installation)) {
          recordTest(false, 'workspace_changed')
          return c.json({ success: false, error: SLACK_WORKSPACE_CHANGED_MESSAGE }, 400)
        }
        try {
          const config = parseSlackDestinationConfig(destination)
          const { name: orgName, slug } = await findOrganizationLabels(organizationId)
          const content = buildTestMessage({
            channelName: config.channelName ?? null,
            destinationName: destination.name,
            organizationName: orgName,
            settingsUrl: slug
              ? `${appBaseUrl()}/${encodeURIComponent(slug)}/settings/destinations`
              : appBaseUrl(),
          })
          const startedAt = Date.now()
          await withSlackToken(installation, (token) =>
            postSlackMessage(token, {
              channel: config.channelId,
              text: content.text,
              attachments: content.attachments,
            })
          )
          recordTest(true)
          return c.json({
            success: true,
            durationMs: Date.now() - startedAt,
            channelName: config.channelName ?? null,
          })
        } catch (error) {
          recordTest(false, slackErrorCode(error))
          if (error instanceof SlackApiError) {
            return c.json({ success: false, error: error.message }, error.retryable ? 503 : 400)
          }
          throw error
        }
      }
      default:
        return c.json({ error: 'Unknown destination type.' }, 400)
    }
  })

function serializeDestination(destination: AlertDestination) {
  const secret = tryDecryptSecret(destination)
  return {
    id: destination.id,
    organizationId: destination.organizationId,
    name: destination.name,
    type: destination.type,
    url: destination.url,
    config: destination.type === 'webhook' ? undefined : destination.config,
    enabled: destination.enabled,
    secretConfigured: Boolean(destination.encryptedSigningSecret),
    secretLast4: secret && secret.length >= 4 ? secret.slice(-4) : undefined,
    createdAt: destination.createdAt,
    updatedAt: destination.updatedAt,
  }
}

function tryDecryptSecret(destination: AlertDestination): string | undefined {
  if (!destination.encryptedSigningSecret) return undefined
  try {
    return decryptSecret(destination.encryptedSigningSecret)
  } catch {
    return undefined
  }
}

function decryptSecretOrThrow(destination: AlertDestination): string | undefined {
  if (!destination.encryptedSigningSecret) return undefined
  try {
    return decryptSecret(destination.encryptedSigningSecret)
  } catch {
    throw new Error('Webhook destination signing secret could not be decrypted.')
  }
}

function normalizeDestinationWriteError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('duplicate') || message.includes('unique')) {
    return 'A destination with that name already exists.'
  }
  return message
}

export default app
