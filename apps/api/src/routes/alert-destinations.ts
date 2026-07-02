import {
  type AlertDestination,
  alertDestinationRepository,
  decryptSecret,
  linearIntegrationRepository,
} from '@durabull/dal'
import { isEmailConfigured } from '@durabull/email'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { validateWebhookUrls } from '../lib/alert-webhook-channels'
import { sendRateLimitedTestWebhook } from '../lib/alert-webhook-rate-limit'
import { LinearApiError, validateLinearAccessToken } from '../lib/linear-client'
import { getValidLinearAccessToken } from '../lib/linear-oauth'
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
  type: z.enum(['webhook', 'email', 'linear']).optional(),
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

const app = new Hono()
  .use('*', requireOrganization)
  .get('/', zValidator('query', listQuerySchema), async (c) => {
    const { type } = c.req.valid('query')
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const destinations = await alertDestinationRepository.listByOrganization(organizationId, {
      type,
    })
    const withUsage = await Promise.all(
      destinations.map(async (destination) => ({
        ...serializeDestination(destination),
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

    try {
      const destination = await alertDestinationRepository.create({
        organizationId,
        name: body.name,
        type: body.type,
        url: body.type === 'webhook' ? body.url : null,
        signingSecret: body.type === 'webhook' ? body.signingSecret : undefined,
        config: body.type === 'webhook' ? {} : (body.config ?? {}),
        enabled: body.enabled,
      })

      return c.json({ destination: serializeDestination(destination) }, 201)
    } catch (error) {
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
    if (body.config !== undefined) {
      if (existing.type === 'email') {
        const parsed = z.object({ target: z.string().trim().email() }).strict().safeParse(body.config)
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
        config: body.config as AlertDestination['config'] | undefined,
        enabled: body.enabled,
      })

      if (!destination) {
        return c.json({ error: 'Destination not found' }, 404)
      }

      return c.json({ destination: serializeDestination(destination) })
    } catch (error) {
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

    const deleted = await alertDestinationRepository.delete(destinationId, organizationId)
    if (!deleted) {
      return c.json({ error: 'Destination not found' }, 404)
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
