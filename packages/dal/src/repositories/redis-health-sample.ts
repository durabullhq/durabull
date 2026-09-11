import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { redisHealthSample } from '../db/schemas/redis-health-sample/schema'
import type { RedisHealthSample } from '../db/schemas/redis-health-sample/types'

export type RedisHealthSampleInput = Omit<
  RedisHealthSample,
  'id' | 'createdAt' | 'updatedAt' | 'capturedAt'
> & { capturedAt: Date }

export interface RedisHealthSampleBucket {
  capturedAt: Date
  sampleCount: number
  memoryUsagePercent: number | null
  usedMemoryBytes: number | null
  residentMemoryBytes: number | null
  memoryCapacityBytes: number | null
  cpuUsagePercent: number | null
  memoryFragmentationRatio: number | null
  memoryFragmentationBytes: number | null
  connectedClientsPercent: number | null
  connectedClients: number | null
  maxClients: number | null
  blockedClients: number | null
  evictedKeysPerMinute: number | null
  rejectedConnectionsPerMinute: number | null
}

function minuteBucket(date: Date): Date {
  const bucket = new Date(date)
  bucket.setUTCSeconds(0, 0)
  return bucket
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export const redisHealthSampleRepository = {
  async record(data: RedisHealthSampleInput): Promise<RedisHealthSample> {
    const db = await getDb()
    const capturedAt = minuteBucket(data.capturedAt)
    const [row] = await db
      .insert(redisHealthSample)
      .values({ ...data, capturedAt })
      .onConflictDoUpdate({
        target: [redisHealthSample.connectionId, redisHealthSample.capturedAt],
        set: { ...data, capturedAt, updatedAt: new Date() },
      })
      .returning()

    return row
  },

  async findLatest(connectionId: string): Promise<RedisHealthSample | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(redisHealthSample)
      .where(eq(redisHealthSample.connectionId, connectionId))
      .orderBy(desc(redisHealthSample.capturedAt))
      .limit(1)
    return rows[0] ?? null
  },

  async findBuckets(options: {
    connectionId: string
    from: Date
    toExclusive: Date
    bucketSeconds: number
  }): Promise<RedisHealthSampleBucket[]> {
    const db = await getDb()
    const bucketSeconds = Math.max(60, Math.floor(options.bucketSeconds))
    // `bucketSeconds` is normalized to an integer above. Keeping it as a SQL
    // literal makes PostgreSQL recognize the SELECT/GROUP BY expressions as
    // identical instead of assigning different parameter positions.
    const bucketSize = sql.raw(String(bucketSeconds))
    const bucket = sql<number>`floor(extract(epoch from ${redisHealthSample.capturedAt}) / ${bucketSize}) * ${bucketSize}`
    const rows = await db
      .select({
        capturedAt: sql<Date>`to_timestamp(${bucket})`,
        sampleCount: sql<number>`count(*) filter (where
          ${redisHealthSample.memoryUsagePercent} is not null or
          ${redisHealthSample.usedMemoryBytes} is not null or
          ${redisHealthSample.residentMemoryBytes} is not null or
          ${redisHealthSample.memoryCapacityBytes} is not null or
          ${redisHealthSample.cpuUsagePercent} is not null or
          ${redisHealthSample.memoryFragmentationRatio} is not null or
          ${redisHealthSample.memoryFragmentationBytes} is not null or
          ${redisHealthSample.connectedClientsPercent} is not null or
          ${redisHealthSample.connectedClients} is not null or
          ${redisHealthSample.maxClients} is not null or
          ${redisHealthSample.blockedClients} is not null or
          ${redisHealthSample.evictedKeysPerMinute} is not null or
          ${redisHealthSample.rejectedConnectionsPerMinute} is not null
        )::int`,
        // Preserve the peak within each bucket so short alert-triggering
        // excursions remain visible on long-window charts.
        memoryUsagePercent: sql<number | null>`max(${redisHealthSample.memoryUsagePercent})`,
        usedMemoryBytes: sql<number | null>`max(${redisHealthSample.usedMemoryBytes})`,
        residentMemoryBytes: sql<number | null>`max(${redisHealthSample.residentMemoryBytes})`,
        memoryCapacityBytes: sql<number | null>`max(${redisHealthSample.memoryCapacityBytes})`,
        cpuUsagePercent: sql<number | null>`max(${redisHealthSample.cpuUsagePercent})`,
        memoryFragmentationRatio: sql<
          number | null
        >`max(${redisHealthSample.memoryFragmentationRatio})`,
        memoryFragmentationBytes: sql<
          number | null
        >`max(${redisHealthSample.memoryFragmentationBytes})`,
        connectedClientsPercent: sql<
          number | null
        >`max(${redisHealthSample.connectedClientsPercent})`,
        connectedClients: sql<number | null>`max(${redisHealthSample.connectedClients})`,
        maxClients: sql<number | null>`max(${redisHealthSample.maxClients})`,
        blockedClients: sql<number | null>`max(${redisHealthSample.blockedClients})`,
        evictedKeysPerMinute: sql<number | null>`max(${redisHealthSample.evictedKeysPerMinute})`,
        rejectedConnectionsPerMinute: sql<
          number | null
        >`max(${redisHealthSample.rejectedConnectionsPerMinute})`,
      })
      .from(redisHealthSample)
      .where(
        and(
          eq(redisHealthSample.connectionId, options.connectionId),
          gte(redisHealthSample.capturedAt, options.from),
          lt(redisHealthSample.capturedAt, options.toExclusive)
        )
      )
      .groupBy(bucket)
      .orderBy(asc(sql`to_timestamp(${bucket})`))

    return rows.map((row) => ({
      capturedAt:
        row.capturedAt instanceof Date ? row.capturedAt : new Date(String(row.capturedAt)),
      sampleCount: Number(row.sampleCount),
      memoryUsagePercent: nullableNumber(row.memoryUsagePercent),
      usedMemoryBytes: nullableNumber(row.usedMemoryBytes),
      residentMemoryBytes: nullableNumber(row.residentMemoryBytes),
      memoryCapacityBytes: nullableNumber(row.memoryCapacityBytes),
      cpuUsagePercent: nullableNumber(row.cpuUsagePercent),
      memoryFragmentationRatio: nullableNumber(row.memoryFragmentationRatio),
      memoryFragmentationBytes: nullableNumber(row.memoryFragmentationBytes),
      connectedClientsPercent: nullableNumber(row.connectedClientsPercent),
      connectedClients: nullableNumber(row.connectedClients),
      maxClients: nullableNumber(row.maxClients),
      blockedClients: nullableNumber(row.blockedClients),
      evictedKeysPerMinute: nullableNumber(row.evictedKeysPerMinute),
      rejectedConnectionsPerMinute: nullableNumber(row.rejectedConnectionsPerMinute),
    }))
  },

  async deleteOlderThan(cutoff: Date, limit: number): Promise<number> {
    const db = await getDb()
    const expired = await db
      .select({ id: redisHealthSample.id })
      .from(redisHealthSample)
      .where(lt(redisHealthSample.capturedAt, cutoff))
      .orderBy(asc(redisHealthSample.capturedAt))
      .limit(limit)
    if (expired.length === 0) return 0
    const deleted = await db
      .delete(redisHealthSample)
      .where(
        inArray(
          redisHealthSample.id,
          expired.map((row) => row.id)
        )
      )
      .returning({ id: redisHealthSample.id })
    return deleted.length
  },

  async hasOlderThan(cutoff: Date): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .select({ id: redisHealthSample.id })
      .from(redisHealthSample)
      .where(lt(redisHealthSample.capturedAt, cutoff))
      .limit(1)
    return rows.length > 0
  },
}
