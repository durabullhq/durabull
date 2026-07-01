import { redisDiscoveredQueueRepository } from '@durabull/dal'
import { env } from '@durabull/env'
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
import { deleteQueueWithDiscoveryCleanup } from '../lib/delete-queue'
import {
  getQueueDiscoveryStatus,
  startQueueDiscovery,
  waitForQueueDiscovery,
} from '../lib/queue-discovery'
import { debugGetBullKeys, getQueue, safeGetWorkers } from '../lib/redis'

// Default and max page sizes for pagination
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const CLEAN_BATCH_SIZE = 1000
const MAX_PURGE_BATCHES_PER_STATUS = 500
const MAX_REMOVED_JOB_IDS_IN_RESPONSE = 100
const MAX_PURGE_KEEP_MOST_RECENT = 1_000_000

const PURGEABLE_QUEUE_STATUSES = [
  'waiting',
  'active',
  'delayed',
  'completed',
  'failed',
  'paused',
  'prioritized',
] as const
type PurgeableQueueStatus = (typeof PURGEABLE_QUEUE_STATUSES)[number]

const PURGE_STATUS_OPTIONS = ['all', ...PURGEABLE_QUEUE_STATUSES] as const
const QUEUE_SORT_FIELDS = [
  'name',
  'status',
  'waiting',
  'prioritized',
  'active',
  'delayed',
  'completed',
  'failed',
] as const
type QueueSortField = (typeof QUEUE_SORT_FIELDS)[number]

const listQueuesQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.enum(QUEUE_SORT_FIELDS).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  status: z.enum(['active', 'paused']).optional(),
})

interface QueueListEntry {
  name: string
  status: 'active' | 'paused'
  jobCounts: {
    waiting: number
    active: number
    delayed: number
    completed: number
    failed: number
    paused: number
    prioritized: number
  }
  isPaused: boolean
  discoveryState: 'pending' | 'confirmed'
}

function compareQueueEntries(a: QueueListEntry, b: QueueListEntry, sortBy: QueueSortField): number {
  switch (sortBy) {
    case 'name':
      return a.name.localeCompare(b.name)
    case 'status':
      return a.status.localeCompare(b.status)
    default:
      return a.jobCounts[sortBy] - b.jobCounts[sortBy]
  }
}

const queueMetricsQuerySchema = z.object({
  windowMinutes: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  includePrometheus: z.string().optional(),
  priorities: z.string().optional(),
})

const cleanStatusMap: Record<
  PurgeableQueueStatus,
  'completed' | 'failed' | 'delayed' | 'paused' | 'wait' | 'active' | 'prioritized'
> = {
  completed: 'completed',
  failed: 'failed',
  delayed: 'delayed',
  paused: 'paused',
  waiting: 'wait',
  active: 'active',
  prioritized: 'prioritized',
}

