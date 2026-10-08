import { createHash } from 'node:crypto'
import { env } from '@durabull/env'
import { extractBearerToken } from '@durabull/mcp/auth'
import { createMiddleware } from 'hono/factory'

import { MCP_RATE_LIMIT_POLICIES } from '../mcp/middleware/rate-limit-policy'
import { recordMcpTelemetry } from '../mcp/observability/mcp-telemetry'
import { TokenBucketStore } from './token-bucket'

/**
 * Simple in-memory rate limiter.
 * For production with multiple instances, consider using Redis-backed rate limiting.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory store for rate limiting
const rateLimitStore = new Map<string, RateLimitEntry>()

/** Test-only: clear in-memory counters between cases. */
export function resetRateLimitStoreForTests(): void {
  rateLimitStore.clear()
  mcpIngressBuckets.clear()
}

const GENERAL_API_RATE_LIMIT_WINDOW_MS = 60 * 1000
const GENERAL_API_RATE_LIMIT_MAX_REQUESTS = 600

// Clean up expired entries periodically
setInterval(
  () => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key)
      }
    }
  },
  60 * 1000 // Clean every minute
)

interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number
  /** Maximum requests per window */
  limit: number
  /** Prefix for the rate limit key (to separate different limiters) */
  keyPrefix?: string
  /** Custom key generator function */
  keyGenerator?: (c: Parameters<ReturnType<typeof createMiddleware>>[0]) => string
  /** Custom handler for rate limited requests */
  onRateLimit?: (
    c: Parameters<ReturnType<typeof createMiddleware>>[0]
  ) => Response | Promise<Response>
}

function isTrustedProxyEnvironment(): boolean {
  if (env.TRUST_PROXY === true) return true
  if (env.DURABULL_CLOUD === true) return true
  return false
}

/**
 * Resolve a client IP from forwarding headers when the deployment sits behind a trusted proxy.
 * Ignores spoofable headers on direct or untrusted ingress so they cannot mint fresh rate-limit keys.
 */
function getTrustedClientIp(c: Parameters<ReturnType<typeof createMiddleware>>[0]): string | null {
  if (!isTrustedProxyEnvironment()) return null

  const cfIp = c.req.header('cf-connecting-ip')?.trim()
  if (cfIp) return cfIp

  const realIp = c.req.header('x-real-ip')?.trim()
  if (realIp) return realIp

  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    const ips = forwarded
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean)
    // Use the rightmost hop (appended by the trusted proxy), not the client-spoofable leftmost entry.
    return ips.at(-1) ?? null
  }

  return null
}

/**
 * Get client identifier for rate limiting.
 */
function getClientKey(c: Parameters<ReturnType<typeof createMiddleware>>[0]): string {
  return getTrustedClientIp(c) ?? 'unknown-client'
}

/**
 * Check if we're in an environment where rate limiting should be disabled.
 * This includes test environments and optionally development (for e2e tests).
 */
function shouldSkipRateLimiting(): boolean {
  // Explicitly disabled via env var
  if (env.DISABLE_RATE_LIMIT === true) {
    return true
  }

  // Skip in test environment
  if (env.NODE_ENV === 'test' || env.CI === true) {
    return true
  }

  // Skip in development for easier e2e testing
  // (production would have NODE_ENV === 'production')
  if (env.NODE_ENV === 'development') {
    return true
  }

  // In production, NODE_ENV is explicitly set to 'production'
  // If it's not set at all (undefined), we're likely in dev/test
  if (env.NODE_ENV === undefined) {
    return true
  }

  return false
}

/**
 * Creates a rate limiting middleware for Hono.
 */
export function rateLimiter(options: RateLimitOptions) {
  const { windowMs, limit, keyPrefix = 'rl', keyGenerator = getClientKey, onRateLimit } = options

  return createMiddleware(async (c, next) => {
    // Skip rate limiting in test/development environments
    if (shouldSkipRateLimiting()) {
      return next()
    }

    const clientKey = keyGenerator(c)
    const key = `${keyPrefix}:${clientKey}`
    const now = Date.now()

    let entry = rateLimitStore.get(key)

    // Reset if window has passed
    if (!entry || entry.resetAt < now) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
      }
    }

    entry.count++
    rateLimitStore.set(key, entry)

    // Set rate limit headers
    const remaining = Math.max(0, limit - entry.count)
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000)

    c.header('X-RateLimit-Limit', limit.toString())
    c.header('X-RateLimit-Remaining', remaining.toString())
    c.header('X-RateLimit-Reset', resetSeconds.toString())

    // Check if rate limited
    if (entry.count > limit) {
      c.header('Retry-After', resetSeconds.toString())

      if (onRateLimit) {
        return onRateLimit(c)
      }

      return c.json(
        {
          error: 'Too Many Requests',
          code: 'RATE_LIMITED', // Helps frontend distinguish from auth errors
          message: `Rate limit exceeded. Try again in ${resetSeconds} seconds.`,
          retryAfter: resetSeconds,
        },
        429
      )
    }

    return next()
  })
}

