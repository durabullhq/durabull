import { Hono } from 'hono'
import { getConnectionRedisOptions } from '../lib/connection-options'
import { discoverQueues, getQueue, safeGetWorkers } from '../lib/redis'

// Default and max page sizes for pagination
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

const app = new Hono()
  // Get all workers (paginated by queue)
  // We paginate at the queue level to prevent loading workers from thousands of queues
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

    // Paginate the queue names BEFORE fetching worker details
    const start = (page - 1) * pageSize
    const end = start + pageSize
    const paginatedQueueNames = allQueueNames.slice(start, end)

    const allWorkers: Array<{
      id: string
      name: string
      addr: string
      age: number
      idle: number
      queueName: string
    }> = []
    const queueData: Array<{
      name: string
      workerCount: number
      status: 'active' | 'paused'
      jobCounts: { active: number; waiting: number }
    }> = []

    await Promise.all(
      paginatedQueueNames.map(async (queueName) => {
        const queue = await getQueue(
          connectionId,
          connectionUrl,
          queueName,
          connectionPrefix,
          redisOptions,
          connectionMode
        )
        const [workers, isPaused, counts] = await Promise.all([
          safeGetWorkers(queue),
          queue.isPaused(),
          queue.getJobCounts(),
        ])

        // Add workers with queue context
        for (const w of workers) {
          allWorkers.push({
            id: w.id ?? '',
            name: w.name ?? '',
            addr: w.addr ?? '',
            age: Number(w.age) || 0,
            idle: Number(w.idle) || 0,
            queueName,
          })
        }

        queueData.push({
          name: queueName,
          workerCount: workers.length,
          status: isPaused ? 'paused' : 'active',
          jobCounts: {
            active: counts.active ?? 0,
            waiting: counts.waiting ?? 0,
          },
        })
      })
    )

    return c.json({
      workers: allWorkers,
      queues: queueData,
      totalWorkers: allWorkers.length,
      totalQueues,
      page,
      pageSize,
      totalPages: Math.ceil(totalQueues / pageSize),
      hasMore: end < totalQueues,
    })
  })

export default app
