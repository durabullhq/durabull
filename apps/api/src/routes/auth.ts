import { Hono } from 'hono'
import { env } from '@durabull/env'
import { getAuth } from '../lib/auth'
import { getAuthlessContext, isAuthlessMode } from '../lib/authless'
import { ensureMcpAuthorizeScopes } from './mcp-authorize-scopes'

const app = new Hono()

/**
 * Handle all auth requests using Better Auth's handler.
 * Better Auth uses a catch-all pattern for all auth operations:
 * - POST /sign-up/email - Sign up with email/password
 * - POST /sign-in/email - Sign in with email/password
 * - POST /sign-out - Sign out
 * - GET /session - Get current session
 * - And more...
 */
app.all('/*', async (c) => {
  if (isAuthlessMode()) {
    const context = await getAuthlessContext()
    const path = c.req.path

    if (c.req.method === 'GET' && (path.endsWith('/get-session') || path.endsWith('/session'))) {
      return c.json({ user: context.user, session: context.session })
    }

    if (c.req.method === 'POST' && path.endsWith('/sign-out')) {
      return c.json({ success: true })
    }

    return c.json(
      {
        error: 'Authentication is disabled in authless mode.',
      },
      403
    )
  }

  const auth = await getAuth()
  const rewrittenUrl = ensureMcpAuthorizeScopes(new URL(c.req.url), env.APP_BASE_URL)
  if (rewrittenUrl.toString() === c.req.url) {
    return auth.handler(c.req.raw)
  }

  const rewrittenRequest = new Request(rewrittenUrl.toString(), c.req.raw)
  return auth.handler(rewrittenRequest)
})

export default app