/**
 * Rate limiter for authentication endpoints.
 * Helps prevent brute force attacks while not being too aggressive for normal use.
 */
export const authRateLimiter = rateLimiter({
  windowMs: 10 * 1000, // 10 seconds
  limit: 50, // 50 requests per 10 seconds
  keyPrefix: 'rl:auth',
  // Custom handler to make it clear this is rate limiting, not an auth issue
  onRateLimit: (c) =>
    c.json(
      {
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: 'Too many authentication requests. Please wait a moment and try again.',
        retryAfter: 10,
      },
      429
    ),
})

/**
 * General API rate limiter.
 * Prevents abuse while allowing normal usage.
 */
export const apiRateLimiter = rateLimiter({
  windowMs: GENERAL_API_RATE_LIMIT_WINDOW_MS,
  limit: GENERAL_API_RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: 'rl:api',
  // Custom handler to distinguish from auth errors
  onRateLimit: (c) =>
    c.json(
      {
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded. Please slow down.',
        retryAfter: Math.ceil(GENERAL_API_RATE_LIMIT_WINDOW_MS / 1000),
      },
      429
    ),
})

/**
 * Public limiter for Durabull-owned telemetry collection on the existing API.
 * Keeps the cloud API ingestion route bounded without affecting local product behavior.
 */
export const telemetryCollectRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 120, // 120 batches per minute per client
  keyPrefix: 'rl:telemetry-collect',
  onRateLimit: (c) =>
    c.json(
      {
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: 'Telemetry rate limit exceeded.',
        retryAfter: 60,
      },
      429
    ),
})

/**
 * Stricter rate limiter for connection testing.
 * Prevents SSRF scanning attacks.
 */
export const connectionTestRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 10, // 10 connection tests per minute
  keyPrefix: 'rl:conn-test',
})

/**
 * Rate limiter for MCP Streamable HTTP ingress at /mcp.
 */
function mcpIngressRateLimitKey(c: Parameters<ReturnType<typeof createMiddleware>>[0]): string {
  const bearerToken = extractBearerToken(c.req.header('Authorization'))
  if (bearerToken) {
    return `bearer:${createHash('sha256').update(bearerToken).digest('hex').slice(0, 24)}`
  }

  return getTrustedClientIp(c) ?? 'mcp-anonymous'
}

/** Stricter limit for dynamic MCP OAuth client registration. */
export const mcpOAuthRegisterRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 20,
  keyPrefix: 'rl:mcp-oauth-register',
  keyGenerator: mcpIngressRateLimitKey,
  onRateLimit: (c) =>
    c.json(
      {
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: 'MCP OAuth client registration rate limit exceeded.',
        retryAfter: 60,
      },
      429
    ),
})

const mcpIngressBuckets = new TokenBucketStore()

/** Transport abuse ceiling; authenticated work has independent budgets after validation. */
export const mcpRateLimiter = createMiddleware(async (c, next) => {
  if (
    c.req.method === 'OPTIONS' ||
    shouldSkipRateLimiting() ||
    c.get('mcpIngressRateLimitApplied')
  ) {
    return next()
  }
  // Hono /mcp/* also matches /mcp. Guard against accidental overlapping registrations.
  c.set('mcpIngressRateLimitApplied', true)
  const policy = MCP_RATE_LIMIT_POLICIES.ingress
  const result = mcpIngressBuckets.take(mcpIngressRateLimitKey(c), policy)
  c.header('X-RateLimit-Limit', String(policy.capacity))
  c.header('X-RateLimit-Remaining', String(result.remaining))
  c.header('X-RateLimit-Reset', String(result.resetAfter))
  if (result.allowed) return next()
  c.header('Retry-After', String(result.retryAfter))
  recordMcpTelemetry({ signal: 'rate_limited_ingress' })
  return c.json(
    {
      error: 'Too Many Requests',
      code: 'RATE_LIMITED',
      message: 'MCP transport burst budget exhausted. Retry after the indicated delay.',
      retryAfter: result.retryAfter,
      bucket: 'ingress',
    },
    429
  )
})

declare module 'hono' {
  interface ContextVariableMap {
    mcpIngressRateLimitApplied?: boolean
  }
}
