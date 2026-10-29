import { createMiddleware } from 'hono/factory'
import { isBillingEnabled } from '../billing/config'
import { isMemberSuspended } from '../billing/entitlements'
import { getAuth } from '../lib/auth'
import { MEMBER_SUSPENDED_BODY } from './auth'

/**
 * Better Auth organization actions a member whose seat is paused may still
 * take: they only affect the caller's own membership or other organizations.
 * Every other state-changing action is denied, so a new or renamed Better Auth
 * endpoint is blocked by default.
 */
const ALLOWED_WHILE_SUSPENDED = new Set([
  'leave',
  'set-active',
  'set-active-team',
  'accept-invitation',
  'reject-invitation',
  'create',
  'check-slug',
])

/** Whether a suspended member is denied this Better Auth organization action. */
export function isDeniedWhileSuspended(method: string, action: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false
  if (action.startsWith('get-') || action.startsWith('list-')) return false
  return !ALLOWED_WHILE_SUSPENDED.has(action)
}

/**
 * Suspended members keep their session but must not act on the organization
 * through Better Auth's own endpoints (invite, change roles, remove members),
 * which bypass the API's session middleware. Leaving, switching organizations
 * and accepting invitations elsewhere stay available.
 */
export const suspendedMemberAuthGuard = createMiddleware(async (c, next) => {
  if (!isBillingEnabled()) return next()
  const action = c.req.path.split('/organization/')[1]
  if (!action || !isDeniedWhileSuspended(c.req.method, action)) return next()

  const auth = await getAuth()
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return next()
  let organizationId: string | null =
    (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null
  try {
    const body = (await c.req.raw.clone().json()) as { organizationId?: unknown }
    if (typeof body.organizationId === 'string') organizationId = body.organizationId
  } catch {
    // No JSON body: Better Auth falls back to the active organization too.
  }
  if (organizationId && (await isMemberSuspended(organizationId, session.user.id))) {
    return c.json(MEMBER_SUSPENDED_BODY, 403)
  }
  return next()
})
