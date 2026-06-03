import { and, asc, eq, ilike, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { redisDiscoveredQueue } from '../db/schemas/redis-discovered-queue/schema'
import type { RedisDiscoveredQueue } from '../db/schemas/redis-discovered-queue/types'

export interface RedisDiscoveredQueueListOptions {
  offset: number
  limit: number
  nameContains?: string
}

function connectionWhere(connectionId: string, nameContains?: string) {
  const trimmed = nameContains?.trim()
  if (!trimmed) {
    return eq(redisDiscoveredQueue.connectionId, connectionId)
  }

  const escaped = trimmed.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  return and(
    eq(redisDiscoveredQueue.connectionId, connectionId),
    ilike(redisDiscoveredQueue.name, `%${escaped}%`)
  )
}

export interface RedisDiscoveredQueueSummary {
  total: number
  pending: number
  confirmed: number
  lastDiscoveredAt: Date | null
}

function toNumber(value: number | string | bigint | null | undefined): number {
  if (value === null || value === undefined) return 0
  return Number(value)
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

export const redisDiscoveredQueueRepository = {
  async listByConnection(
    connectionId: string,
    options: RedisDiscoveredQueueListOptions
  ): Promise<RedisDiscoveredQueue[]> {
    const db = await getDb()
    return db
      .select()
      .from(redisDiscoveredQueue)
      .where(connectionWhere(connectionId, options.nameContains))
      .orderBy(asc(redisDiscoveredQueue.name))
      .limit(options.limit)
      .offset(options.offset)
  },

  async findByConnectionAndName(
    connectionId: string,
    name: string
  ): Promise<RedisDiscoveredQueue | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(redisDiscoveredQueue)
      .where(
        and(eq(redisDiscoveredQueue.connectionId, connectionId), eq(redisDiscoveredQueue.name, name))
      )
      .limit(1)

    return rows[0] ?? null
  },

  async countByConnection(connectionId: string, options?: { nameContains?: string }): Promise<number> {
    const db = await getDb()
    const [row] = await db
      .select({
        total: sql<number>`count(*)`,
      })
      .from(redisDiscoveredQueue)
      .where(connectionWhere(connectionId, options?.nameContains))

    return toNumber(row?.total)
  },

  async getSummary(connectionId: string): Promise<RedisDiscoveredQueueSummary> {
    const db = await getDb()
    const [row] = await db
      .select({
        total: sql<number>`count(*)`,
        pending: sql<number>`coalesce(sum(case when ${redisDiscoveredQueue.state} = 'pending' then 1 else 0 end), 0)`,
        confirmed: sql<number>`coalesce(sum(case when ${redisDiscoveredQueue.state} = 'confirmed' then 1 else 0 end), 0)`,
        lastDiscoveredAt: sql<Date | string | null>`max(${redisDiscoveredQueue.lastDiscoveredAt})`,
      })
      .from(redisDiscoveredQueue)
      .where(eq(redisDiscoveredQueue.connectionId, connectionId))

    return {
      total: toNumber(row?.total),
      pending: toNumber(row?.pending),
      confirmed: toNumber(row?.confirmed),
      lastDiscoveredAt: toDate(row?.lastDiscoveredAt ?? null),
    }
  },

  async markAllPending(connectionId: string): Promise<number> {
    const db = await getDb()
    const now = new Date()
    const rows = await db
      .update(redisDiscoveredQueue)
      .set({
        state: 'pending',
        updatedAt: now,
      })
      .where(eq(redisDiscoveredQueue.connectionId, connectionId))
      .returning({ id: redisDiscoveredQueue.id })

    return rows.length
  },

  async upsertConfirmedQueues(
    connectionId: string,
    queueNames: string[],
    discoveredAt: Date
  ): Promise<number> {
    const normalizedQueueNames = Array.from(
      new Set(queueNames.map((name) => name.trim()).filter((name) => name.length > 0))
    )

    if (normalizedQueueNames.length === 0) {
      return 0
    }

    const db = await getDb()
    const now = new Date()
    const rows = normalizedQueueNames.map((name) => ({
      connectionId,
      name,
      state: 'confirmed' as const,
      lastDiscoveredAt: discoveredAt,
      createdAt: now,
      updatedAt: now,
    }))

    await db
      .insert(redisDiscoveredQueue)
      .values(rows)
      .onConflictDoUpdate({
        target: [redisDiscoveredQueue.connectionId, redisDiscoveredQueue.name],
        set: {
          state: 'confirmed',
          lastDiscoveredAt: discoveredAt,
          updatedAt: now,
        },
      })

    return rows.length
  },

  async deletePending(connectionId: string): Promise<number> {
    const db = await getDb()
    const rows = await db
      .delete(redisDiscoveredQueue)
      .where(
        and(
          eq(redisDiscoveredQueue.connectionId, connectionId),
          eq(redisDiscoveredQueue.state, 'pending')
        )
      )
      .returning({ id: redisDiscoveredQueue.id })

    return rows.length
  },

  async deleteByConnection(connectionId: string): Promise<number> {
    const db = await getDb()
    const rows = await db
      .delete(redisDiscoveredQueue)
      .where(eq(redisDiscoveredQueue.connectionId, connectionId))
      .returning({ id: redisDiscoveredQueue.id })

    return rows.length
  },

  async syncConnectionSnapshot(
    connectionId: string,
    queueNames: string[],
    discoveredAt: Date
  ): Promise<{ confirmed: number; removed: number }> {
    const normalizedQueueNames = Array.from(
      new Set(queueNames.map((name) => name.trim()).filter((name) => name.length > 0))
    )

    const db = await getDb()
    const now = new Date()

    return db.transaction(async (tx) => {
      await tx
        .update(redisDiscoveredQueue)
        .set({
          state: 'pending',
          updatedAt: now,
        })
        .where(eq(redisDiscoveredQueue.connectionId, connectionId))

      if (normalizedQueueNames.length > 0) {
        const rows = normalizedQueueNames.map((name) => ({
          connectionId,
          name,
          state: 'confirmed' as const,
          lastDiscoveredAt: discoveredAt,
          createdAt: now,
          updatedAt: now,
        }))

        await tx
          .insert(redisDiscoveredQueue)
          .values(rows)
          .onConflictDoUpdate({
            target: [redisDiscoveredQueue.connectionId, redisDiscoveredQueue.name],
            set: {
              state: 'confirmed',
              lastDiscoveredAt: discoveredAt,
              updatedAt: now,
            },
          })
      }

      const removedRows = await tx
        .delete(redisDiscoveredQueue)
        .where(
          and(
            eq(redisDiscoveredQueue.connectionId, connectionId),
            eq(redisDiscoveredQueue.state, 'pending')
          )
        )
        .returning({ id: redisDiscoveredQueue.id })

      return {
        confirmed: normalizedQueueNames.length,
        removed: removedRows.length,
      }
    })
  },
}
