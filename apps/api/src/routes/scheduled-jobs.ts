import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { getConnectionRedisOptions } from '../lib/connection-options'
import { discoverQueues, getQueue } from '../lib/redis'
import {
  buildScheduledJobCreateInput,
  buildScheduledJobUpdateInput,
  createScheduledJobSchema,
  mapScheduledJob,
  type ScheduledJobSummary,
  updateScheduledJobSchema,
} from '../lib/scheduled-jobs'

// Default and max page sizes for pagination
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

// Helper to get recent failed job stats for scheduled jobs in a queue
async function getScheduledJobFailureStats(
  queue: Awaited<ReturnType<typeof getQueue>>,
  schedulerJobNames: string[]
): Promise<Map<string, { count: number; lastFailedAt?: number }>> {
  const stats = new Map<string, { count: number; lastFailedAt?: number }>()

  // Initialize stats for all job names
  for (const name of schedulerJobNames) {
    stats.set(name, { count: 0, lastFailedAt: undefined })
  }

  if (schedulerJobNames.length === 0) {
    return stats
  }

  // Get recent failed jobs (last 100 to be efficient)
  const failedJobs = await queue.getJobs(['failed'], 0, 100)

  for (const job of failedJobs) {
    // Check if this job was from a scheduled job (job name matches)
    if (schedulerJobNames.includes(job.name)) {
      const current = stats.get(job.name) ?? { count: 0, lastFailedAt: undefined }
      current.count++

      // Track the most recent failure time
      const failedAt = job.finishedOn ?? job.timestamp
      if (!current.lastFailedAt || failedAt > current.lastFailedAt) {
        current.lastFailedAt = failedAt
      }

      stats.set(job.name, current)
    }
  }

  return stats
}

async function loadSchedulerStats(
  queue: Awaited<ReturnType<typeof getQueue>>,
  schedulerName?: string
): Promise<{ count: number; lastFailedAt?: number } | undefined> {
  if (!schedulerName) {
    return undefined
  }

  const failureStats = await getScheduledJobFailureStats(queue, [schedulerName])
  return failureStats.get(schedulerName)
}

