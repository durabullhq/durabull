import {
  alertCheckCursorRepository,
  alertDeliveryRepository,
  alertEventRepository,
  alertRuleRepository,
  alertWebhookDestinationRepository,
  decryptSecret,
  eq,
  getDb,
  linearIntegrationRepository,
  organization,
  redisDiscoveredQueueRepository,
} from '@durabull/dal'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { type CursorState, evaluateRule, type QueueSnapshot } from '../lib/alert-evaluator'
import { processAlertDeliveries } from '../lib/alert-notifier'
import { syncLinearIssuesForResolvedEvents } from '../lib/alert-resolution'
import {
  mergeWebhookSecretsOnUpdate,
  resolveWebhookTestSecret,
  sanitizeAlertDeliveryForClient,
  sanitizeNotificationChannels,
  validateWebhookUrls,
} from '../lib/alert-webhook-channels'
import { sendRateLimitedTestWebhook } from '../lib/alert-webhook-rate-limit'
import { getConnectionRedisOptions } from '../lib/connection-options'
import { getQueue } from '../lib/redis'

const alertTypeSchema = z.enum(['failure_threshold', 'failure_rate', 'queue_stalled', 'job_failed'])
const queueFilterModeSchema = z.enum(['include', 'exclude'])
const alertEventStatusSchema = z.enum(['firing', 'resolved', 'suppressed'])
const emailNotificationChannelSchema = z.object({
  type: z.literal('email'),
  target: z.string().email(),
})
const linearNotificationChannelSchema = z.object({
  type: z.literal('linear'),
  target: z.literal('org-default'),
  teamId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  labelIds: z.array(z.string().min(1)).max(50).optional(),
  assigneeId: z.string().min(1).optional(),
  stateId: z.string().min(1).optional(),
  priority: z.number().int().min(0).max(4).optional(),
})
const webhookNotificationChannelSchema = z
  .object({
    type: z.literal('webhook'),
    url: z.string().url().max(2048),
    secret: z.string().min(16).max(256).optional(),
  })
  .strict()
const savedWebhookNotificationChannelSchema = z
  .object({
    type: z.literal('webhook'),
    destinationId: z.string().uuid(),
  })
  .strict()
const notificationChannelSchema = z.union([
  emailNotificationChannelSchema,
  linearNotificationChannelSchema,
  webhookNotificationChannelSchema,
  savedWebhookNotificationChannelSchema,
])

const testWebhookSchema = z.object({
  url: z.string().url().max(2048),
  secret: z.string().min(16).max(256).optional(),
  ruleId: z.string().uuid().optional(),
})

const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  type: alertTypeSchema,
  queueName: z.string().min(1).nullable().optional().default(null),
  queueFilterMode: queueFilterModeSchema.nullable().optional().default(null),
  filterQueueNames: z.array(z.string().min(1)).max(500).optional().default([]),
  config: z.record(z.unknown()),
  notificationChannels: z.array(notificationChannelSchema).max(10).default([]),
  cooldownMinutes: z.number().int().min(1).max(1440).default(30),
  enabled: z.boolean().default(true),
})

const updateRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: alertTypeSchema.optional(),
  queueName: z.string().min(1).nullable().optional(),
  queueFilterMode: queueFilterModeSchema.nullable().optional(),
  filterQueueNames: z.array(z.string().min(1)).max(500).optional(),
  config: z.record(z.unknown()).optional(),
  notificationChannels: z.array(notificationChannelSchema).max(10).optional(),
  cooldownMinutes: z.number().int().min(1).max(1440).optional(),
  enabled: z.boolean().optional(),
})

