import {
  type AlertWebhookDestination,
  alertWebhookDestinationRepository,
  decryptSecret,
} from '@durabull/dal'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { sendRateLimitedTestWebhook } from '../lib/alert-webhook-rate-limit'
import { validateWebhookUrls } from '../lib/alert-webhook-channels'
import { requireOrganization } from '../middleware/auth'

const webhookDestinationPayloadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(2048),
  signingSecret: z.string().min(16).max(256).nullable().optional(),
  enabled: z.boolean().optional(),
})

const webhookDestinationUpdateSchema = webhookDestinationPayloadSchema.partial()

const app = new Hono()
  .use('*', requireOrganization)
  .get('/', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    // Deprecated alias of /alerts/destinations, scoped to webhook destinations.
    const destinations = await alertWebhookDestinationRepository.listByOrganization(
      organizationId,
      { type: 'webhook' }
    )
    return c.json({ destinations: destinations.map(serializeWebhookDestination) })
  })
  .post('/', zValidator('json', webhookDestinationPayloadSchema), async (c) => {
    const body = c.req.valid('json')
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const urlError = await validateWebhookUrls([{ type: 'webhook', url: body.url }])
    if (urlError) {
      return c.json({ error: urlError }, 400)
    }

    try {
      const destination = await alertWebhookDestinationRepository.create({
        organizationId,
        name: body.name,
        url: body.url,
        signingSecret: body.signingSecret,
        enabled: body.enabled,
      })

      return c.json({ destination: serializeWebhookDestination(destination) }, 201)
    } catch (error) {
      return c.json({ error: normalizeDestinationWriteError(error) }, 400)
    }
  })
  .patch('/:destinationId', zValidator('json', webhookDestinationUpdateSchema), async (c) => {
    const { destinationId } = c.req.param()
    const body = c.req.valid('json')
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    // This alias only ever manages webhook destinations — reject requests
    // targeting an email/linear destination rather than silently writing
    // url/signingSecret onto a row of the wrong type.
    const existing = await alertWebhookDestinationRepository.findById(destinationId, organizationId)
    if (!existing || existing.type !== 'webhook') {
      return c.json({ error: 'Webhook destination not found' }, 404)
    }

    if (body.url !== undefined) {
      const urlError = await validateWebhookUrls([{ type: 'webhook', url: body.url }])
      if (urlError) {
        return c.json({ error: urlError }, 400)
      }
    }

    if (body.enabled === false) {
      const references = await alertWebhookDestinationRepository.countRuleReferences(
        destinationId,
        organizationId
      )
      if (references > 0) {
        return c.json(
          {
            error:
              'Webhook destination is used by alert rules. Remove it from rules before disabling.',
          },
          409
        )
      }
    }

    try {
      const destination = await alertWebhookDestinationRepository.update(
        destinationId,
        organizationId,
        {
          name: body.name,
          url: body.url,
          signingSecret: body.signingSecret,
          enabled: body.enabled,
        }
      )

      if (!destination) {
        return c.json({ error: 'Webhook destination not found' }, 404)
      }

      return c.json({ destination: serializeWebhookDestination(destination) })
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

    const existing = await alertWebhookDestinationRepository.findById(destinationId, organizationId)
    if (!existing || existing.type !== 'webhook') {
      return c.json({ error: 'Webhook destination not found' }, 404)
    }

    const references = await alertWebhookDestinationRepository.countRuleReferences(
      destinationId,
      organizationId
    )
    if (references > 0) {
      return c.json(
        {
          error:
            'Webhook destination is used by alert rules. Remove it from rules before deleting.',
        },
        409
      )
    }

    const deleted = await alertWebhookDestinationRepository.delete(destinationId, organizationId)
    if (!deleted) {
      return c.json({ error: 'Webhook destination not found' }, 404)
    }

    return c.json({ ok: true })
  })
  .post('/:destinationId/test', async (c) => {
    const { destinationId } = c.req.param()
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const destination = await alertWebhookDestinationRepository.findById(
      destinationId,
      organizationId
    )
    if (!destination || !destination.url) {
      return c.json({ error: 'Webhook destination not found' }, 404)
    }

    if (!destination.enabled) {
      return c.json({ error: 'Webhook destination is disabled.' }, 400)
    }

    let secret: string | undefined
    try {
      secret = decryptWebhookSecretOrThrow(destination)
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
      connectionName: 'Webhook destination test',
      ruleName: 'Webhook destination test',
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
  })

function serializeWebhookDestination(destination: AlertWebhookDestination) {
  const secret = tryDecryptWebhookSecret(destination)
  return {
    id: destination.id,
    organizationId: destination.organizationId,
    name: destination.name,
    url: destination.url,
    enabled: destination.enabled,
    secretConfigured: Boolean(destination.encryptedSigningSecret),
    secretLast4: secret && secret.length >= 4 ? secret.slice(-4) : undefined,
    createdAt: destination.createdAt,
    updatedAt: destination.updatedAt,
  }
}

function tryDecryptWebhookSecret(destination: AlertWebhookDestination): string | undefined {
  if (!destination.encryptedSigningSecret) return undefined
  try {
    return decryptSecret(destination.encryptedSigningSecret)
  } catch {
    return undefined
  }
}

function decryptWebhookSecretOrThrow(destination: AlertWebhookDestination): string | undefined {
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
    return 'A webhook destination with that name already exists.'
  }
  return message
}

export default app