const app = new Hono()
  // List all scheduled jobs across all queues (paginated by queue)
  .get('/', async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const connectionMode = c.get('connectionMode')
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
      redisOptions,
      connectionMode
    )
    const totalQueues = allQueueNames.length

    // Paginate at the queue level to prevent loading scheduled jobs from thousands of queues
    const start = (page - 1) * pageSize
    const end = start + pageSize
    const paginatedQueueNames = allQueueNames.slice(start, end)

    const allScheduledJobs: ScheduledJobSummary[] = []

    for (const queueName of paginatedQueueNames) {
      const queue = await getQueue(
        connectionId,
        connectionUrl,
        queueName,
        connectionPrefix,
        redisOptions,
        connectionMode
      )
      const schedulers = await queue.getJobSchedulers()

      // Get unique job names from schedulers
      const schedulerJobNames = [...new Set(schedulers.map((s) => s.name ?? '').filter(Boolean))]

      // Get failure stats for this queue's scheduled jobs
      const failureStats = await getScheduledJobFailureStats(queue, schedulerJobNames)

      for (const scheduler of schedulers) {
        const jobName = scheduler.name ?? ''
        const stats = failureStats.get(jobName)
        allScheduledJobs.push(mapScheduledJob(queueName, scheduler, stats))
      }
    }

    return c.json({
      scheduledJobs: allScheduledJobs,
      total: allScheduledJobs.length,
      page,
      pageSize,
      totalQueuesScanned: paginatedQueueNames.length,
      totalQueues,
      hasMore: end < totalQueues,
    })
  })
  // List scheduled jobs for a specific queue
  .get('/queue/:queueName', async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const connectionMode = c.get('connectionMode')
    const queueName = c.req.param('queueName')
    const queue = await getQueue(
      connectionId,
      connectionUrl,
      queueName,
      connectionPrefix,
      redisOptions,
      connectionMode
    )
    const schedulers = await queue.getJobSchedulers()

    // Get unique job names from schedulers
    const schedulerJobNames = [...new Set(schedulers.map((s) => s.name ?? '').filter(Boolean))]

    // Get failure stats for this queue's scheduled jobs
    const failureStats = await getScheduledJobFailureStats(queue, schedulerJobNames)

    const scheduledJobs = schedulers.map((scheduler) => {
      const jobName = scheduler.name ?? ''
      const stats = failureStats.get(jobName)
      return mapScheduledJob(queueName, scheduler, stats)
    })

    return c.json({ scheduledJobs, total: scheduledJobs.length })
  })
  // Load one scheduled job for a specific queue
  .get('/queue/:queueName/:schedulerId', async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const queueName = c.req.param('queueName')
    const schedulerId = c.req.param('schedulerId')

    const queue = await getQueue(
      connectionId,
      connectionUrl,
      queueName,
      connectionPrefix,
      redisOptions
    )
    const scheduler = (await queue.getJobSchedulers()).find((item) => item.key === schedulerId)

    if (!scheduler) {
      return c.json({ error: `Scheduler "${schedulerId}" was not found.` }, 404)
    }

    const stats = await loadSchedulerStats(queue, scheduler.name)

    return c.json({
      scheduler: mapScheduledJob(queueName, scheduler, stats),
    })
  })
  // Create scheduled job for a specific queue
  .post('/queue/:queueName', zValidator('json', createScheduledJobSchema), async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const queueName = c.req.param('queueName')
    const payload = c.req.valid('json')

    const queue = await getQueue(
      connectionId,
      connectionUrl,
      queueName,
      connectionPrefix,
      redisOptions
    )
    const existingSchedulers = await queue.getJobSchedulers()
    const existingScheduler = existingSchedulers.find(
      (scheduler) => scheduler.key === payload.schedulerId
    )

    if (existingScheduler) {
      return c.json(
        {
          error: `Scheduler ID "${payload.schedulerId}" already exists in queue "${queueName}". Choose a different ID.`,
        },
        409
      )
    }

    const scheduledJob = buildScheduledJobCreateInput(payload)

    await queue.upsertJobScheduler(scheduledJob.schedulerId, scheduledJob.repeatOptions, {
      name: scheduledJob.jobName,
      data: scheduledJob.jobData,
      opts: scheduledJob.templateOptions,
    })

    const createdScheduler = (await queue.getJobSchedulers()).find(
      (scheduler) => scheduler.key === scheduledJob.schedulerId
    )

    if (!createdScheduler) {
      return c.json(
        {
          error: `Scheduler "${scheduledJob.schedulerId}" was created but could not be loaded back from BullMQ.`,
        },
        500
      )
    }

    return c.json(
      {
        success: true,
        scheduler: mapScheduledJob(queueName, createdScheduler),
      },
      201
    )
  })
  // Update scheduled job for a specific queue
  .put(
    '/queue/:queueName/:schedulerId',
    zValidator('json', updateScheduledJobSchema),
    async (c) => {
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const connectionPrefix = c.get('connectionPrefix')
      const redisOptions = getConnectionRedisOptions(c)
      const queueName = c.req.param('queueName')
      const schedulerId = c.req.param('schedulerId')
      const payload = c.req.valid('json')

      const queue = await getQueue(
        connectionId,
        connectionUrl,
        queueName,
        connectionPrefix,
        redisOptions
      )
      const existingScheduler = (await queue.getJobSchedulers()).find(
        (scheduler) => scheduler.key === schedulerId
      )

      if (!existingScheduler) {
        return c.json({ error: `Scheduler "${schedulerId}" was not found.` }, 404)
      }

      const scheduledJob = buildScheduledJobUpdateInput(schedulerId, payload)

      await queue.upsertJobScheduler(scheduledJob.schedulerId, scheduledJob.repeatOptions, {
        name: scheduledJob.jobName,
        data: scheduledJob.jobData,
        opts: scheduledJob.templateOptions,
      })

      const updatedScheduler = (await queue.getJobSchedulers()).find(
        (scheduler) => scheduler.key === scheduledJob.schedulerId
      )

      if (!updatedScheduler) {
        return c.json(
          {
            error: `Scheduler "${scheduledJob.schedulerId}" was updated but could not be loaded back from BullMQ.`,
          },
          500
        )
      }

      const stats = await loadSchedulerStats(queue, updatedScheduler.name)

      return c.json({
        success: true,
        scheduler: mapScheduledJob(queueName, updatedScheduler, stats),
      })
    }
  )
  // Remove scheduled job
  .delete('/queue/:queueName/:schedulerId', async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const connectionMode = c.get('connectionMode')
    const queueName = c.req.param('queueName')
    const schedulerId = c.req.param('schedulerId')

    const queue = await getQueue(
      connectionId,
      connectionUrl,
      queueName,
      connectionPrefix,
      redisOptions,
      connectionMode
    )
    await queue.removeJobScheduler(schedulerId)
    return c.json({ success: true })
  })

export default app