const app = new Hono()
  .get('/rules', async (c) => {
    const connectionId = c.get('connectionId')
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const rules = await alertRuleRepository.findByConnection(connectionId, organizationId)
    return c.json({
      rules: rules.map((rule) => ({
        ...rule,
        notificationChannels: sanitizeNotificationChannels(
          Array.isArray(rule.notificationChannels) ? rule.notificationChannels : []
        ),
      })),
    })
  })
  .post('/rules', zValidator('json', createRuleSchema), async (c) => {
    const body = c.req.valid('json')
    const connectionId = c.get('connectionId')
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const configError = validateAlertConfig(body.type, body.config)
    if (configError) {
      return c.json({ error: configError }, 400)
    }
    const channelError = await validateNotificationChannels(
      body.notificationChannels,
      organizationId
    )
    if (channelError) {
      return c.json({ error: channelError }, 400)
    }

    const count = await alertRuleRepository.countByConnection(connectionId, organizationId)
    if (count >= 50) {
      return c.json({ error: 'Maximum of 50 alert rules per connection' }, 400)
    }

    const rule = await alertRuleRepository.create({
      ...body,
      connectionId,
      organizationId,
    })

    return c.json(
      {
        rule: {
          ...rule,
          notificationChannels: sanitizeNotificationChannels(
            Array.isArray(rule.notificationChannels) ? rule.notificationChannels : []
          ),
        },
      },
      201
    )
  })
  .patch('/rules/:ruleId', zValidator('json', updateRuleSchema), async (c) => {
    const { ruleId } = c.req.param()
    const body = c.req.valid('json')
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const existingRule = await alertRuleRepository.findById(ruleId, organizationId)
    if (!existingRule) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    if (body.type !== undefined || body.config !== undefined) {
      const nextType = body.type ?? existingRule.type
      const nextConfig = body.config ?? ((existingRule.config ?? {}) as Record<string, unknown>)
      const configError = validateAlertConfig(nextType, nextConfig)
      if (configError) {
        return c.json({ error: configError }, 400)
      }
    }
    if (body.notificationChannels !== undefined) {
      const channelError = await validateNotificationChannels(
        body.notificationChannels,
        organizationId
      )
      if (channelError) {
        return c.json({ error: channelError }, 400)
      }
      body.notificationChannels = mergeWebhookSecretsOnUpdate(
        body.notificationChannels,
        (existingRule.notificationChannels ?? []) as unknown[]
      )
    }

    const rule = await alertRuleRepository.update(ruleId, organizationId, body)
    if (!rule) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    if (body.enabled === false) {
      await alertEventRepository.resolveAllForRule(rule.id)
    }

    return c.json({
      rule: {
        ...rule,
        notificationChannels: sanitizeNotificationChannels(
          Array.isArray(rule.notificationChannels) ? rule.notificationChannels : []
        ),
      },
    })
  })
  .delete('/rules/:ruleId', async (c) => {
    const { ruleId } = c.req.param()
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const existingRule = await alertRuleRepository.findById(ruleId, organizationId)
    if (!existingRule) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    await alertEventRepository.resolveAllForRule(ruleId)
    await alertRuleRepository.delete(ruleId, organizationId)

    return c.json({ success: true })
  })
  .post(
    '/rules/:ruleId/test',
    zValidator(
      'query',
      z.object({
        deliver: z.enum(['true', 'false']).optional(),
      })
    ),
    async (c) => {
      const { ruleId } = c.req.param()
      const { deliver: deliverQuery } = c.req.valid('query')
      const deliver = deliverQuery === 'true'
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const connectionPrefix = c.get('connectionPrefix')
      const redisOptions = getConnectionRedisOptions(c)
      const connectionName = c.get('connectionName')
      const organizationId = c.get('organizationId')
      if (!organizationId) {
        return c.json({ error: 'Organization is required' }, 403)
      }

      const rule = await alertRuleRepository.findById(ruleId, organizationId)
      if (!rule) {
        return c.json({ error: 'Rule not found' }, 404)
      }

      let queueName = rule.queueName
      if (!queueName) {
        const discovered = await redisDiscoveredQueueRepository.listByConnection(connectionId, {
          offset: 0,
          limit: 1,
        })
        queueName = discovered[0]?.name ?? null
      }
      if (!queueName) {
        return c.json({ error: 'No queue available to test this rule yet' }, 400)
      }

      const queue = await getQueue(
        connectionId,
        connectionUrl,
        queueName,
        connectionPrefix,
        redisOptions
      )
      const [jobCountsRaw, failedMetricsRaw, completedMetricsRaw] = await Promise.all([
        queue.getJobCounts('failed', 'waiting', 'active', 'completed'),
        queue.getMetrics('failed', 0, 60),
        queue.getMetrics('completed', 0, 60),
      ])

      const snapshot: QueueSnapshot = {
        queueName,
        connectionName,
        jobCounts: {
          failed: jobCountsRaw.failed ?? 0,
          waiting: jobCountsRaw.waiting ?? 0,
          active: jobCountsRaw.active ?? 0,
          completed: jobCountsRaw.completed ?? 0,
        },
        failedMetrics: {
          count: failedMetricsRaw.meta.count,
          dataPoints: failedMetricsRaw.data,
        },
        completedMetrics: {
          count: completedMetricsRaw.meta.count,
          dataPoints: completedMetricsRaw.data,
        },
      }

      const cursorRow = await alertCheckCursorRepository.findByConnectionQueue(
        connectionId,
        queueName
      )
      const cursor: CursorState | null = cursorRow
        ? {
            lastCheckedAt: cursorRow.lastCheckedAt,
            lastFailedCount: cursorRow.lastFailedCount,
            lastCompletedCount: cursorRow.lastCompletedCount,
          }
        : null

      const evaluation = evaluateRule(rule, snapshot, cursor)

      const notificationChannels = Array.isArray(rule.notificationChannels)
        ? rule.notificationChannels
        : []

      let webhookTests:
        | Array<{
            url: string
            success: boolean
            httpStatus: number | null
            durationMs: number
            error?: string
          }>
        | undefined

      if (deliver) {
        const webhookChannels = await resolveWebhookTestChannels(
          notificationChannels,
          organizationId
        )
        const organizationSlug = await getOrganizationSlug(organizationId)
        webhookTests = await Promise.all(
          webhookChannels.map(async (channel) => {
            if ('error' in channel) {
              return {
                url: channel.url,
                success: false,
                httpStatus: null,
                durationMs: 0,
                error: channel.error,
              }
            }

            const result = await sendRateLimitedTestWebhook({
              url: channel.url,
              secret: channel.secret,
              organizationId,
              organizationSlug,
              connectionId,
              connectionName,
              ruleId: rule.id,
              ruleName: rule.name,
              ruleType: rule.type,
              queueName,
            })
            return {
              url: channel.url,
              success: result.success,
              httpStatus: result.httpStatus,
              durationMs: result.durationMs,
              error: result.error,
            }
          })
        )
      }

      return c.json({ evaluation, snapshot, webhookTests })
    }
  )
  .post('/webhooks/test', zValidator('json', testWebhookSchema), async (c) => {
    const body = c.req.valid('json')
    const connectionId = c.get('connectionId')
    const connectionName = c.get('connectionName')
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    let ruleName = 'Webhook test'
    let ruleType = 'job_failed'
    let queueName = 'example-queue'
    let ruleChannels: unknown[] | null = null

    if (body.ruleId) {
      const rule = await alertRuleRepository.findById(body.ruleId, organizationId)
      if (!rule) {
        return c.json({ error: 'Rule not found' }, 404)
      }
      ruleName = rule.name
      ruleType = rule.type
      queueName = rule.queueName ?? queueName
      ruleChannels = Array.isArray(rule.notificationChannels) ? rule.notificationChannels : []
    }

    const secret = resolveWebhookTestSecret(body.url, body.secret, ruleChannels)
    const urlError = await validateWebhookUrls([{ type: 'webhook', url: body.url, secret }])
    if (urlError) {
      return c.json({ error: urlError }, 400)
    }

    const organizationSlug = await getOrganizationSlug(organizationId)
    const result = await sendRateLimitedTestWebhook({
      url: body.url,
      secret,
      organizationId,
      organizationSlug,
      connectionId,
      connectionName,
      ruleId: body.ruleId,
      ruleName,
      ruleType,
      queueName,
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
  .get(
    '/events',
    zValidator(
      'query',
      z.object({
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        status: alertEventStatusSchema.optional(),
        queueName: z.string().min(1).optional(),
        jobId: z.string().min(1).optional(),
        alertRuleId: z.string().uuid().optional(),
      })
    ),
    async (c) => {
      const { offset, limit, status, queueName, jobId, alertRuleId } = c.req.valid('query')
      const connectionId = c.get('connectionId')
      const organizationId = c.get('organizationId')
      if (!organizationId) {
        return c.json({ error: 'Organization is required' }, 403)
      }

      const events = await alertEventRepository.findByConnection(connectionId, organizationId, {
        offset,
        limit,
        status,
        queueName,
        jobId,
        alertRuleId,
      })
      return c.json({ events: await attachDeliveries(events) })
    }
  )
  .post(
    '/events/resolve-bulk',
    zValidator(
      'json',
      z.object({
        eventIds: z.array(z.string().uuid()).min(1).max(500),
      })
    ),
    async (c) => {
      const { eventIds } = c.req.valid('json')
      const connectionId = c.get('connectionId')
      const organizationId = c.get('organizationId')
      if (!organizationId) {
        return c.json({ error: 'Organization is required' }, 403)
      }

      const resolvedEvents = await alertEventRepository.resolveMany(eventIds, organizationId, {
        connectionId,
      })

      // Close linked Linear issues in the background — a bulk resolve can cover
      // hundreds of incidents and must not block on external API calls.
      if (resolvedEvents.length > 0) {
        void syncLinearIssuesForResolvedEvents(resolvedEvents, { kind: 'manual' })
      }

      return c.json({
        resolvedCount: resolvedEvents.length,
        events: resolvedEvents,
      })
    }
  )
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
    const wasFiring = existing.status === 'firing'

    const event = await alertEventRepository.resolve(eventId, organizationId)
    if (!event) {
      return c.json({ error: 'Event not found' }, 404)
    }

    if (wasFiring) {
      void syncLinearIssuesForResolvedEvents([event], { kind: 'manual' })
    }

    return c.json({ event })
  })
  .post('/events/:eventId/deliveries/:deliveryId/retry', async (c) => {
    const { eventId, deliveryId } = c.req.param()
    const connectionId = c.get('connectionId')
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const event = await alertEventRepository.findById(eventId, organizationId)
    if (!event || event.connectionId !== connectionId) {
      return c.json({ error: 'Event not found' }, 404)
    }

    const reset = await alertDeliveryRepository.resetForRetry(deliveryId, eventId)
    if (!reset) {
      return c.json({ error: 'Delivery not found or is not in a retryable state.' }, 404)
    }

    // Dispatch only needs the connection identity, which the connection
    // middleware already resolved into context — no refetch/decrypt required.
    const connection = { id: connectionId, name: c.get('connectionName') }

    const rule = await alertRuleRepository.findById(event.alertRuleId, organizationId)
    await processAlertDeliveries(event, connection, rule?.name ?? 'Durabull alert', {
      deliveryId,
    })

    const [refreshed] = await attachDeliveries([event])
    return c.json({ event: refreshed })
  })

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

function validateAlertConfig(type: string, config: Record<string, unknown>): string | null {
  switch (type) {
    case 'failure_threshold': {
      const schema = z.object({
        count: z.number().int().min(1).max(10000),
        windowMinutes: z.number().int().min(1).max(1440),
      })
      const result = schema.safeParse(config)
      return result.success ? null : `Invalid config: ${result.error.message}`
    }
    case 'failure_rate': {
      const schema = z.object({
        rate: z.number().min(0.01).max(1),
        windowMinutes: z.number().int().min(1).max(1440),
        minSample: z.number().int().min(1).max(100000),
      })
      const result = schema.safeParse(config)
      return result.success ? null : `Invalid config: ${result.error.message}`
    }
    case 'queue_stalled': {
      const schema = z.object({
        stalledMinutes: z.number().int().min(1).max(1440),
      })
      const result = schema.safeParse(config)
      return result.success ? null : `Invalid config: ${result.error.message}`
    }
    case 'job_failed': {
      const schema = z.object({
        maxIssuesPerPoll: z.number().int().min(1).max(500).optional(),
      })
      const result = schema.safeParse(config)
      return result.success ? null : `Invalid config: ${result.error.message}`
    }
    default:
      return `Unknown alert type: ${type}`
  }
}

async function validateNotificationChannels(
  channels: z.infer<typeof notificationChannelSchema>[],
  organizationId: string
): Promise<string | null> {
  const inlineWebhookChannels = channels.filter(
    (channel): channel is z.infer<typeof webhookNotificationChannelSchema> =>
      channel.type === 'webhook' && 'url' in channel
  )
  const inlineWebhookTargets = new Set<string>()
  for (const channel of inlineWebhookChannels) {
    if (inlineWebhookTargets.has(channel.url)) {
      return 'Duplicate custom webhook URLs are not allowed on the same alert rule.'
    }
    inlineWebhookTargets.add(channel.url)
  }
  const webhookError = await validateWebhookUrls(inlineWebhookChannels)
  if (webhookError) return webhookError

  const savedWebhookDestinationIds = new Set<string>()
  for (const channel of channels) {
    if (channel.type !== 'webhook' || !('destinationId' in channel)) continue
    if (savedWebhookDestinationIds.has(channel.destinationId)) {
      return 'Duplicate saved webhook destinations are not allowed on the same alert rule.'
    }
    savedWebhookDestinationIds.add(channel.destinationId)

    const destination = await alertWebhookDestinationRepository.findById(
      channel.destinationId,
      organizationId
    )
    if (!destination) {
      return 'Webhook destination not found.'
    }
    if (!destination.enabled) {
      return `Webhook destination "${destination.name}" is disabled.`
    }
    if (destination.encryptedSigningSecret) {
      try {
        decryptSecret(destination.encryptedSigningSecret)
      } catch {
        return `Webhook destination "${destination.name}" signing secret could not be decrypted.`
      }
    }
  }

  const linearChannels = channels.filter((channel) => channel.type === 'linear')
  if (linearChannels.length > 1) {
    return 'Only one Linear notification channel is supported per rule.'
  }
  if (linearChannels.length === 0) return null

  const integration = await linearIntegrationRepository.findByOrganization(organizationId)
  if (!integration || integration.validationStatus !== 'valid') {
    return 'Linear integration must be configured and valid before Linear alert routing can be enabled.'
  }

  const missingTeam = linearChannels.some(
    (channel) => !channel.teamId && !integration.defaultTeamId
  )
  return missingTeam ? 'Linear alert routing requires a teamId or organization default team.' : null
}

type WebhookTestChannel =
  | {
      url: string
      secret?: string
    }
  | {
      url: string
      error: string
    }

async function resolveWebhookTestChannels(
  channels: unknown[],
  organizationId: string
): Promise<WebhookTestChannel[]> {
  const results: WebhookTestChannel[] = []

  for (const channel of channels) {
    if (
      typeof channel !== 'object' ||
      channel === null ||
      (channel as { type?: string }).type !== 'webhook'
    ) {
      continue
    }

    const url = (channel as { url?: unknown }).url
    if (typeof url === 'string') {
      results.push({
        url,
        secret:
          typeof (channel as { secret?: unknown }).secret === 'string'
            ? (channel as { secret: string }).secret
            : undefined,
      })
      continue
    }

    const destinationId = (channel as { destinationId?: unknown }).destinationId
    if (typeof destinationId !== 'string') continue

    const destination = await alertWebhookDestinationRepository.findById(
      destinationId,
      organizationId
    )
    if (!destination) {
      results.push({
        url: `destination:${destinationId}`,
        error: 'Webhook destination not found.',
      })
      continue
    }
    if (!destination.enabled) {
      results.push({
        url: destination.url,
        error: `Webhook destination "${destination.name}" is disabled.`,
      })
      continue
    }

    try {
      results.push({
        url: destination.url,
        secret: destination.encryptedSigningSecret
          ? decryptSecret(destination.encryptedSigningSecret)
          : undefined,
      })
    } catch {
      results.push({
        url: destination.url,
        error: `Webhook destination "${destination.name}" signing secret could not be decrypted.`,
      })
    }
  }

  return results
}

async function getOrganizationSlug(organizationId: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)

  return rows[0]?.slug ?? null
}

export default app
