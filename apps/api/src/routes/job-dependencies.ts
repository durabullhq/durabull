import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { parseJobReference, readDependencyPage } from '../lib/job-dependencies'
import { getQueueFromContext } from '../lib/queue-context'

const querySchema = z.object({
  kind: z.enum(['unprocessed', 'processed', 'failed', 'ignored']).default('unprocessed'),
  cursor: z
    .string()
    .refine(
      (value) => /^(0|[1-9]\d{0,19})$/.test(value) && BigInt(value) <= 18446744073709551615n,
      'Invalid Redis cursor'
    )
    .default('0'),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

const app = new Hono().get(
  '/:queueName/jobs/:jobId/dependencies',
  zValidator('query', querySchema),
  async (c) => {
    const { queueName, jobId } = c.req.param()
    const { kind, cursor, pageSize } = c.req.valid('query')
    const queue = await getQueueFromContext(c, queueName)
    const job = await queue.getJob(jobId)
    if (!job) return c.json({ error: 'Job not found' }, 404)

    const prefix = queue.opts.prefix ?? 'bull'
    const resolveReference = async (key: string) => {
      const reference = parseJobReference(key, prefix)
      if (!reference) return { key, queueName: null, jobId: null, status: 'outside-connection' }
      const relatedQueue = await getQueueFromContext(c, reference.queueName)
      const status = await relatedQueue.getJobState(reference.jobId)
      return { key, ...reference, status }
    }

    const [counts, status, parent, page] = await Promise.all([
      job.getDependenciesCount(),
      job.getState(),
      job.parentKey ? resolveReference(job.parentKey) : null,
      readDependencyPage(await queue.client, queue.toKey(jobId), kind, cursor, pageSize),
    ])

    const children: Awaited<ReturnType<typeof resolveReference>>[] = []
    // Limit concurrent state reads, including when compact Redis collections
    // return more entries than the requested scan count.
    for (let start = 0; start < page.keys.length; start += 10) {
      children.push(
        ...(await Promise.all(page.keys.slice(start, start + 10).map(resolveReference)))
      )
    }

    return c.json({
      parent,
      status,
      counts: {
        unprocessed: counts.unprocessed ?? 0,
        processed: counts.processed ?? 0,
        failed: counts.failed ?? 0,
        ignored: counts.ignored ?? 0,
      },
      kind,
      children,
      nextCursor: page.nextCursor,
    })
  }
)

export default app
