import type { McpAccessTokenClaims } from './types'

interface CacheEntry {
  claims: McpAccessTokenClaims
  expiresAtMs: number
}

const DEFAULT_MAX_ENTRIES = 2_048
const DEFAULT_TTL_MS = 60_000

/**
 * In-process LRU-ish cache for validated MCP bearer tokens (per API instance).
 * Reduces repeated DB lookups on hot MCP RPC paths.
 */
export function createMcpTokenValidationCache(options?: { maxEntries?: number; ttlMs?: number }) {
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS
  const store = new Map<string, CacheEntry>()

  function get(cacheKey: string): McpAccessTokenClaims | null {
    const entry = store.get(cacheKey)
    if (!entry) return null

    if (entry.expiresAtMs <= Date.now()) {
      store.delete(cacheKey)
      return null
    }

    // LRU: refresh insertion order
    store.delete(cacheKey)
    store.set(cacheKey, entry)
    return entry.claims
  }

  function set(cacheKey: string, claims: McpAccessTokenClaims): void {
    if (!store.has(cacheKey) && store.size >= maxEntries) {
      const oldestKey = store.keys().next().value
      if (oldestKey) store.delete(oldestKey)
    }

    const tokenExpiryMs = claims.accessTokenExpiresAt.getTime()
    const cacheExpiryMs = Math.min(Date.now() + ttlMs, tokenExpiryMs)

    store.set(cacheKey, { claims, expiresAtMs: cacheExpiryMs })
  }

  function invalidate(cacheKey: string): void {
    store.delete(cacheKey)
  }

  return { get, set, invalidate }
}
