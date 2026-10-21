import { billingRepository, serviceAccountRepository } from '@durabull/dal'
import { env } from '@durabull/env'
import {
  getCanonicalMcpResourceUri,
  isMcpWriteScope,
  MCP_ALL_SCOPES,
  MCP_SCOPE_DISCOVER,
  normalizeResourceUri,
} from '@durabull/mcp/auth'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { isBillingEnabled, isEnforcedFor } from '../billing/config'
import { assertCapacity, requireFeature } from '../billing/entitlements'
import { toBillingHttpError } from '../billing/errors'
import { requireOrganization } from '../middleware/auth'

const EXPIRY_DAYS = [30, 90, 365] as const

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  scopes: z.array(z.enum(MCP_ALL_SCOPES)).min(1).max(MCP_ALL_SCOPES.length),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(90),
})

const rotateSchema = z.object({
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(90),
})

function mcpResource(): string {
  return normalizeResourceUri(getCanonicalMcpResourceUri(env.APP_BASE_URL))
}

function expiresAt(days: (typeof EXPIRY_DAYS)[number]): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

async function canManage(organizationId: string, userId: string | undefined): Promise<boolean> {
  if (!userId) return false
  const membership = await billingRepository.findMembership(organizationId, userId)
  return membership?.role === 'owner' || membership?.role === 'admin'
}

const FORBIDDEN = {
  error: 'Forbidden',
  message: 'Only organization owners and admins can manage service accounts.',
} as const

/**
 * Self-service MCP service accounts: persistent, org-scoped automation
 * identities. Scope bindings never exceed what the owner selects, write scopes
 * stay opt-in (ADR-0001), and the plan limits how many accounts are enabled.
 */
const app = new Hono()
  .use('*', requireOrganization)
  .get('/', async (c) => {
    const organizationId = c.get('organizationId')!
    const accounts = await serviceAccountRepository.list(organizationId)
    const suspended =
      isBillingEnabled() && isEnforcedFor(organizationId)
        ? await billingRepository.suspendedIds(organizationId, 'service_account')
        : new Set<string>()
    return c.json({
      serviceAccounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        description: account.description,
        disabled: account.disabled,
        suspended: suspended.has(account.id),
        scopes: account.scopes,
        tokenLastFour: account.tokenLastFour,
        tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
        createdAt: account.createdAt.toISOString(),
      })),
      availableScopes: [...MCP_ALL_SCOPES],
    })
  })

  .post('/', zValidator('json', createSchema), async (c) => {
    const organizationId = c.get('organizationId')!
    const user = c.get('user')
    if (!user || !(await canManage(organizationId, user.id))) return c.json(FORBIDDEN, 403)
    const body = c.req.valid('json')

    await requireFeature(organizationId, 'automation.service_accounts')
    // Write scopes remain opt-in per ADR-0001 and need the plan's MCP writes.
    if (body.scopes.some(isMcpWriteScope)) await requireFeature(organizationId, 'mcp.write')
    await assertCapacity(organizationId, 'service_accounts.enabled')

    const scopes = [...new Set([MCP_SCOPE_DISCOVER, ...body.scopes])]
    try {
      const created = await serviceAccountRepository.create({
        organizationId,
        name: body.name,
        description: body.description ?? null,
        scopes,
        resource: mcpResource(),
        expiresAt: expiresAt(body.expiresInDays),
        createdByUserId: user.id,
      })
      // The token is shown exactly once; only a hash and last four are kept.
      return c.json({ id: created.id, token: created.token, scopes }, 201)
    } catch (error) {
      if (toBillingHttpError(error)) throw error
      if (String(error).includes('unique')) {
        return c.json({ error: 'A service account with this name already exists.' }, 400)
      }
      throw error
    }
  })

  .post('/:id/rotate', zValidator('json', rotateSchema), async (c) => {
    const organizationId = c.get('organizationId')!
    const user = c.get('user')
    if (!user || !(await canManage(organizationId, user.id))) return c.json(FORBIDDEN, 403)
    await requireFeature(organizationId, 'automation.service_accounts')
    const { id } = c.req.param()
    const result = await serviceAccountRepository.rotateToken({
      organizationId,
      id,
      resource: mcpResource(),
      expiresAt: expiresAt(c.req.valid('json').expiresInDays),
      createdByUserId: user.id,
    })
    if (!result) return c.json({ error: 'Service account not found' }, 404)
    return c.json({ token: result.token })
  })

  .patch('/:id', zValidator('json', z.object({ disabled: z.boolean() })), async (c) => {
    const organizationId = c.get('organizationId')!
    const user = c.get('user')
    if (!user || !(await canManage(organizationId, user.id))) return c.json(FORBIDDEN, 403)
    const { id } = c.req.param()
    const { disabled } = c.req.valid('json')
    const existing = await serviceAccountRepository.findInOrganization(organizationId, id)
    if (!existing) return c.json({ error: 'Service account not found' }, 404)
    if (!disabled && existing.disabled) {
      await requireFeature(organizationId, 'automation.service_accounts')
      await assertCapacity(organizationId, 'service_accounts.enabled')
    }
    await serviceAccountRepository.setDisabled(organizationId, id, disabled)
    return c.json({ id, disabled })
  })

  .delete('/:id', async (c) => {
    const organizationId = c.get('organizationId')!
    const user = c.get('user')
    if (!user || !(await canManage(organizationId, user.id))) return c.json(FORBIDDEN, 403)
    const deleted = await serviceAccountRepository.delete(organizationId, c.req.param('id'))
    if (!deleted) return c.json({ error: 'Service account not found' }, 404)
    return c.json({ success: true })
  })

export default app
