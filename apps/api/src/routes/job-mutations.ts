import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { getQueueFromContext } from '../lib/queue-context'

const JOB_DATA_SCHEMA = z.object({
  data: z.custom<unknown>((value) => value !== undefined, {
    message: 'data is required',
  }),
})

const RETRY_JOB_SCHEMA = z.object({
  data: z.unknown().optional(),
})

const app = new Hono()
  .post('/:queueName/jobs/:jobId/data', zValidator('json', JOB_DATA_SCHEMA), async (c) => {
    const queueName = c.req.param('queueName')
    const jobId = c.req.param('jobId')
    const { data } = c.req.valid('json')
    const queue = await getQueueFromContext(c, queueName)
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
  .post('/:queueName/jobs/:jobId/retry', zValidator('json', RETRY_JOB_SCHEMA), async (c) => {
    const queueName = c.req.param('queueName')
    const jobId = c.req.param('jobId')
    const input = c.req.valid('json')
    const queue = await getQueueFromContext(c, queueName)
    const job = await queue.getJob(jobId)

    if (!job) {
      return c.json({ error: 'Job not found' }, 404)
    }

    const state = await job.getState()
    if (state !== 'failed') {
      return c.json({ error: 'Only failed jobs can be retried', state }, 409)
    }

    if (Object.hasOwn(input, 'data')) {
      await job.updateData(input.data)
    }
    await job.retry()

    return c.json({ success: true })
  })

export default app
