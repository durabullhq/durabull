export interface TokenBucketPolicy {
  capacity: number
  refillPerSecond: number
}

interface Bucket {
  tokens: number
  updatedAt: number
  expiresAt: number
}

/** Bounded process-local burst budgets. Denials never consume tokens or extend the wait. */
export class TokenBucketStore {
  private readonly buckets = new Map<string, Bucket>()

  constructor(private readonly maxEntries = 4096) {}

  clear(): void {
    this.buckets.clear()
  }

  take(key: string, policy: TokenBucketPolicy, now = Date.now()) {
    let bucket = this.buckets.get(key)
    if (!bucket) {
      if (this.buckets.size >= this.maxEntries) {
        for (const [entryKey, entry] of this.buckets) {
          if (entry.expiresAt <= now) this.buckets.delete(entryKey)
        }
        if (this.buckets.size >= this.maxEntries) {
          const oldest = this.buckets.keys().next().value
          if (oldest !== undefined) this.buckets.delete(oldest)
        }
      }
      bucket = { tokens: policy.capacity, updatedAt: now, expiresAt: now }
    }
    const elapsed = Math.max(0, now - bucket.updatedAt)
    bucket.tokens = Math.min(
      policy.capacity,
      bucket.tokens + (elapsed / 1000) * policy.refillPerSecond
    )
    bucket.updatedAt = Math.max(bucket.updatedAt, now)
    const allowed = bucket.tokens >= 1
    if (allowed) bucket.tokens -= 1
    const resetAfter = Math.ceil((policy.capacity - bucket.tokens) / policy.refillPerSecond)
    bucket.expiresAt = bucket.updatedAt + resetAfter * 1000
    // Maintain recency for bounded eviction without timers keeping CLI/tests alive.
    this.buckets.delete(key)
    this.buckets.set(key, bucket)
    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      retryAfter: allowed
        ? 0
        : Math.max(1, Math.ceil((1 - bucket.tokens) / policy.refillPerSecond)),
      resetAfter,
    }
  }
}
