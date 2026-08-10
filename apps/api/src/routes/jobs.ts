import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { getConnectionRedisOptions } from '../lib/connection-options'
import { buildQueueAddOptions, jobOptionsSchema } from '../lib/job-options'
import { getQueue } from '../lib/redis'

// Default page size for stacktraces and logs
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const RETRY_BATCH_SIZE = 1000
const MAX_RETRY_BATCHES_PER_STATUS = 500
const MAX_RETRY_ERRORS_IN_RESPONSE = 100
const REMOVE_JOB_MAX_ATTEMPTS = 10
const REMOVE_JOB_RETRY_DELAY_MS = 150

const RETRYABLE_JOB_STATUSES = ['failed', 'completed'] as const
type RetryableJobStatus = (typeof RETRYABLE_JOB_STATUSES)[number]
const RETRY_STATUS_OPTIONS = ['all', ...RETRYABLE_JOB_STATUSES] as const
const STACKTRACE_KEEP_FIELD = 'stacktrace'
const CLEAR_RETENTION_SCHEMA = z.object({
  keepMostRecent: z.number().int().min(0).default(0),
})
const UPDATE_JOB_DATA_SCHEMA = z
  .object({
    data: z.unknown(),
  })
  .superRefine((value, ctx) => {
    if (!Object.hasOwn(value, 'data')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'data is required',
        path: ['data'],
      })
    }
  })

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseNonNegativeInt(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

// Substring match against the job's serialized data payload (e.g. a `message`
// field nested anywhere in the payload). Case-insensitive.
function jobDataMatches(data: unknown, search: string): boolean {
  try {
    return JSON.stringify(data ?? {})
      .toLowerCase()
      .includes(search.toLowerCase())
  } catch {
    return false
  }
}

async function removeJobWithRetries(
  queue: Awaited<ReturnType<typeof getQueue>>,
  jobId: string
): Promise<{ success: true } | { success: false; error: string }> {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= REMOVE_JOB_MAX_ATTEMPTS; attempt++) {
    const job = await queue.getJob(jobId)
    if (!job) {
      return { success: true }
    }

    try {
      await job.remove()
    } catch (err) {
      lastError = err
    }

    const afterRemove = await queue.getJob(jobId)
    if (!afterRemove) {
      return { success: true }
    }

    const state = await afterRemove.getState().catch(() => 'unknown')
    const message = String(lastError ?? '').toLowerCase()
    const isRetryableState = state === 'active' || state === 'waiting' || state === 'delayed'
    const isRetryableError =
      message.includes('locked') || message.includes('active') || message.includes('not in')

    if (attempt < REMOVE_JOB_MAX_ATTEMPTS && (isRetryableState || isRetryableError)) {
      await sleep(REMOVE_JOB_RETRY_DELAY_MS)
      continue
    }

    return {
      success: false,
      error: lastError
        ? String(lastError)
        : `Failed to remove job "${jobId}" (state: ${String(state)})`,
    }
  }

  return {
    success: false,
    error: lastError
      ? String(lastError)
      : `Failed to remove job "${jobId}" after ${REMOVE_JOB_MAX_ATTEMPTS} attempts`,
  }
}

