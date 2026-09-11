import { alertRuleRepository } from '@durabull/dal'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  collectQueueNativeMetrics,
  DEFAULT_METRICS_WINDOW_MINUTES,
  DEFAULT_PRIORITY_BUCKETS,
  MAX_METRICS_WINDOW_MINUTES,
} from '../lib/bullmq-metrics'
import { getConnectionRedisOptions } from '../lib/connection-options'
import { discoverQueues, getQueue } from '../lib/redis'
import { redisHealthConfigSchema } from '../lib/redis-health'
import {
  getRedisHealthHistory,
  getRedisHealthRetentionDays,
  getRedisHealthSampleIntervalMs,
  isRedisHealthHistoryEnabled,
} from '../lib/redis-health-history'

// Default and max page sizes for pagination
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const metricsQuerySchema = z.object({
  detailed: z.string().optional(),
  windowMinutes: z.string().optional(),
  includePrometheus: z.string().optional(),
  priorities: z.string().optional(),
})
const redisHealthHistoryQuerySchema = z.object({
  windowMinutes: z.coerce.number().int().min(5).max(43_200).default(1_440),
  targetPoints: z.coerce.number().int().min(30).max(1_000).default(480),
})

function parseInteger(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseBoolean(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

function parsePriorities(value: string | undefined): number[] {
  if (!value) return [...DEFAULT_PRIORITY_BUCKETS]

  const parsed = Array.from(
    new Set(
      value
        .split(',')
        .map((segment) => Number.parseInt(segment.trim(), 10))
        .filter((priority) => Number.isFinite(priority) && priority > 0 && priority <= 2097152)
    )
  )

  return parsed.length > 0 ? parsed.sort((a, b) => a - b) : [...DEFAULT_PRIORITY_BUCKETS]
}

const app = new Hono()
  .get('/redis-health', zValidator('query', redisHealthHistoryQuerySchema), async (c) => {
    const connectionId = c.get('connectionId')
    const organizationId = c.get('organizationId')
    if (!organizationId) return c.json({ error: 'Organization is required' }, 403)

    const query = c.req.valid('query')
    const to = new Date()
    const from = new Date(to.getTime() - query.windowMinutes * 60_000)
    const sampleIntervalMs = getRedisHealthSampleIntervalMs()
    const [history, rules] = await Promise.all([
      getRedisHealthHistory(connectionId, {
        from,
        to,
        targetPoints: query.targetPoints,
        expectedSampleIntervalMinutes: sampleIntervalMs / 60_000,
      }),
      alertRuleRepository.findByConnection(connectionId, organizationId),
    ])
    const now = Date.now()
    const thresholds = rules.flatMap((rule) => {
      if (
        rule.type !== 'redis_health' ||
        !rule.enabled ||
        (rule.mutedUntil !== null && rule.mutedUntil.getTime() > now)
      ) {
        return []
      }
      const config = redisHealthConfigSchema.safeParse(rule.config)
      if (!config.success) return []
      return [
        {
          ruleId: rule.id,
          name: rule.name,
          metric: config.data.metric,
          threshold: config.data.threshold,
        },
      ]
    })

    return c.json({
      ...history,
      thresholds,
      collectionEnabled: isRedisHealthHistoryEnabled(),
      retentionDays: getRedisHealthRetentionDays(),
      staleAfterMs: Math.max(180_000, sampleIntervalMs * 3),
    })
  })
  // Get all metrics (paginated by queue)
  .get('/', zValidator('query', metricsQuerySchema), async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const query = c.req.valid('query')
    const pageStr = c.req.query('page')
    const pageSizeStr = c.req.query('pageSize')

    const page = pageStr ? parseInt(pageStr, 10) : 1
    const pageSize = Math.min(
      pageSizeStr ? parseInt(pageSizeStr, 10) : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    )

    const allQueueNames = await discoverQueues(
      connectionId,
      connectionUrl,
      connectionPrefix,
      redisOptions
    )
    const total = allQueueNames.length

    // Paginate the queue names BEFORE fetching metrics
    const start = (page - 1) * pageSize
    const end = start + pageSize
    const paginatedQueueNames = allQueueNames.slice(start, end)
    const detailed = parseBoolean(query.detailed)
    const includePrometheus = parseBoolean(query.includePrometheus)
    const windowParam = parseInteger(query.windowMinutes)
    const requestedWindowMinutes =
      windowParam !== null
        ? Math.min(Math.max(windowParam, 1), MAX_METRICS_WINDOW_MINUTES)
        : DEFAULT_METRICS_WINDOW_MINUTES
    const priorities = parsePriorities(query.priorities)

    const metrics = await Promise.all(
      paginatedQueueNames.map(async (queueName) => {
        const queue = await getQueue(
          connectionId,
          connectionUrl,
          queueName,
          connectionPrefix,
          redisOptions
        )
        const nativeMetrics = await collectQueueNativeMetrics(queue, {
          queueName,
          start: 0,
          end: Math.max(requestedWindowMinutes - 1, 0),
          priorities,
          includePrometheus,
          requestedWindowMinutes,
        })

        if (detailed) {
          return nativeMetrics
        }

        return {
          queueName: nativeMetrics.queueName,
          window: nativeMetrics.range,
          totals: nativeMetrics.series.totals,
          counts: nativeMetrics.counts,
          queue: nativeMetrics.queue,
          controls: nativeMetrics.controls,
          meta: nativeMetrics.meta,
          warnings: nativeMetrics.warnings,
        }
      })
    )

    return c.json({
      metrics,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: end < total,
    })
  })

export default app
