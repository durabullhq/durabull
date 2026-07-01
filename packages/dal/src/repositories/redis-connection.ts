import { uuidv7 } from '@durabull/utils/uuid'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  getEnvRedisConnectionIdsForOrganization,
  shouldUseEnvConnections,
  syncEnvConnectionsForOrganization,
} from '../db/env-redis-connections'
import { decryptRedisUrl, encryptRedisUrl } from '../db/redis-url-encryption'
import { redisConnection } from '../db/schemas/redis-connection/schema'
import type { NewRedisConnection, RedisConnection } from '../db/schemas/redis-connection/types'

async function getDbForOrganization(organizationId: string) {
  const db = await getDb()
  await syncEnvConnectionsForOrganization(db, organizationId)
  return db
}

function assertConnectionWritesEnabled(): void {
  if (!shouldUseEnvConnections()) return
  throw new Error('Connection writes are disabled while DURABULL_ENV_CONNECTIONS=true.')
}

function withDecryptedUrl(connection: RedisConnection): RedisConnection {
  return {
    ...connection,
    url: decryptRedisUrl(connection.url),
  }
}

/**
 * Repository for managing Redis connections.
 * All operations are scoped to an organization.
 * Provides CRUD operations without exposing the underlying database.
 */
export const redisConnectionRepository = {
  /**
   * Create a new Redis connection for an organization.
   * Requires organizationId.
   */
  async create(
    data: Omit<NewRedisConnection, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<RedisConnection> {
    assertConnectionWritesEnabled()
    const db = await getDbForOrganization(data.organizationId)
    const id = uuidv7()
    const now = new Date()

    const [result] = await db
      .insert(redisConnection)
      .values({
        id,
        ...data,
        url: encryptRedisUrl(data.url),
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    return withDecryptedUrl(result)
  },

  /**
   * Find a Redis connection by ID, scoped to an organization.
   * Returns null if not found or if connection doesn't belong to organization.
   */
  async findById(id: string, organizationId: string): Promise<RedisConnection | null> {
    const db = await getDbForOrganization(organizationId)
    const envConnectionIds = shouldUseEnvConnections()
      ? getEnvRedisConnectionIdsForOrganization(organizationId)
      : null

    if (envConnectionIds && !envConnectionIds.includes(id)) {
      return null
    }

    const result = await db
      .select()
      .from(redisConnection)
      .where(
        and(
          eq(redisConnection.id, id),
          eq(redisConnection.organizationId, organizationId),
          ...(envConnectionIds ? [inArray(redisConnection.id, envConnectionIds)] : [])
        )
      )
      .limit(1)

    return result[0] ? withDecryptedUrl(result[0]) : null
  },

  /**
   * Find a Redis connection by ID without organization scope.
   * Used for internal validation - prefer findById with org scope.
   */
  async findByIdUnsafe(id: string): Promise<RedisConnection | null> {
    const db = await getDb()

    const result = await db
      .select()
      .from(redisConnection)
      .where(eq(redisConnection.id, id))
      .limit(1)

    return result[0] ? withDecryptedUrl(result[0]) : null
  },

  /**
   * Get all Redis connections for an organization, ordered by creation date.
   */
  async findAll(organizationId: string): Promise<RedisConnection[]> {
    const db = await getDbForOrganization(organizationId)
    const envConnectionIds = shouldUseEnvConnections()
      ? getEnvRedisConnectionIdsForOrganization(organizationId)
      : null

    if (envConnectionIds && envConnectionIds.length === 0) {
      return []
    }

    const connections = await db
      .select()
      .from(redisConnection)
      .where(
        and(
          eq(redisConnection.organizationId, organizationId),
          ...(envConnectionIds ? [inArray(redisConnection.id, envConnectionIds)] : [])
        )
      )
      .orderBy(redisConnection.createdAt)

    return connections.map(withDecryptedUrl)
  },

  /**
   * Get the default Redis connection for an organization.
   */
  async findDefault(organizationId: string): Promise<RedisConnection | null> {
    const db = await getDbForOrganization(organizationId)
    const envConnectionIds = shouldUseEnvConnections()
      ? getEnvRedisConnectionIdsForOrganization(organizationId)
      : null

    if (envConnectionIds && envConnectionIds.length === 0) {
      return null
    }

    const result = await db
      .select()
      .from(redisConnection)
      .where(
        and(
          eq(redisConnection.isDefault, true),
          eq(redisConnection.organizationId, organizationId),
          ...(envConnectionIds ? [inArray(redisConnection.id, envConnectionIds)] : [])
        )
      )
      .limit(1)

    return result[0] ? withDecryptedUrl(result[0]) : null
  },

  /**
   * Update a Redis connection, scoped to an organization.
   * Returns null if connection doesn't exist or doesn't belong to organization.
   */
  async update(
    id: string,
    organizationId: string,
    data: Partial<
      Pick<
        RedisConnection,
        'name' | 'url' | 'mode' | 'isDefault' | 'environment' | 'prefix' | 'allowSelfSignedCerts'
      >
    >
  ): Promise<RedisConnection | null> {
    assertConnectionWritesEnabled()
    const db = await getDbForOrganization(organizationId)

    const updateData: Partial<
      Pick<
        RedisConnection,
        'name' | 'url' | 'mode' | 'isDefault' | 'environment' | 'prefix' | 'allowSelfSignedCerts'
      >
    > = { ...data }
    if (updateData.url !== undefined) {
      updateData.url = encryptRedisUrl(updateData.url)
    }

    const [result] = await db
      .update(redisConnection)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(and(eq(redisConnection.id, id), eq(redisConnection.organizationId, organizationId)))
      .returning()

    return result ? withDecryptedUrl(result) : null
  },

  /**
   * Delete a Redis connection by ID, scoped to an organization.
   * Returns false if connection doesn't exist or doesn't belong to organization.
   */
  async delete(id: string, organizationId: string): Promise<boolean> {
    assertConnectionWritesEnabled()
    const db = await getDbForOrganization(organizationId)

    const result = await db
      .delete(redisConnection)
      .where(and(eq(redisConnection.id, id), eq(redisConnection.organizationId, organizationId)))
      .returning({ id: redisConnection.id })

    return result.length > 0
  },

  /**
   * Set a connection as the default within an organization (clears other defaults first).
   */
  async setDefault(id: string, organizationId: string): Promise<RedisConnection | null> {
    assertConnectionWritesEnabled()
    const db = await getDbForOrganization(organizationId)

    // Clear existing defaults within the organization
    await db
      .update(redisConnection)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(eq(redisConnection.isDefault, true), eq(redisConnection.organizationId, organizationId))
      )

    // Set the new default
    const [result] = await db
      .update(redisConnection)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(redisConnection.id, id), eq(redisConnection.organizationId, organizationId)))
      .returning()

    return result ? withDecryptedUrl(result) : null
  },

  /**
   * Check if a connection with the given name exists within an organization.
   */
  async existsByName(name: string, organizationId: string): Promise<boolean> {
    const db = await getDbForOrganization(organizationId)

    const result = await db
      .select({ id: redisConnection.id })
      .from(redisConnection)
      .where(
        and(eq(redisConnection.name, name), eq(redisConnection.organizationId, organizationId))
      )
      .limit(1)

    return result.length > 0
  },

  /**
   * Get total count of connections within an organization.
   */
  async count(organizationId: string): Promise<number> {
    const db = await getDbForOrganization(organizationId)
    const envConnectionIds = shouldUseEnvConnections()
      ? getEnvRedisConnectionIdsForOrganization(organizationId)
      : null

    if (envConnectionIds && envConnectionIds.length === 0) {
      return 0
    }

    const result = await db
      .select()
      .from(redisConnection)
      .where(
        and(
          eq(redisConnection.organizationId, organizationId),
          ...(envConnectionIds ? [inArray(redisConnection.id, envConnectionIds)] : [])
        )
      )
    return result.length
  },
}
