import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { env } from '@durabull/env'
import {
  clearEnvConnectionCache,
  getEnvRedisConnectionId,
  getEnvRedisConnections,
} from './env-redis-connections'

function clearRedisConnectionEnvVars() {
  for (const key of Object.keys(process.env)) {
    if (key === 'DURABULL_REDIS_URL_DEFAULT' || key.startsWith('DURABULL_REDIS_URL_')) {
      delete process.env[key]
    }
  }
}

const originalNodeEnv = env.NODE_ENV
const originalDefaultName = env.DURABULL_REDIS_URL_DEFAULT

describe('env-redis-connections', () => {
  beforeEach(() => {
    clearRedisConnectionEnvVars()
    clearEnvConnectionCache()
    ;(env as { NODE_ENV?: 'development' | 'test' | 'production' }).NODE_ENV = 'development'
    ;(env as { DURABULL_REDIS_URL_DEFAULT?: string }).DURABULL_REDIS_URL_DEFAULT = undefined
  })

  afterEach(() => {
    clearRedisConnectionEnvVars()
    clearEnvConnectionCache()
    ;(env as { NODE_ENV?: 'development' | 'test' | 'production' }).NODE_ENV = originalNodeEnv
    ;(env as { DURABULL_REDIS_URL_DEFAULT?: string }).DURABULL_REDIS_URL_DEFAULT =
      originalDefaultName
  })

  it('parses env-driven connections and applies explicit default', () => {
    process.env.DURABULL_REDIS_URL_MAIN = 'redis://localhost:6379'
    process.env.DURABULL_REDIS_URL_MAIN_ENVIRONMENT = 'development'
    process.env.DURABULL_REDIS_URL_WORKERS = 'redis://localhost:6380'
    process.env.DURABULL_REDIS_URL_WORKERS_ENVIRONMENT = 'staging'
    ;(env as { DURABULL_REDIS_URL_DEFAULT?: string }).DURABULL_REDIS_URL_DEFAULT = 'WORKERS'

    const connections = getEnvRedisConnections()

    expect(connections).toHaveLength(2)
    expect(connections.map((connection) => connection.envName)).toEqual(['MAIN', 'WORKERS'])
    expect(connections.find((connection) => connection.envName === 'WORKERS')?.isDefault).toBe(true)
    expect(connections.find((connection) => connection.envName === 'MAIN')?.isDefault).toBe(false)
  })

  it('falls back to the first sorted connection when default is missing', () => {
    process.env.DURABULL_REDIS_URL_ZETA = 'redis://localhost:6381'
    process.env.DURABULL_REDIS_URL_ALPHA = 'redis://localhost:6382'

    const connections = getEnvRedisConnections()

    expect(connections).toHaveLength(2)
    expect(connections[0]?.envName).toBe('ALPHA')
    expect(connections[0]?.isDefault).toBe(true)
    expect(connections[1]?.isDefault).toBe(false)
  })

  it('warns and falls back when default name is invalid', () => {
    process.env.DURABULL_REDIS_URL_MAIN = 'redis://localhost:6379'
    ;(env as { DURABULL_REDIS_URL_DEFAULT?: string }).DURABULL_REDIS_URL_DEFAULT = 'MISSING'

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (message?: unknown) => {
      warnings.push(String(message))
    }

    try {
      const connections = getEnvRedisConnections()
      expect(connections).toHaveLength(1)
      expect(connections[0]?.isDefault).toBe(true)
    } finally {
      console.warn = originalWarn
    }

    expect(
      warnings.some((warning) => warning.includes('DURABULL_REDIS_URL_DEFAULT="MISSING"'))
    ).toBe(true)
  })

  it('skips non-redis URLs during parsing', () => {
    ;(env as { NODE_ENV?: 'development' | 'test' | 'production' }).NODE_ENV = 'production'
    process.env.DURABULL_REDIS_URL_MAIN = 'http://example.com'
    process.env.DURABULL_REDIS_URL_SECONDARY = 'redis://localhost:6379'

    const connections = getEnvRedisConnections()
    expect(connections).toHaveLength(1)
    expect(connections[0]?.envName).toBe('SECONDARY')
  })

  it('ignores non-connection redis settings', () => {
    process.env.DURABULL_REDIS_URL_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    process.env.DURABULL_REDIS_URL_MAIN = 'redis://localhost:6379'

    const connections = getEnvRedisConnections()

    expect(connections).toHaveLength(1)
    expect(connections[0]?.envName).toBe('MAIN')
  })

  it('parses allow self-signed cert flags from env suffixes', () => {
    process.env.DURABULL_REDIS_URL_MAIN = 'rediss://localhost:6379'
    process.env.DURABULL_REDIS_URL_MAIN_ALLOW_SELF_SIGNED_CERTS = 'true'
    process.env.DURABULL_REDIS_URL_WORKERS = 'redis://localhost:6380'

    const connections = getEnvRedisConnections()

    expect(
      connections.find((connection) => connection.envName === 'MAIN')?.allowSelfSignedCerts
    ).toBe(true)
    expect(
      connections.find((connection) => connection.envName === 'WORKERS')?.allowSelfSignedCerts
    ).toBe(false)
  })

  it('generates deterministic IDs per organization and env name', () => {
    const first = getEnvRedisConnectionId('org-1', 'MAIN')
    const second = getEnvRedisConnectionId('org-1', 'MAIN')
    const third = getEnvRedisConnectionId('org-2', 'MAIN')

    expect(first).toBe(second)
    expect(first).not.toBe(third)
  })

  it('parses prefix from _PREFIX env suffix', () => {
    process.env.DURABULL_REDIS_URL_MAIN = 'redis://localhost:6379'
    process.env.DURABULL_REDIS_URL_MAIN_PREFIX = 'custom'
    process.env.DURABULL_REDIS_URL_WORKERS = 'redis://localhost:6380'

    const connections = getEnvRedisConnections()

    expect(connections).toHaveLength(2)
    expect(connections.find((c) => c.envName === 'MAIN')?.prefix).toBe('custom')
    expect(connections.find((c) => c.envName === 'WORKERS')?.prefix).toBe('bull')
  })

  it('defaults to bull prefix when _PREFIX is not set', () => {
    process.env.DURABULL_REDIS_URL_MAIN = 'redis://localhost:6379'

    const connections = getEnvRedisConnections()

    expect(connections).toHaveLength(1)
    expect(connections[0]?.prefix).toBe('bull')
  })
})
