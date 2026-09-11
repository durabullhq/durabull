import { z } from 'zod'

export const redisHealthMetrics = [
  'memory_usage_percent',
  'used_memory_megabytes',
  'resident_memory_megabytes',
  'cpu_usage_percent',
  'memory_fragmentation_ratio',
  'connected_clients_percent',
  'blocked_clients',
  'evicted_keys_per_minute',
  'rejected_connections_per_minute',
] as const

export type RedisHealthMetric = (typeof redisHealthMetrics)[number]

// BullMQ queue names cannot contain a colon, so this internal cursor cannot
// collide with a real queue cursor on the same Redis connection.
export const REDIS_HEALTH_CURSOR_SCOPE = '__durabull_internal__:redis_health'
export const REDIS_HEALTH_EVENT_SCOPE = 'Redis server'

export const redisHealthConfigSchema = z.discriminatedUnion('metric', [
  z
    .object({
      metric: z.literal('memory_usage_percent'),
      threshold: z.number().min(0.1).max(100),
    })
    .strict(),
  z
    .object({
      metric: z.literal('used_memory_megabytes'),
      threshold: z.number().min(0.1).max(1_000_000_000),
    })
    .strict(),
  z
    .object({
      metric: z.literal('resident_memory_megabytes'),
      threshold: z.number().min(0.1).max(1_000_000_000),
    })
    .strict(),
  z
    .object({
      metric: z.literal('cpu_usage_percent'),
      threshold: z.number().min(0.1).max(1000),
    })
    .strict(),
  z
    .object({
      metric: z.literal('memory_fragmentation_ratio'),
      threshold: z.number().min(1).max(100),
    })
    .strict(),
  z
    .object({
      metric: z.literal('connected_clients_percent'),
      threshold: z.number().min(0.1).max(100),
    })
    .strict(),
  z
    .object({
      metric: z.literal('blocked_clients'),
      threshold: z.number().int().min(1).max(1_000_000),
    })
    .strict(),
  z
    .object({
      metric: z.literal('evicted_keys_per_minute'),
      threshold: z.number().min(0.01).max(1_000_000_000),
    })
    .strict(),
  z
    .object({
      metric: z.literal('rejected_connections_per_minute'),
      threshold: z.number().min(0.01).max(1_000_000_000),
    })
    .strict(),
])

export type RedisHealthConfig = z.infer<typeof redisHealthConfigSchema>

const nullableFiniteNumber = z.number().finite().nullable()

const redisHealthSnapshotSchema = z.object({
  kind: z.literal('redis_health'),
  connectionName: z.string(),
  capturedAt: z.string().datetime(),
  memoryCapacitySource: z.enum(['maxmemory', 'system_memory', 'unknown']),
  metrics: z.object({
    memoryUsagePercent: nullableFiniteNumber,
    cpuUsagePercent: nullableFiniteNumber,
    memoryFragmentationRatio: nullableFiniteNumber,
    memoryFragmentationBytes: nullableFiniteNumber,
    connectedClientsPercent: nullableFiniteNumber,
    blockedClients: nullableFiniteNumber,
    evictedKeysPerMinute: nullableFiniteNumber,
    rejectedConnectionsPerMinute: nullableFiniteNumber,
    usedMemoryBytes: nullableFiniteNumber,
    usedMemoryMegabytes: nullableFiniteNumber.optional(),
    residentMemoryBytes: nullableFiniteNumber.optional(),
    residentMemoryMegabytes: nullableFiniteNumber.optional(),
    memoryCapacityBytes: nullableFiniteNumber,
    connectedClients: nullableFiniteNumber,
    maxClients: nullableFiniteNumber,
  }),
  raw: z.object({
    cpuSeconds: nullableFiniteNumber,
    evictedKeys: nullableFiniteNumber,
    rejectedConnections: nullableFiniteNumber,
  }),
})

export type RedisHealthSnapshot = z.infer<typeof redisHealthSnapshotSchema>

export function parseRedisInfo(info: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const line of info.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf(':')
    if (separatorIndex <= 0) continue
    values[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1)
  }

  return values
}

function finiteNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function percentage(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null
  return (numerator / denominator) * 100
}

function megabytes(bytes: number | null): number | null {
  return bytes === null ? null : bytes / (1024 * 1024)
}