const app = new Hono()
  // List jobs in a queue
  .get('/:queueName/jobs', async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const queueName = c.req.param('queueName')
    const status = c.req.query('status')
    const name = c.req.query('name')
    const jobId = c.req.query('jobId')?.trim()
    const dataSearch = c.req.query('data')?.trim()
    const pageStr = c.req.query('page')
    const cursorStr = c.req.query('cursor')
    const pageSizeStr = c.req.query('pageSize')

    const pageSize = Math.min(pageSizeStr ? parseInt(pageSizeStr, 10) : 20, 100)
    const cursor = cursorStr ? parseInt(cursorStr, 10) : null
    const page = pageStr ? parseInt(pageStr, 10) : 1
    const start =
      Number.isInteger(cursor) && cursor !== null ? Math.max(0, cursor) : (page - 1) * pageSize
    const end = start + pageSize - 1

    const queue = await getQueue(
      connectionId,
      connectionUrl,
      queueName,
      connectionPrefix,
      redisOptions
    )

    if (jobId) {
      const job = await queue.getJob(jobId)

      if (job) {
        const state = await job.getState()

        if (
          (status && state !== status) ||
          (name && !job.name.toLowerCase().includes(name.toLowerCase())) ||
          (dataSearch && !jobDataMatches(job.data, dataSearch))
        ) {
          return c.json({
            jobs: [],
            total: 0,
            page: 1,
            pageSize,
            totalPages: 0,
          })
        }

        return c.json({
          jobs: [
            {
              id: job.id ?? '',
              name: job.name,
              status: state,
              data: job.data as Record<string, unknown>,
              progress: job.progress,
              attemptsMade: job.attemptsMade,
              maxAttempts: job.opts.attempts ?? 1,
              failedReason: job.failedReason,
              processedOn: job.processedOn,
              finishedOn: job.finishedOn,
              timestamp: job.timestamp,
              delay: job.delay ?? 0,
              priority: job.opts.priority ?? 0,
            },
          ],
          total: 1,
          page: 1,
          cursor: '0',
          nextCursor: null,
          hasMore: false,
          pageSize,
          totalPages: 1,
        })
      }
    }

    type JobState =
      | 'waiting'
      | 'active'
      | 'completed'
      | 'failed'
      | 'delayed'
      | 'paused'
      | 'prioritized'
    let states: Array<JobState> = [
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused',
      'prioritized',
    ]
    if (status) {
      states = [status as JobState]
    }

    const needsClientFilter = !!(name || jobId || dataSearch)

    if (needsClientFilter) {
      // Fetch each state separately so we know the status without per-job getState() calls,
      // then return all filtered results in one response for client-side pagination.
      const jobsWithState: Array<{
        job: NonNullable<Awaited<ReturnType<typeof queue.getJobs>>[number]>
        state: JobState
      }> = []
      for (const state of states) {
        const stateJobs = await queue.getJobs([state])
        for (const job of stateJobs) {
          if (job != null) {
            jobsWithState.push({ job, state })
          }
        }
      }

      const filtered = jobsWithState
        .filter(({ job }) => (name ? job.name.toLowerCase().includes(name.toLowerCase()) : true))
        .filter(({ job }) =>
          jobId
            ? String(job.id ?? '')
                .toLowerCase()
                .includes(jobId.toLowerCase())
            : true
        )
        .filter(({ job }) => (dataSearch ? jobDataMatches(job.data, dataSearch) : true))

      const mappedJobs = filtered.map(({ job, state }) => ({
        id: job.id ?? '',
        name: job.name,
        status: state,
        data: job.data as Record<string, unknown>,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts ?? 1,
        failedReason: job.failedReason,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        timestamp: job.timestamp,
        delay: job.delay ?? 0,
        priority: job.opts.priority ?? 0,
      }))

      return c.json({
        jobs: mappedJobs,
        total: filtered.length,
        page: 1,
        cursor: '0',
        nextCursor: null,
        hasMore: false,
        pageSize: filtered.length,
        totalPages: 1,
      })
    }

    // Without filters we rely on BullMQ's native range for efficient server-side pagination.
    const jobs = await queue.getJobs(states, start, end)

    const mappedJobs = await Promise.all(
      jobs
        .filter((job): job is NonNullable<typeof job> => job != null)
        .map(async (job) => {
          const state = await job.getState()
          return {
            id: job.id ?? '',
            name: job.name,
            status: state,
            data: job.data as Record<string, unknown>,
            progress: job.progress,
            attemptsMade: job.attemptsMade,
            maxAttempts: job.opts.attempts ?? 1,
            failedReason: job.failedReason,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
            timestamp: job.timestamp,
            delay: job.delay ?? 0,
            priority: job.opts.priority ?? 0,
          }
        })
    )

    const total = await queue.getJobCountByTypes(...states)
    const nextStart = start + pageSize
    const hasMore = nextStart < total

    return c.json({
      jobs: mappedJobs,
      total,
      page,
      cursor: String(start),
      nextCursor: hasMore ? String(nextStart) : null,
      hasMore,
      pageSize,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    })
  })
  // Get job detail
  .get('/:queueName/jobs/:jobId', async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const queueName = c.req.param('queueName')
    const jobId = c.req.param('jobId')

    const queue = await getQueue(
      connectionId,
      connectionUrl,
      queueName,
      connectionPrefix,
      redisOptions
    )
    const job = await queue.getJob(jobId)

    if (!job) {
      return c.json({ error: 'Job not found' }, 404)
    }

    const state = await job.getState()

    // Get the stacktrace array length but DON'T include the full array
    // This prevents loading tens of thousands of stacktraces into memory
    const stacktraceCount = job.stacktrace?.length ?? 0

    return c.json({
      id: job.id ?? '',
      name: job.name,
      status: state,
      data: job.data as Record<string, unknown>,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      timestamp: job.timestamp,
      delay: job.delay ?? 0,
      priority: job.opts.priority ?? 0,
      opts: job.opts as Record<string, unknown>,
      returnvalue: job.returnvalue,
      stacktraceCount,
      logsCount: 0, // Will be fetched separately via paginated endpoint
      parentKey: job.parentKey,
    })
  })
  // Get paginated stacktraces for a job
  // NOTE: BullMQ stores stacktraces as a JSON array in the job hash.
  // There's no Redis-level pagination for this - getJob() loads the entire job.
  // The pagination here reduces network transfer and client-side processing.
  .get('/:queueName/jobs/:jobId/stacktraces', async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const queueName = c.req.param('queueName')
    const jobId = c.req.param('jobId')
    const pageStr = c.req.query('page')
    const pageSizeStr = c.req.query('pageSize')

    const page = pageStr ? parseInt(pageStr, 10) : 1
    const pageSize = Math.min(
      pageSizeStr ? parseInt(pageSizeStr, 10) : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    )

    const queue = await getQueue(
      connectionId,
      connectionUrl,
      queueName,
      connectionPrefix,
      redisOptions
    )
    const job = await queue.getJob(jobId)

    if (!job) {
      return c.json({ error: 'Job not found' }, 404)
    }

    const allStacktraces = job.stacktrace ?? []
    const total = allStacktraces.length

    // Reverse the array so most recent is first (index 0)
    // Then paginate from that reversed array
    const reversed = [...allStacktraces].reverse()
    const start = (page - 1) * pageSize
    const end = start + pageSize
    const stacktraces = reversed.slice(start, end)

    // Map with original attempt numbers (reversed order means last attempts first)
    const items = stacktraces.map((stacktrace, index) => ({
      attemptNumber: total - (start + index), // Calculate original attempt number
      stacktrace,
      isLatest: start + index === 0, // First item in reversed array is latest
    }))

    return c.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: end < total,
    })
  })
  // Get job logs (paginated)
  .get('/:queueName/jobs/:jobId/logs', async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const queueName = c.req.param('queueName')
    const jobId = c.req.param('jobId')
    const pageStr = c.req.query('page')
    const pageSizeStr = c.req.query('pageSize')
    const startStr = c.req.query('start')

    const queue = await getQueue(
      connectionId,
      connectionUrl,
      queueName,
      connectionPrefix,
      redisOptions
    )

    // Offset-tail mode: return up to MAX_PAGE_SIZE lines from an absolute
    // index, used by the retry dialog to stream lines appended after a retry.
    if (startStr !== undefined) {
      const startOffset = parseNonNegativeInt(startStr)
      if (startOffset === null) {
        return c.json({ error: 'start must be a non-negative integer' }, 400)
      }

      const logs = await queue.getJobLogs(jobId, startOffset, startOffset + MAX_PAGE_SIZE - 1)
      const count = logs.count ?? 0

      return c.json({
        logs: logs.logs ?? [],
        count,
        start: startOffset,
        hasMore: startOffset + (logs.logs?.length ?? 0) < count,
      })
    }

    const page = parsePositiveInt(pageStr, 1)
    const pageSize = Math.min(parsePositiveInt(pageSizeStr, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1

    // BullMQ getJobLogs accepts start and end parameters for pagination
    const logs = await queue.getJobLogs(jobId, start, end)

    return c.json({
      logs: logs.logs ?? [],
      count: logs.count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((logs.count ?? 0) / pageSize),
      hasMore: end < (logs.count ?? 0) - 1,
    })
  })
  // Clear all logs for a job
  .delete('/:queueName/jobs/:jobId/logs', async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const queueName = c.req.param('queueName')
    const jobId = c.req.param('jobId')
    const keepMostRecent = 0

    const queue = await getQueue(
      connectionId,
      connectionUrl,
      queueName,
      connectionPrefix,
      redisOptions
    )
    const job = await queue.getJob(jobId)

    if (!job) {
      return c.json({ error: 'Job not found' }, 404)
    }

    // Capture count before deletion for a reliable response payload.
    const existingLogs = await queue.getJobLogs(jobId, 0, 0)
    const countBefore = existingLogs.count ?? 0

    let removed = 0

    const queueWithLogRemoval = queue as typeof queue & {
      removeJobLogs?: (jobId: string, keepLogs?: number) => Promise<number | undefined>
      opts?: { prefix?: string }
      client?: Promise<{
        del: (key: string) => Promise<number>
        llen: (key: string) => Promise<number>
        ltrim: (key: string, start: number, stop: number) => Promise<'OK' | string>
      }>
    }

    if (typeof queueWithLogRemoval.removeJobLogs === 'function') {
      const removedCount = await queueWithLogRemoval.removeJobLogs(jobId, keepMostRecent)
      removed = typeof removedCount === 'number' ? removedCount : countBefore
    } else {
      const jobWithClearLogs = job as typeof job & {
        clearLogs?: (keepLogs?: number) => Promise<number | undefined>
      }

      if (typeof jobWithClearLogs.clearLogs === 'function') {
        const removedCount = await jobWithClearLogs.clearLogs(keepMostRecent)
        removed = typeof removedCount === 'number' ? removedCount : countBefore
      } else if (queueWithLogRemoval.client) {
        // Fallback for BullMQ variants without log helpers: operate directly on log list key.
        const prefix = queueWithLogRemoval.opts?.prefix ?? 'bull'
        const redis = await queueWithLogRemoval.client
        const logKey = `${prefix}:${queueName}:${jobId}:logs`

        if (keepMostRecent <= 0) {
          const deletedKeys = await redis.del(logKey)
          removed = deletedKeys > 0 ? countBefore : 0
        } else {
          const listLength = await redis.llen(logKey)
          const keep = Math.min(keepMostRecent, listLength)
          if (keep <= 0) {
            removed = 0
          } else {
            // Keep the latest N log entries by trimming from the tail.
            await redis.ltrim(logKey, -keep, -1)
            removed = listLength - keep
          }
        }
      }
    }

    return c.json({
      success: true,
      removed: removed > 0 ? removed : countBefore,
    })
  })
  // Clear logs for a job while optionally keeping the most recent entries.
  .post(
    '/:queueName/jobs/:jobId/logs/clear',
    zValidator('json', CLEAR_RETENTION_SCHEMA),
    async (c) => {
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const connectionPrefix = c.get('connectionPrefix')
      const redisOptions = getConnectionRedisOptions(c)
      const queueName = c.req.param('queueName')
      const jobId = c.req.param('jobId')
      const { keepMostRecent } = c.req.valid('json')

      const queue = await getQueue(
        connectionId,
        connectionUrl,
        queueName,
        connectionPrefix,
        redisOptions
      )
      const job = await queue.getJob(jobId)

      if (!job) {
        return c.json({ error: 'Job not found' }, 404)
      }

      const existingLogs = await queue.getJobLogs(jobId, 0, 0)
      const countBefore = existingLogs.count ?? 0
      let removed = 0

      const queueWithLogRemoval = queue as typeof queue & {
        removeJobLogs?: (jobId: string, keepLogs?: number) => Promise<number | undefined>
        opts?: { prefix?: string }
        client?: Promise<{
          del: (key: string) => Promise<number>
          llen: (key: string) => Promise<number>
          ltrim: (key: string, start: number, stop: number) => Promise<'OK' | string>
        }>
      }

      if (typeof queueWithLogRemoval.removeJobLogs === 'function') {
        const removedCount = await queueWithLogRemoval.removeJobLogs(jobId, keepMostRecent)
        removed = typeof removedCount === 'number' ? removedCount : countBefore
      } else {
        const jobWithClearLogs = job as typeof job & {
          clearLogs?: (keepLogs?: number) => Promise<number | undefined>
        }

        if (typeof jobWithClearLogs.clearLogs === 'function') {
          const removedCount = await jobWithClearLogs.clearLogs(keepMostRecent)
          removed = typeof removedCount === 'number' ? removedCount : countBefore
        } else if (queueWithLogRemoval.client) {
          const prefix = queueWithLogRemoval.opts?.prefix ?? 'bull'
          const redis = await queueWithLogRemoval.client
          const logKey = `${prefix}:${queueName}:${jobId}:logs`

          if (keepMostRecent <= 0) {
            const deletedKeys = await redis.del(logKey)
            removed = deletedKeys > 0 ? countBefore : 0
          } else {
            const listLength = await redis.llen(logKey)
            const keep = Math.min(keepMostRecent, listLength)
            if (keep <= 0) {
              removed = 0
            } else {
              await redis.ltrim(logKey, -keep, -1)
              removed = listLength - keep
            }
          }
        }
      }

      return c.json({
        success: true,
        removed: removed > 0 ? removed : Math.max(countBefore - keepMostRecent, 0),
      })
    }
  )
  // Clear stacktraces for a job while optionally keeping the most recent entries.
  .post(
    '/:queueName/jobs/:jobId/stacktraces/clear',
    zValidator('json', CLEAR_RETENTION_SCHEMA),
    async (c) => {
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const connectionPrefix = c.get('connectionPrefix')
      const redisOptions = getConnectionRedisOptions(c)
      const queueName = c.req.param('queueName')
      const jobId = c.req.param('jobId')
      const { keepMostRecent } = c.req.valid('json')

      const queue = await getQueue(
        connectionId,
        connectionUrl,
        queueName,
        connectionPrefix,
        redisOptions
      )
      const job = await queue.getJob(jobId)

      if (!job) {
        return c.json({ error: 'Job not found' }, 404)
      }

      const allStacktraces = job.stacktrace ?? []
      const countBefore = allStacktraces.length
      const keep = Math.min(keepMostRecent, countBefore)
      const nextStacktraces = keep > 0 ? allStacktraces.slice(-keep) : []

      const queueWithClient = queue as typeof queue & {
        client?: Promise<{
          hset: (key: string, field: string, value: string) => Promise<number>
        }>
      }

      if (!queueWithClient.client) {
        return c.json({ error: 'Unable to access Redis client for stacktrace cleanup.' }, 500)
      }

      const redis = await queueWithClient.client
      const jobKey = queue.toKey(jobId)

      await redis.hset(jobKey, STACKTRACE_KEEP_FIELD, JSON.stringify(nextStacktraces))

      return c.json({
        success: true,
        removed: countBefore - keep,
        kept: keep,
      })
    }
  )
  // Update a job's data payload
  .post('/:queueName/jobs/:jobId/data', zValidator('json', UPDATE_JOB_DATA_SCHEMA), async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const queueName = c.req.param('queueName')
    const jobId = c.req.param('jobId')
    const { data } = c.req.valid('json')

    const queue = await getQueue(
      connectionId,
      connectionUrl,
      queueName,
      connectionPrefix,
      redisOptions
    )
    const job = await queue.getJob(jobId)

    if (!job) {
      return c.json({ error: 'Job not found' }, 404)
    }

    const state = await job.getState()
    if (state === 'active') {
      return c.json(
        {
          error:
            'Cannot update job data while the job is active. A worker is currently processing this job with the old payload, so the update would not take effect. Wait for the attempt to finish.',
          state,
        },
        409
      )
    }

    await job.updateData(data)
    return c.json({ success: true, state })
  })
  // Retry jobs
  .post(
    '/:queueName/jobs/retry',
    zValidator(
      'json',
      z
        .object({
          jobIds: z.array(z.string()).max(100, 'Maximum 100 jobs per request').optional(),
          statuses: z.array(z.enum(RETRY_STATUS_OPTIONS)).min(1).optional(),
          jobData: z.unknown().optional(),
        })
        .superRefine((value, ctx) => {
          const hasJobIds = (value.jobIds?.length ?? 0) > 0
          const hasStatuses = (value.statuses?.length ?? 0) > 0
          const hasJobData = Object.hasOwn(value, 'jobData')

          if (!hasJobIds && !hasStatuses) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Provide either jobIds or statuses',
              path: ['jobIds'],
            })
          }

          if (hasJobIds && hasStatuses) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Provide either jobIds or statuses, not both',
              path: ['statuses'],
            })
          }

          if (hasJobData && (hasStatuses || (value.jobIds?.length ?? 0) !== 1)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'jobData can only be supplied when retrying a single job',
              path: ['jobData'],
            })
          }
        })
    ),
    async (c) => {
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const connectionPrefix = c.get('connectionPrefix')
      const redisOptions = getConnectionRedisOptions(c)
      const queueName = c.req.param('queueName')
      const { jobIds, statuses, jobData } = c.req.valid('json')

      const queue = await getQueue(
        connectionId,
        connectionUrl,
        queueName,
        connectionPrefix,
        redisOptions
      )
      let success = 0
      let failed = 0
      const errors: Array<{ jobId: string; error: string }> = []

      if (jobIds && jobIds.length > 0) {
        for (const jobId of jobIds) {
          try {
            const job = await queue.getJob(jobId)
            if (job && (await job.getState()) === 'failed') {
              if (jobData !== undefined) {
                await job.updateData(jobData)
              }
              await job.retry()
              success++
            }
          } catch (err) {
            failed++
            if (errors.length < MAX_RETRY_ERRORS_IN_RESPONSE) {
              errors.push({ jobId, error: String(err) })
            }
          }
        }

        return c.json({ success, failed, errors })
      }

      const requestedStatuses = Array.from(new Set(statuses ?? []))
      const statusesToRetry: RetryableJobStatus[] = requestedStatuses.includes('all')
        ? [...RETRYABLE_JOB_STATUSES]
        : requestedStatuses.filter((status): status is RetryableJobStatus => status !== 'all')

      if (statusesToRetry.length === 0) {
        return c.json({ error: 'At least one status must be selected for retry' }, 400)
      }

      const retriedByStatus = Object.fromEntries(
        statusesToRetry.map((status) => [status, 0])
      ) as Record<RetryableJobStatus, number>

      for (const status of statusesToRetry) {
        let reachedSafetyLimit = true
        const attemptedJobIds = new Set<string>()

        for (let batch = 0; batch < MAX_RETRY_BATCHES_PER_STATUS; batch++) {
          const jobs = (await queue.getJobs([status], 0, RETRY_BATCH_SIZE - 1)).filter(
            (job): job is NonNullable<typeof job> => job != null
          )

          if (jobs.length === 0) {
            reachedSafetyLimit = false
            break
          }

          const pendingJobs = jobs.filter((job) => {
            const dedupeId = String(job.id ?? '')
            if (attemptedJobIds.has(dedupeId)) {
              return false
            }
            attemptedJobIds.add(dedupeId)
            return true
          })

          if (pendingJobs.length === 0) {
            reachedSafetyLimit = false
            break
          }

          for (const job of pendingJobs) {
            const jobId = String(job.id ?? '')

            try {
              if (status === 'completed') {
                await job.retry('completed')
              } else {
                await job.retry()
              }

              success++
              retriedByStatus[status] += 1
            } catch (err) {
              failed++
              if (errors.length < MAX_RETRY_ERRORS_IN_RESPONSE) {
                errors.push({ jobId, error: String(err) })
              }
            }
          }
        }

        if (reachedSafetyLimit) {
          return c.json(
            {
              error: `Retry safety limit reached for status "${status}". Please retry the operation.`,
              status,
              canRetry: true,
              success,
              failed,
              errors,
              retriedByStatus,
            },
            409
          )
        }
      }

      return c.json({
        success,
        failed,
        errors,
        statusesRetried: statusesToRetry,
        retriedByStatus,
      })
    }
  )
  // Remove jobs
  .post(
    '/:queueName/jobs/remove',
    zValidator(
      'json',
      z.object({
        jobIds: z.array(z.string()).max(100, 'Maximum 100 jobs per request'),
        // When true, also removes the job scheduler for repeatable jobs
        removeScheduler: z.boolean().optional(),
      })
    ),
    async (c) => {
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const connectionPrefix = c.get('connectionPrefix')
      const redisOptions = getConnectionRedisOptions(c)
      const queueName = c.req.param('queueName')
      const { jobIds, removeScheduler } = c.req.valid('json')

      const queue = await getQueue(
        connectionId,
        connectionUrl,
        queueName,
        connectionPrefix,
        redisOptions
      )
      let success = 0
      let schedulersRemoved = 0
      const errors: Array<{ jobId: string; error: string }> = []
      const warnings: Array<{ jobId: string; message: string }> = []

      for (const jobId of jobIds) {
        try {
          // Check if this is a repeatable/scheduled job (ID starts with 'repeat:')
          const isRepeatableJob = jobId.startsWith('repeat:')

          if (isRepeatableJob) {
            // Extract the scheduler key from the job ID
            // Job ID format: repeat:schedulerKey:timestamp
            // Scheduler key is everything between 'repeat:' and the last ':timestamp'
            const parts = jobId.split(':')
            // Remove 'repeat' prefix and the timestamp at the end
            const schedulerKey = parts.slice(1, -1).join(':')

            if (removeScheduler && schedulerKey) {
              // In BullMQ v5, jobs belonging to a scheduler cannot be removed directly.
              // We must remove the scheduler first, which will clean up its jobs.
              try {
                await queue.removeJobScheduler(schedulerKey)
                schedulersRemoved++
                success++
              } catch (_schedulerErrrr) {
                // Scheduler might already be removed - try to remove the orphaned job directly
                const job = await queue.getJob(jobId)
                if (job) {
                  try {
                    await job.remove()
                    success++
                  } catch (jobErr) {
                    errors.push({
                      jobId,
                      error: `Failed to remove job: ${String(jobErr)}`,
                    })
                  }
                } else {
                  // Job doesn't exist, count as success
                  success++
                }
              }
            } else {
              // Try to remove the job directly - this will work if the scheduler was already removed
              const result = await removeJobWithRetries(queue, jobId)
              if (result.success) {
                // Job doesn't exist, count as success
                success++
              } else {
                errors.push({
                  jobId,
                  error:
                    'This job belongs to an active scheduler and cannot be removed directly. Use "Remove Job & Stop Scheduler" to remove both.',
                })
              }
            }
          } else {
            // Regular job - can be removed directly
            const result = await removeJobWithRetries(queue, jobId)
            if (result.success) {
              success++
            } else {
              errors.push({ jobId, error: result.error })
            }
          }
        } catch (err) {
          errors.push({ jobId, error: String(err) })
        }
      }

      const response = {
        success,
        failed: errors.length,
        errors,
        schedulersRemoved: schedulersRemoved > 0 ? schedulersRemoved : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      }

      if (errors.length > 0) {
        return c.json(response, 409)
      }

      return c.json(response)
    }
  )
  // Invoke jobs (promote delayed jobs to run immediately, optionally updating job data)
  .post(
    '/:queueName/jobs/invoke',
    zValidator(
      'json',
      z.object({
        jobIds: z.array(z.string()).max(100, 'Maximum 100 jobs per request'),
        jobData: z.record(z.unknown()).optional(),
      })
    ),
    async (c) => {
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const connectionPrefix = c.get('connectionPrefix')
      const redisOptions = getConnectionRedisOptions(c)
      const queueName = c.req.param('queueName')
      const { jobIds, jobData } = c.req.valid('json')

      const queue = await getQueue(
        connectionId,
        connectionUrl,
        queueName,
        connectionPrefix,
        redisOptions
      )
      let success = 0
      const errors: Array<{ jobId: string; error: string }> = []

      for (const jobId of jobIds) {
        try {
          const job = await queue.getJob(jobId)
          if (job && (await job.getState()) === 'delayed') {
            // Update job data if provided
            if (jobData !== undefined) {
              await job.updateData(jobData)
            }
            await job.promote()
            success++
          }
        } catch (err) {
          errors.push({ jobId, error: String(err) })
        }
      }

      return c.json({ success, failed: errors.length, errors })
    }
  )
  // Add job
  .post(
    '/:queueName/jobs',
    zValidator(
      'json',
      z
        .object({
          name: z.string(),
          data: z.unknown(),
        })
        .merge(jobOptionsSchema)
    ),
    async (c) => {
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const connectionPrefix = c.get('connectionPrefix')
      const redisOptions = getConnectionRedisOptions(c)
      const queueName = c.req.param('queueName')
      const { name, data, ...options } = c.req.valid('json')

      const queue = await getQueue(
        connectionId,
        connectionUrl,
        queueName,
        connectionPrefix,
        redisOptions
      )
      const job = await queue.add(name, data, buildQueueAddOptions(options))

      return c.json({
        jobId: job.id,
        queueName,
        jobName: name,
      })
    }
  )

export default app
