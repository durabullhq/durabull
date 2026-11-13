import type { MiddlewareHandler } from 'hono'

import { isAllowedHost, type IsAllowedHostOptions } from '../config/allowed-hosts'

export function createHostValidationMiddleware(
  allowedHosts: ReadonlySet<string>,
  options: IsAllowedHostOptions = {}
): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host')

    if (!isAllowedHost(host, allowedHosts, options)) {
      return c.json({ error: 'Forbidden', message: 'Invalid Host header' }, 403)
    }

    await next()
  }
}
