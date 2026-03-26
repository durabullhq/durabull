import {
  alertCheckCursorRepository,
  alertEventRepository,
  alertRuleRepository,
  redisDiscoveredQueueRepository,
} from '@durabull/dal'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { evaluateRule, type CursorState, type QueueSnapshot } from '../lib/alert-evaluator'
import { getQueue } from '../lib/redis'

const alertTypeSchema = z.enum(['failure_threshold', 'failure_rate', 'queue_stalled'])
const queueFilterModeSchema = z.enum(['include', 'exclude'])
const alertEventStatusSchema = z.enum(['firing', 'resolved', 'suppressed'])
const notificationChannelSchema = z.object({
  type: z.enum(['email']),
  target: z.string().email(),
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
    return c.json({ rules })
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

    const count = await alertRuleRepository.countByConnection(connectionId, organizationId)
    if (count >= 50) {
      return c.json({ error: 'Maximum of 50 alert rules per connection' }, 400)
    }

    const rule = await alertRuleRepository.create({
      ...body,
      connectionId,
      organizationId,
    })

    return c.json({ rule }, 201)
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

    const rule = await alertRuleRepository.update(ruleId, organizationId, body)
    if (!rule) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    if (body.enabled === false) {
      await alertEventRepository.resolveAllForRule(rule.id)
    }

    return c.json({ rule })
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
  .post('/rules/:ruleId/test', async (c) => {
    const { ruleId } = c.req.param()
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
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

    const queue = await getQueue(connectionId, connectionUrl, queueName)
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
    return c.json({ evaluation, snapshot })
  })
  .get(
    '/events',
    zValidator(
      'query',
      z.object({
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        status: alertEventStatusSchema.optional(),
      })
    ),
    async (c) => {
      const { offset, limit, status } = c.req.valid('query')
      const connectionId = c.get('connectionId')
      const organizationId = c.get('organizationId')
      if (!organizationId) {
        return c.json({ error: 'Organization is required' }, 403)
      }

      const events = await alertEventRepository.findByConnection(connectionId, organizationId, {
        offset,
        limit,
        status,
      })
      return c.json({ events })
    }
  )
  .post('/events/:eventId/resolve', async (c) => {
    const { eventId } = c.req.param()
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const event = await alertEventRepository.resolve(eventId, organizationId)
    if (!event) {
      return c.json({ error: 'Event not found' }, 404)
    }

    return c.json({ event })
  })

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
    default:
      return `Unknown alert type: ${type}`
  }
}

export default app
