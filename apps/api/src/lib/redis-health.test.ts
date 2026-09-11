import { describe, expect, it } from 'bun:test'
import {
  buildRedisHealthSnapshot,
  parseRedisInfo,
  restoreRedisHealthSnapshot,
} from './redis-health'

const MIB = 1024 * 1024

function info(values: Record<string, number | string>): string {
  return [
    '# Server',
    'redis_version:8.2.1',
    ...Object.entries(values).map(([key, value]) => `${key}:${value}`),
    '',
  ].join('\r\n')
}

describe('Redis health snapshots', () => {
  it('parses INFO fields without losing values that contain colons', () => {
    const parsed = parseRedisInfo(
      'redis_version:8.2.1\r\nexecutable:/opt/redis:edge\r\n# Memory\r\n'
    )

    expect(parsed).toEqual({ redis_version: '8.2.1', executable: '/opt/redis:edge' })
  })

  it('derives capacity, CPU, client, fragmentation, eviction, and rejection metrics', () => {
    const previous = buildRedisHealthSnapshot(
      info({
        used_memory: 60 * MIB,
        maxmemory: 100 * MIB,
        total_system_memory: 1024 * MIB,
        allocator_frag_ratio: 1.2,
        allocator_frag_bytes: 12 * MIB,
        used_cpu_sys: 4,
        used_cpu_user: 6,
        connected_clients: 40,
        maxclients: 1000,
        blocked_clients: 0,
        evicted_keys: 100,
        rejected_connections: 10,
      }),
      'Primary Redis',
      new Date('2026-09-02T18:00:00.000Z')
    )

    const snapshot = buildRedisHealthSnapshot(
      info({
        used_memory: 75 * MIB,
        maxmemory: 100 * MIB,
        total_system_memory: 1024 * MIB,
        allocator_frag_ratio: 1.4,
        allocator_frag_bytes: 20 * MIB,
        used_cpu_sys: 4.4,
        used_cpu_user: 6.6,
        connected_clients: 50,
        maxclients: 1000,
        blocked_clients: 2,
        evicted_keys: 105,
        rejected_connections: 13,
      }),
      'Primary Redis',
      new Date('2026-09-02T18:00:02.000Z'),
      previous
    )

    expect(snapshot.metrics).toMatchObject({
      memoryUsagePercent: 75,
      cpuUsagePercent: 50,
      memoryFragmentationRatio: 1.4,
      memoryFragmentationBytes: 20 * MIB,
      connectedClientsPercent: 5,
      blockedClients: 2,
      evictedKeysPerMinute: 150,
      rejectedConnectionsPerMinute: 90,
    })
    expect(snapshot.memoryCapacitySource).toBe('maxmemory')
  })

  it('does not infer a safe Redis limit from host memory when maxmemory is not configured', () => {
    const snapshot = buildRedisHealthSnapshot(
      info({
        used_memory: 256 * MIB,
        used_memory_rss: 320 * MIB,
        maxmemory: 0,
        total_system_memory: 1024 * MIB,
      }),
      'Primary Redis',
      new Date('2026-09-02T18:00:00.000Z')
    )

    expect(snapshot.metrics).toMatchObject({
      memoryUsagePercent: null,
      usedMemoryMegabytes: 256,
      residentMemoryMegabytes: 320,
      memoryCapacityBytes: null,
    })
    expect(snapshot.memoryCapacitySource).toBe('unknown')
  })

  it('restores only valid persisted snapshots', () => {
    const snapshot = buildRedisHealthSnapshot(
      info({ used_memory: 1, maxmemory: 2, used_cpu_sys: 1, used_cpu_user: 1 }),
      'Primary Redis',
      new Date('2026-09-02T18:00:00.000Z')
    )

    expect(restoreRedisHealthSnapshot(snapshot)).toEqual(snapshot)
    expect(restoreRedisHealthSnapshot({ capturedAt: 'not-a-date' })).toBeNull()
    expect(restoreRedisHealthSnapshot(null)).toBeNull()
  })
})