function ratePerMinute(
  current: number | null,
  previous: number | null,
  elapsedSeconds: number | null
): number | null {
  if (current === null || previous === null || elapsedSeconds === null || elapsedSeconds <= 0) {
    return null
  }
  if (current < previous) return 0
  return ((current - previous) / elapsedSeconds) * 60
}

function roundMetric(value: number | null): number | null {
  if (value === null) return null
  return Math.round(value * 1000) / 1000
}

export function buildRedisHealthSnapshot(
  info: string,
  connectionName: string,
  capturedAt = new Date(),
  previous: RedisHealthSnapshot | null = null
): RedisHealthSnapshot {
  const fields = parseRedisInfo(info)
  const usedMemoryBytes = finiteNumber(fields.used_memory)
  const residentMemoryBytes = finiteNumber(fields.used_memory_rss)
  const maxmemoryBytes = finiteNumber(fields.maxmemory)
  const memoryCapacityBytes = maxmemoryBytes !== null && maxmemoryBytes > 0 ? maxmemoryBytes : null
  const memoryCapacitySource =
    maxmemoryBytes !== null && maxmemoryBytes > 0 ? ('maxmemory' as const) : ('unknown' as const)

  const cpuSystemSeconds = finiteNumber(fields.used_cpu_sys)
  const cpuUserSeconds = finiteNumber(fields.used_cpu_user)
  const cpuSeconds =
    cpuSystemSeconds !== null && cpuUserSeconds !== null ? cpuSystemSeconds + cpuUserSeconds : null
  const evictedKeys = finiteNumber(fields.evicted_keys)
  const rejectedConnections = finiteNumber(fields.rejected_connections)
  const connectedClients = finiteNumber(fields.connected_clients)
  const maxClients = finiteNumber(fields.maxclients)

  const capturedAtIso = capturedAt.toISOString()
  const previousTimestamp = previous ? Date.parse(previous.capturedAt) : Number.NaN
  const elapsedSeconds = Number.isFinite(previousTimestamp)
    ? (capturedAt.getTime() - previousTimestamp) / 1000
    : null
  const cpuUsagePercent =
    cpuSeconds !== null &&
    previous?.raw.cpuSeconds !== null &&
    previous?.raw.cpuSeconds !== undefined &&
    elapsedSeconds !== null &&
    elapsedSeconds > 0
      ? cpuSeconds < previous.raw.cpuSeconds
        ? 0
        : ((cpuSeconds - previous.raw.cpuSeconds) / elapsedSeconds) * 100
      : null

  return {
    kind: 'redis_health',
    connectionName,
    capturedAt: capturedAtIso,
    memoryCapacitySource,
    metrics: {
      memoryUsagePercent: roundMetric(percentage(usedMemoryBytes, memoryCapacityBytes)),
      cpuUsagePercent: roundMetric(cpuUsagePercent),
      memoryFragmentationRatio: roundMetric(
        finiteNumber(fields.allocator_frag_ratio) ?? finiteNumber(fields.mem_fragmentation_ratio)
      ),
      memoryFragmentationBytes: roundMetric(
        finiteNumber(fields.allocator_frag_bytes) ?? finiteNumber(fields.mem_fragmentation_bytes)
      ),
      connectedClientsPercent: roundMetric(percentage(connectedClients, maxClients)),
      blockedClients: finiteNumber(fields.blocked_clients),
      evictedKeysPerMinute: roundMetric(
        ratePerMinute(evictedKeys, previous?.raw.evictedKeys ?? null, elapsedSeconds)
      ),
      rejectedConnectionsPerMinute: roundMetric(
        ratePerMinute(
          rejectedConnections,
          previous?.raw.rejectedConnections ?? null,
          elapsedSeconds
        )
      ),
      usedMemoryBytes,
      usedMemoryMegabytes: roundMetric(megabytes(usedMemoryBytes)),
      residentMemoryBytes,
      residentMemoryMegabytes: roundMetric(megabytes(residentMemoryBytes)),
      memoryCapacityBytes,
      connectedClients,
      maxClients,
    },
    raw: {
      cpuSeconds,
      evictedKeys,
      rejectedConnections,
    },
  }
}

export function restoreRedisHealthSnapshot(value: unknown): RedisHealthSnapshot | null {
  const parsed = redisHealthSnapshotSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
