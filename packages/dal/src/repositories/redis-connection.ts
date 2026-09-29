import { uuidv7 } from '@durabull/utils/uuid'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  getEnvRedisConnectionIdsForOrganization,
  shouldUseEnvConnections,
  syncEnvConnectionsForOrganization,
} from '../db/env-redis-connections'
import { decryptRedisUrl, encryptRedisUrl } from '../db/redis-url-encryption'
import { alertRule } from '../db/schemas/alert-rule/schema'
import { organization } from '../db/schemas/organization/schema'
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
   * Get every active Redis connection ID without organization scope.
   * In env-managed mode, this seeds each organization and returns only IDs
   * derived from the current environment configuration. Persisted rows from a
   * previous configuration are deliberately excluded.
   */
  async findAllIdsUnsafe(): Promise<string[]> {
    const db = await getDb()

    if (shouldUseEnvConnections()) {
      const organizations = await db
        .select({ id: organization.id })
        .from(organization)
        .orderBy(organization.createdAt)
      const activeIds: string[] = []

      for (const { id } of organizations) {
        await syncEnvConnectionsForOrganization(db, id)
        activeIds.push(...getEnvRedisConnectionIdsForOrganization(id))
      }

      return activeIds
    }

    const connections = await db
      .select({ id: redisConnection.id })
      .from(redisConnection)
      .orderBy(redisConnection.createdAt)
    return connections.map((connection) => connection.id)
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
        'name' | 'url' | 'isDefault' | 'environment' | 'prefix' | 'allowSelfSignedCerts'
      >
    >
  ): Promise<RedisConnection | null> {
    assertConnectionWritesEnabled()
    const db = await getDbForOrganization(organizationId)

    const updateData: Partial<
      Pick<
        RedisConnection,
        'name' | 'url' | 'isDefault' | 'environment' | 'prefix' | 'allowSelfSignedCerts'
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

  async deleteIfNoAlertRules(
    id: string,
    organizationId: string
  ): Promise<'deleted' | 'blocked' | 'not_found'> {
    assertConnectionWritesEnabled()
    const db = await getDbForOrganization(organizationId)
    return db.transaction(async (tx) => {
      // FOR UPDATE conflicts with the key-share lock required by a concurrent
      // alert-rule FK insert, closing the count/delete race before cascading.
      const [connection] = await tx
        .select({ id: redisConnection.id })
        .from(redisConnection)
        .where(and(eq(redisConnection.id, id), eq(redisConnection.organizationId, organizationId)))
        .for('update')
        .limit(1)
      if (!connection) return 'not_found'

      const [dependentRule] = await tx
        .select({ id: alertRule.id })
        .from(alertRule)
        .where(eq(alertRule.connectionId, id))
        .limit(1)
      if (dependentRule) return 'blocked'

      await tx.delete(redisConnection).where(eq(redisConnection.id, id))
      return 'deleted'
    })
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
