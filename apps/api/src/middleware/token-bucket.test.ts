import { describe, expect, it } from 'bun:test'
import { TokenBucketStore } from './token-bucket'

describe('TokenBucketStore', () => {
  const policy = { capacity: 2, refillPerSecond: 2 }
  it('allows bursts, replenishes fractional tokens, and gives the next-token delay', () => {
    const store = new TokenBucketStore()
    expect(store.take('a', policy, 0).allowed).toBe(true)
    expect(store.take('a', policy, 0).allowed).toBe(true)
    expect(store.take('a', policy, 250)).toMatchObject({ allowed: false, retryAfter: 1 })
    expect(store.take('a', policy, 500).allowed).toBe(true)
    expect(store.take('a', policy, 500).allowed).toBe(false)
  })
  it('does not add debt for denied retries or mint tokens when time moves backward', () => {
    const store = new TokenBucketStore()
    store.take('a', policy, 1000)
    store.take('a', policy, 1000)
    for (let i = 0; i < 100; i++) expect(store.take('a', policy, 500).allowed).toBe(false)
    expect(store.take('a', policy, 1500).allowed).toBe(true)
  })
  it('expires full buckets before evicting an active budget under bounded storage', () => {
    const store = new TokenBucketStore(2)
    store.take('active', { capacity: 1, refillPerSecond: 0.1 }, 0)
    store.take('expired', { capacity: 1, refillPerSecond: 10 }, 0)
    store.take('new', policy, 1000)
    expect(store.take('active', { capacity: 1, refillPerSecond: 0.1 }, 1000).allowed).toBe(false)
  })
})
