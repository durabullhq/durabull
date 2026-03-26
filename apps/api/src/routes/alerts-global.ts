import { alertEventRepository } from '@durabull/dal'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireOrganization } from '../middleware/auth'

const app = new Hono()
  .use('*', requireOrganization)
  .get(
    '/events',
    zValidator(
      'query',
      z.object({
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        status: z.enum(['firing', 'resolved', 'suppressed']).optional(),
      })
    ),
    async (c) => {
      const { offset, limit, status } = c.req.valid('query')
      const organizationId = c.get('organizationId')
      if (!organizationId) {
        return c.json({ error: 'Organization is required' }, 403)
      }

      const events = await alertEventRepository.findByOrganization(organizationId, {
        offset,
        limit,
        status,
      })
      return c.json({ events })
    }
  )
  .get('/summary', async (c) => {
    const organizationId = c.get('organizationId')
    if (!organizationId) {
      return c.json({ error: 'Organization is required' }, 403)
    }

    const counts = await alertEventRepository.countFiringByOrganization(organizationId)
    return c.json({ connections: counts })
  })

export default app
