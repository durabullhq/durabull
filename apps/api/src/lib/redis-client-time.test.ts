import { describe, expect, it } from 'bun:test'
import { redisClientSecondsToMs, toRedisClientSummary } from './redis-client-time'

describe('redisClientSecondsToMs', () => {
  it('converts the whole seconds Redis reports into milliseconds', () => {
    // `CLIENT LIST` prints e.g. `age=916 idle=3`.
    expect(redisClientSecondsToMs('916')).toBe(916_000)
    expect(redisClientSecondsToMs('3')).toBe(3_000)
    expect(redisClientSecondsToMs(7)).toBe(7_000)
  })

  it('treats a missing, zero, or malformed field as zero', () => {
    expect(redisClientSecondsToMs(undefined)).toBe(0)
    expect(redisClientSecondsToMs(null)).toBe(0)
    expect(redisClientSecondsToMs('0')).toBe(0)
    expect(redisClientSecondsToMs('')).toBe(0)
    expect(redisClientSecondsToMs('not-a-number')).toBe(0)
    expect(redisClientSecondsToMs(-5)).toBe(0)
  })
})

describe('toRedisClientSummary', () => {
  it('maps a CLIENT LIST entry and converts its times to milliseconds', () => {
    expect(
      toRedisClientSummary({
        id: '26240',
        name: 'bull:ZW1haWxz',
        addr: '172.19.0.1:55930',
        age: '916',
        idle: '3',
      })
    ).toEqual({
      id: '26240',
      name: 'bull:ZW1haWxz',
      address: '172.19.0.1:55930',
      ageMs: 916_000,
      idleMs: 3_000,
    })
  })

  it('fills missing fields with empty values', () => {
    expect(toRedisClientSummary({})).toEqual({
      id: '',
      name: '',
      address: '',
      ageMs: 0,
      idleMs: 0,
    })
  })
})