function parseInteger(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseBoolean(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

function parsePriorities(value: string | undefined): number[] {
  if (!value) {
    return [...DEFAULT_PRIORITY_BUCKETS]
  }

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

interface PurgeRecencyCandidate {
  id: string
  recency: number
}

function comparePurgeRecency(a: PurgeRecencyCandidate, b: PurgeRecencyCandidate): number {
  if (a.recency !== b.recency) {
    return a.recency - b.recency
  }
  return a.id.localeCompare(b.id)
}

function siftUpPurgeHeap(heap: PurgeRecencyCandidate[], index: number): void {
  let current = index

  while (current > 0) {
    const parent = Math.floor((current - 1) / 2)
    if (comparePurgeRecency(heap[parent], heap[current]) <= 0) {
      break
    }

    ;[heap[parent], heap[current]] = [heap[current], heap[parent]]
    current = parent
  }
}

function siftDownPurgeHeap(heap: PurgeRecencyCandidate[], index: number): void {
  let current = index

  while (true) {
    const left = current * 2 + 1
    const right = left + 1
    let smallest = current

    if (left < heap.length && comparePurgeRecency(heap[left], heap[smallest]) < 0) {
      smallest = left
    }

    if (right < heap.length && comparePurgeRecency(heap[right], heap[smallest]) < 0) {
      smallest = right
    }

    if (smallest === current) {
      break
    }

    ;[heap[current], heap[smallest]] = [heap[smallest], heap[current]]
    current = smallest
  }
}

function addMostRecentCandidate(
  heap: PurgeRecencyCandidate[],
  candidate: PurgeRecencyCandidate,
  keepMostRecent: number
): void {
  if (keepMostRecent <= 0 || candidate.id.length === 0) {
    return
  }

  if (heap.length < keepMostRecent) {
    heap.push(candidate)
    siftUpPurgeHeap(heap, heap.length - 1)
    return
  }

  if (heap.length === 0) {
    return
  }

  if (comparePurgeRecency(candidate, heap[0]) <= 0) {
    return
  }

  heap[0] = candidate
  siftDownPurgeHeap(heap, 0)
}

function getJobRecency(job: {
  timestamp?: number
  processedOn?: number
  finishedOn?: number
}): number {
  return Math.max(job.timestamp ?? 0, job.processedOn ?? 0, job.finishedOn ?? 0)
}

function appendRemovedJobIdSample(sample: string[], id: string): void {
  if (!id || sample.length >= MAX_REMOVED_JOB_IDS_IN_RESPONSE) {
    return
  }

  sample.push(id)
}

const app = new Hono()
  // Debug: List all bull:* keys to understand Redis structure
  // SECURITY: Only available in development mode
  .get('/debug/keys', async (c) => {
    if (env.NODE_ENV === 'production') {
      return c.json({ error: 'Debug endpoints are disabled in production' }, 403)
    }

    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const connectionMode = c.get('connectionMode')
    const keys = await debugGetBullKeys(
      connectionId,
      connectionUrl,
      connectionPrefix,
      redisOptions,
      connectionMode
    )

    // Group keys by pattern to make it easier to understand
    const metaKeys = keys.filter((k) => k.endsWith(':meta'))
    const queuePrefixes = new Set(
      metaKeys
        .map((k) => {
          const match = k.match(/^bull:(.+):meta$/)
          return match ? match[1] : null
        })
        .filter(Boolean)
    )

    return c.json({
      totalKeys: keys.length,
      metaKeys,
      discoveredQueueNames: Array.from(queuePrefixes),
      sampleKeys: keys.slice(0, 50),
    })
  })
  // Queue discovery status
  .get('/discovery', async (c) => {
    const connectionId = c.get('connectionId')
    const status = await getQueueDiscoveryStatus(connectionId)
    return c.json(status)
  })
  // Trigger queue discovery scan
  .post('/discovery', async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const connectionMode = c.get('connectionMode')

    const scanCountParam = c.req.query('scanCount')
    const waitParam = c.req.query('wait')
    const requestedScanCount = scanCountParam ? Number.parseInt(scanCountParam, 10) : undefined
    const waitForCompletion = waitParam === '1' || waitParam === 'true'

    const status = await startQueueDiscovery(connectionId, connectionUrl, {
      prefix: connectionPrefix,
      allowSelfSignedCerts: redisOptions.allowSelfSignedCerts,
      scanCount:
        requestedScanCount && Number.isFinite(requestedScanCount) ? requestedScanCount : undefined,
      mode: connectionMode,
    })

    if (waitForCompletion) {
      await waitForQueueDiscovery(connectionId)
      return c.json(await getQueueDiscoveryStatus(connectionId))
    }

    return c.json(status, 202)
  })
  // List all queues (paginated, sortable, filterable)
  .get('/', zValidator('query', listQueuesQuerySchema), async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const connectionMode = c.get('connectionMode')
    const query = c.req.valid('query')
    const page = Math.max(1, parseInteger(query.page) ?? 1)
    const pageSize = Math.min(parseInteger(query.pageSize) ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const sortBy: QueueSortField = query.sortBy ?? 'name'
    const sortOrder = query.sortOrder ?? 'asc'
    const search = query.search?.trim().toLowerCase() ?? ''
    const statusFilter = query.status

    let discovery = await getQueueDiscoveryStatus(connectionId)
    let indexedTotal = discovery.indexed.total
    const hasDiscoveryAttempt =
      discovery.running ||
      discovery.startedAt !== null ||
      discovery.completedAt !== null ||
      discovery.lastError !== null

    if (indexedTotal === 0 && !hasDiscoveryAttempt) {
      await startQueueDiscovery(connectionId, connectionUrl, {
        prefix: connectionPrefix,
        allowSelfSignedCerts: redisOptions.allowSelfSignedCerts,
        mode: connectionMode,
      })
      discovery = await getQueueDiscoveryStatus(connectionId)
      indexedTotal = discovery.indexed.total
    }

    // Sorting and filtering must happen BEFORE pagination, so fetch live
    // counts for every indexed queue (also required to aggregate totals).
    const indexedQueues = await redisDiscoveredQueueRepository.listByConnection(connectionId, {
      offset: 0,
      limit: Math.max(indexedTotal, pageSize),
    })

    const totalJobCounts = {
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
      prioritized: 0,
    }

    const allQueues: QueueListEntry[] = await Promise.all(
      indexedQueues.map(async (indexedQueue) => {
        const queue = await getQueue(
          connectionId,
          connectionUrl,
          indexedQueue.name,
          connectionPrefix,
          redisOptions,
          connectionMode
        )
        const [counts, isPaused] = await Promise.all([queue.getJobCounts(), queue.isPaused()])

        return {
          name: indexedQueue.name,
          status: isPaused ? ('paused' as const) : ('active' as const),
          jobCounts: {
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            delayed: counts.delayed ?? 0,
            completed: counts.completed ?? 0,
            failed: counts.failed ?? 0,
            paused: counts.paused ?? 0,
            prioritized: counts.prioritized ?? 0,
          },
          isPaused,
          discoveryState: indexedQueue.state,
        }
      })
    )

    // Connection-wide totals always reflect ALL queues, independent of filters
    for (const queue of allQueues) {
      totalJobCounts.waiting += queue.jobCounts.waiting
      totalJobCounts.active += queue.jobCounts.active
      totalJobCounts.delayed += queue.jobCounts.delayed
      totalJobCounts.completed += queue.jobCounts.completed
      totalJobCounts.failed += queue.jobCounts.failed
      totalJobCounts.prioritized += queue.jobCounts.prioritized
    }

    const filteredQueues = allQueues.filter((queue) => {
      if (search && !queue.name.toLowerCase().includes(search)) return false
      if (statusFilter && queue.status !== statusFilter) return false
      return true
    })

    const direction = sortOrder === 'desc' ? -1 : 1
    filteredQueues.sort((a, b) => {
      const diff = compareQueueEntries(a, b, sortBy)
      if (diff !== 0) return direction * diff
      // Stable, predictable tiebreaker regardless of sort direction
      return a.name.localeCompare(b.name)
    })

    const total = filteredQueues.length
    const start = (page - 1) * pageSize
    const end = start + pageSize

    return c.json({
      queues: filteredQueues.slice(start, end),
      total,
      totalUnfiltered: Math.max(indexedTotal, allQueues.length),
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasMore: end < total,
      totalJobCounts,
      discovery,
    })
  })
  // Get queue detail
  .get('/:queueName', async (c) => {
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
    const [counts, isPaused, workers, schedulers] = await Promise.all([
      queue.getJobCounts(),
      queue.isPaused(),
      safeGetWorkers(queue),
      queue.getJobSchedulers(),
    ])

    const status: 'paused' | 'active' = isPaused ? 'paused' : 'active'

    return c.json({
      name: queueName,
      status,
      jobCounts: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        paused: counts.paused ?? 0,
        prioritized: counts.prioritized ?? 0,
      },
      isPaused,
      scheduledJobsCount: schedulers.length,
      workers: workers.map((w) => ({
        id: w.id ?? '',
        name: w.name ?? '',
        addr: w.addr ?? '',
        age: Number(w.age) || 0,
        idle: Number(w.idle) || 0,
      })),
    })
  })
  // Get queue metrics
  .get('/:queueName/metrics', zValidator('query', queueMetricsQuerySchema), async (c) => {
    const connectionId = c.get('connectionId')
    const connectionUrl = c.get('connectionUrl')
    const connectionPrefix = c.get('connectionPrefix')
    const redisOptions = getConnectionRedisOptions(c)
    const connectionMode = c.get('connectionMode')
    const queueName = c.req.param('queueName')
    const query = c.req.valid('query')

    const startParam = parseInteger(query.start)
    const endParam = parseInteger(query.end)
    const windowParam = parseInteger(query.windowMinutes)

    if (startParam !== null && startParam < 0) {
      return c.json({ error: '`start` must be greater than or equal to 0' }, 400)
    }

    if (endParam !== null && endParam < -1) {
      return c.json({ error: '`end` must be -1 or greater' }, 400)
    }

    const requestedWindowMinutes =
      windowParam !== null
        ? Math.min(Math.max(windowParam, 1), MAX_METRICS_WINDOW_MINUTES)
        : DEFAULT_METRICS_WINDOW_MINUTES

    const start = startParam ?? 0
    const end =
      endParam !== null
        ? endParam
        : startParam !== null
          ? -1
          : Math.max(requestedWindowMinutes - 1, 0)

    if (end !== -1 && end < start) {
      return c.json({ error: '`end` must be -1 or greater than or equal to `start`' }, 400)
    }

    const includePrometheus = parseBoolean(query.includePrometheus)
    const priorities = parsePriorities(query.priorities)

    const queue = await getQueue(
      connectionId,
      connectionUrl,
      queueName,
      connectionPrefix,
      redisOptions,
      connectionMode
    )
    const metrics = await collectQueueNativeMetrics(queue, {
      queueName,
      start,
      end,
      priorities,
      includePrometheus,
      requestedWindowMinutes: query.windowMinutes ? requestedWindowMinutes : null,
    })

    return c.json(metrics)
  })
  // Pause queue
  .post('/:queueName/pause', async (c) => {
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
    await queue.pause()
    return c.json({ success: true })
  })
  // Resume queue
  .post('/:queueName/resume', async (c) => {
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
    await queue.resume()
    return c.json({ success: true })
  })
  // Clean queue
  .post(
    '/:queueName/clean',
    zValidator(
      'json',
      z.object({
        status: z.string(),
        gracePeriod: z.number().optional(),
        limit: z.number().optional(),
      })
    ),
    async (c) => {
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const connectionPrefix = c.get('connectionPrefix')
      const redisOptions = getConnectionRedisOptions(c)
      const connectionMode = c.get('connectionMode')
      const queueName = c.req.param('queueName')
      const { status, gracePeriod = 0, limit = 1000 } = c.req.valid('json')
      const queue = await getQueue(
        connectionId,
        connectionUrl,
        queueName,
        connectionPrefix,
        redisOptions,
        connectionMode
      )

      const cleanStatus = cleanStatusMap[status as PurgeableQueueStatus]
      if (!cleanStatus) {
        return c.json({ error: `Invalid status: ${status}` }, 400)
      }

      const removedJobIds = await queue.clean(
        gracePeriod,
        limit,
        cleanStatus as Parameters<typeof queue.clean>[2]
      )
      return c.json({ removed: removedJobIds.length, removedJobIds })
    }
  )
  // Purge queue by selected statuses (or all statuses)
  .post(
    '/:queueName/purge',
    zValidator(
      'json',
      z.object({
        confirmName: z.string().min(1),
        statuses: z.array(z.enum(PURGE_STATUS_OPTIONS)).min(1),
        keepMostRecent: z.number().int().min(0).max(MAX_PURGE_KEEP_MOST_RECENT).default(0),
      })
    ),
    async (c) => {
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const connectionPrefix = c.get('connectionPrefix')
      const redisOptions = getConnectionRedisOptions(c)
      const connectionMode = c.get('connectionMode')
      const queueName = c.req.param('queueName')
      const { confirmName, statuses, keepMostRecent } = c.req.valid('json')

      if (confirmName !== queueName) {
        return c.json(
          {
            error: 'Queue name confirmation does not match',
            canPurge: false,
          },
          400
        )
      }

      const requestedStatuses = Array.from(new Set(statuses))
      const statusesToPurge: PurgeableQueueStatus[] = requestedStatuses.includes('all')
        ? [...PURGEABLE_QUEUE_STATUSES]
        : requestedStatuses.filter((status): status is PurgeableQueueStatus => status !== 'all')

      if (statusesToPurge.length === 0) {
        return c.json({ error: 'At least one status must be selected for purge' }, 400)
      }

      const queue = await getQueue(
        connectionId,
        connectionUrl,
        queueName,
        connectionPrefix,
        redisOptions,
        connectionMode
      )
      const removedByStatus = Object.fromEntries(
        statusesToPurge.map((status) => [status, 0])
      ) as Record<PurgeableQueueStatus, number>
      const removedJobIdsSample: string[] = []
      let totalRemoved = 0
      let keptMostRecent = 0

      if (keepMostRecent > 0) {
        const mostRecentHeap: PurgeRecencyCandidate[] = []
        const scannedByStatus = Object.fromEntries(
          statusesToPurge.map((status) => [status, 0])
        ) as Record<PurgeableQueueStatus, number>

        for (const status of statusesToPurge) {
          let reachedSafetyLimit = true

          for (let batch = 0; batch < MAX_PURGE_BATCHES_PER_STATUS; batch++) {
            const start = batch * CLEAN_BATCH_SIZE
            const end = start + CLEAN_BATCH_SIZE - 1
            const jobs = (await queue.getJobs([status], start, end, false)).filter(
              (job): job is NonNullable<typeof job> => job != null
            )

            if (jobs.length === 0) {
              reachedSafetyLimit = false
              break
            }

            scannedByStatus[status] += jobs.length

            for (const job of jobs) {
              addMostRecentCandidate(
                mostRecentHeap,
                {
                  id: String(job.id ?? ''),
                  recency: getJobRecency(job),
                },
                keepMostRecent
              )
            }
          }

          if (reachedSafetyLimit) {
            return c.json(
              {
                error: `Purge safety limit reached while evaluating status "${status}". Please retry with narrower filters.`,
                status,
                canPurge: true,
              },
              409
            )
          }
        }

        const keepJobIds = new Set(mostRecentHeap.map((job) => job.id))
        keptMostRecent = keepJobIds.size

        for (const status of statusesToPurge) {
          const totalForStatus = scannedByStatus[status]
          let removedForStatus = 0

          if (totalForStatus === 0) {
            removedByStatus[status] = 0
            continue
          }

          for (let end = totalForStatus - 1; end >= 0; end -= CLEAN_BATCH_SIZE) {
            const start = Math.max(0, end - CLEAN_BATCH_SIZE + 1)
            const jobs = (await queue.getJobs([status], start, end, false)).filter(
              (job): job is NonNullable<typeof job> => job != null
            )

            for (const job of jobs) {
              const jobId = String(job.id ?? '')
              if (keepJobIds.has(jobId)) {
                continue
              }

              try {
                await job.remove()
              } catch (err) {
                return c.json(
                  {
                    error: `Failed to remove ${status} job "${jobId}": ${String(err)}`,
                    status,
                    canPurge: true,
                  },
                  409
                )
              }

              removedForStatus += 1
              totalRemoved += 1
              appendRemovedJobIdSample(removedJobIdsSample, jobId)
            }
          }

          removedByStatus[status] = removedForStatus
        }
      } else {
        for (const status of statusesToPurge) {
          let removedForStatus = 0
          let reachedSafetyLimit = true

          if (status === 'prioritized') {
            for (let batch = 0; batch < MAX_PURGE_BATCHES_PER_STATUS; batch++) {
              const prioritizedJobs = (
                await queue.getJobs(['prioritized'], 0, CLEAN_BATCH_SIZE - 1)
              ).filter((job): job is NonNullable<typeof job> => job != null)

              if (prioritizedJobs.length === 0) {
                reachedSafetyLimit = false
                break
              }

              for (const job of prioritizedJobs) {
                try {
                  await job.remove()
                } catch (err) {
                  return c.json(
                    {
                      error: `Failed to remove prioritized job "${String(job.id ?? '')}": ${String(
                        err
                      )}`,
                      status,
                      canPurge: true,
                    },
                    409
                  )
                }

                removedForStatus += 1
                totalRemoved += 1
                appendRemovedJobIdSample(removedJobIdsSample, String(job.id ?? ''))
              }
            }

            if (reachedSafetyLimit) {
              return c.json(
                {
                  error: `Purge safety limit reached for status "${status}". Please retry the purge.`,
                  status,
                  canPurge: true,
                },
                409
              )
            }

            removedByStatus[status] = removedForStatus
            continue
          }

          const cleanStatus = cleanStatusMap[status]

          for (let batch = 0; batch < MAX_PURGE_BATCHES_PER_STATUS; batch++) {
            const removedJobIds = await queue.clean(
              0,
              CLEAN_BATCH_SIZE,
              cleanStatus as Parameters<typeof queue.clean>[2]
            )
            const removedCount = removedJobIds.length

            if (removedCount === 0) {
              reachedSafetyLimit = false
              break
            }

            removedForStatus += removedCount
            totalRemoved += removedCount

            for (const jobId of removedJobIds) {
              appendRemovedJobIdSample(removedJobIdsSample, String(jobId))
            }
          }

          if (reachedSafetyLimit) {
            return c.json(
              {
                error: `Purge safety limit reached for status "${status}". Please retry the purge.`,
                status,
                canPurge: true,
              },
              409
            )
          }

          removedByStatus[status] = removedForStatus
        }
      }

      return c.json({
        success: true,
        queueName,
        statusesPurged: statusesToPurge,
        keepMostRecent,
        keptMostRecent,
        totalRemoved,
        removedByStatus,
        removedJobIdsSample,
      })
    }
  )
  // Obliterate queue
  .post('/:queueName/obliterate', async (c) => {
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
    await deleteQueueWithDiscoveryCleanup(connectionId, queueName, queue)
    return c.json({ success: true })
  })
  // Delete queue (only if empty)
  .delete(
    '/:queueName',
    zValidator(
      'json',
      z.object({
        confirmName: z.string(),
      })
    ),
    async (c) => {
      const connectionId = c.get('connectionId')
      const connectionUrl = c.get('connectionUrl')
      const connectionPrefix = c.get('connectionPrefix')
      const redisOptions = getConnectionRedisOptions(c)
      const connectionMode = c.get('connectionMode')
      const queueName = c.req.param('queueName')
      const { confirmName } = c.req.valid('json')

      // Verify the confirmation name matches
      if (confirmName !== queueName) {
        return c.json({ error: 'Queue name confirmation does not match', canDelete: false }, 400)
      }

      const queue = await getQueue(
        connectionId,
        connectionUrl,
        queueName,
        connectionPrefix,
        redisOptions,
        connectionMode
      )
      const counts = await queue.getJobCounts()

      // Calculate total jobs (excluding completed as they can be cleaned)
      const totalActiveJobs =
        (counts.waiting ?? 0) +
        (counts.active ?? 0) +
        (counts.delayed ?? 0) +
        (counts.failed ?? 0) +
        (counts.paused ?? 0) +
        (counts.prioritized ?? 0)

      if (totalActiveJobs > 0) {
        return c.json(
          {
            error: `Cannot delete queue with ${totalActiveJobs} jobs. Remove all jobs first.`,
            canDelete: false,
            jobCounts: {
              waiting: counts.waiting ?? 0,
              active: counts.active ?? 0,
              delayed: counts.delayed ?? 0,
              failed: counts.failed ?? 0,
              paused: counts.paused ?? 0,
              prioritized: counts.prioritized ?? 0,
            },
          },
          400
        )
      }

      await deleteQueueWithDiscoveryCleanup(connectionId, queueName, queue)
      return c.json({ success: true, deleted: queueName })
    }
  )
  // Check if queue can be deleted (pre-flight check)
  .get('/:queueName/can-delete', async (c) => {
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
    const counts = await queue.getJobCounts()

    const totalActiveJobs =
      (counts.waiting ?? 0) +
      (counts.active ?? 0) +
      (counts.delayed ?? 0) +
      (counts.failed ?? 0) +
      (counts.paused ?? 0) +
      (counts.prioritized ?? 0)

    return c.json({
      canDelete: totalActiveJobs === 0,
      totalJobs: totalActiveJobs,
      jobCounts: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        paused: counts.paused ?? 0,
        prioritized: counts.prioritized ?? 0,
      },
    })
  })

export default app
