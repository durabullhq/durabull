import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { uuidv7 } from '@durabull/utils/uuid'
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'

import { getDb } from '../db/client'
import {
  getEnvRedisConnectionIdsForOrganization,
  shouldUseEnvConnections,
} from '../db/env-redis-connections'
import {
  type McpPrincipalType,
  mcpAuditEvent,
  mcpPolicyBinding,
  mcpServiceAccount,
  mcpServiceAccountSecret,
} from '../db/schemas/mcp-policy/schema'
import type { NewMcpPolicyBinding } from '../db/schemas/mcp-policy/types'
import { member } from '../db/schemas/organization/schema'
import { redisConnection } from '../db/schemas/redis-connection/schema'

const MCP_SECRET_PREFIX = 'dbsa'
const scryptAsync = promisify(scrypt)

async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const digestBuffer = (await scryptAsync(secret, salt, 64)) as Buffer
  const digest = digestBuffer.toString('hex')
  return `scrypt:${salt}:${digest}`
}

async function verifySecretHash(secret: string, storedHash: string): Promise<boolean> {
  const [algo, salt, expectedDigest] = storedHash.split(':')
  if (algo !== 'scrypt' || !salt || !expectedDigest) return false

  const digestBuffer = (await scryptAsync(secret, salt, 64)) as Buffer
  const actualDigest = digestBuffer.toString('hex')
  if (actualDigest.length !== expectedDigest.length) {
    return false
  }
  return timingSafeEqual(Buffer.from(actualDigest, 'utf8'), Buffer.from(expectedDigest, 'utf8'))
}

function generateServiceAccountSecret(): string {
  return `${MCP_SECRET_PREFIX}_${randomBytes(24).toString('base64url')}`
}

export interface CreateMcpServiceAccountInput {
  organizationId: string
  name: string
  description?: string | null
  oauthClientId?: string | null
}

export interface CreateMcpPolicyBindingInput {
  principalType: McpPrincipalType
  principalId: string
  organizationId?: string | null
  toolName?: string | null
  scope: string
}

export const mcpPolicyRepository = {
  async createServiceAccount(input: CreateMcpServiceAccountInput) {
    const db = await getDb()
    const now = new Date()

    const [record] = await db
      .insert(mcpServiceAccount)
      .values({
        id: uuidv7(),
        createdAt: now,
        updatedAt: now,
        organizationId: input.organizationId,
        name: input.name,
        description: input.description ?? null,
        oauthClientId: input.oauthClientId ?? null,
        disabled: false,
      })
      .returning()

    return record
  },

  async findServiceAccountByOauthClientId(oauthClientId: string) {
    const db = await getDb()
    const rows = await db
      .select()
      .from(mcpServiceAccount)
      .where(
        and(
          eq(mcpServiceAccount.oauthClientId, oauthClientId),
          eq(mcpServiceAccount.disabled, false)
        )
      )
      .limit(1)
    return rows[0] ?? null
  },

  async findServiceAccountByOauthClientIdIncludingDisabled(oauthClientId: string) {
    const db = await getDb()
    const rows = await db
      .select()
      .from(mcpServiceAccount)
      .where(eq(mcpServiceAccount.oauthClientId, oauthClientId))
      .limit(1)
    return rows[0] ?? null
  },

  async issueServiceAccountSecret(
    serviceAccountId: string,
    opts?: { createdByUserId?: string | null; label?: string | null; expiresAt?: Date | null }
  ) {
    const db = await getDb()
    const secret = generateServiceAccountSecret()
    const now = new Date()

    const [record] = await db
      .insert(mcpServiceAccountSecret)
      .values({
        id: uuidv7(),
        createdAt: now,
        updatedAt: now,
        serviceAccountId,
        label: opts?.label ?? 'primary',
        secretHash: await hashSecret(secret),
        secretLastFour: secret.slice(-4),
        createdByUserId: opts?.createdByUserId ?? null,
        expiresAt: opts?.expiresAt ?? null,
        revokedAt: null,
      })
      .returning()

    return { secret, record }
  },

  async rotateServiceAccountSecret(
    serviceAccountId: string,
    opts?: { createdByUserId?: string | null; label?: string | null; revokeActiveSecrets?: boolean }
  ) {
    const db = await getDb()
    const now = new Date()
    return db.transaction(async (tx) => {
      if (opts?.revokeActiveSecrets ?? true) {
        await tx
          .update(mcpServiceAccountSecret)
          .set({ revokedAt: now, updatedAt: now })
          .where(
            and(
              eq(mcpServiceAccountSecret.serviceAccountId, serviceAccountId),
              isNull(mcpServiceAccountSecret.revokedAt)
            )
          )
      }

      const secret = generateServiceAccountSecret()
      const [record] = await tx
        .insert(mcpServiceAccountSecret)
        .values({
          id: uuidv7(),
          createdAt: now,
          updatedAt: now,
          serviceAccountId,
          label: opts?.label ?? 'rotated',
          secretHash: await hashSecret(secret),
          secretLastFour: secret.slice(-4),
          createdByUserId: opts?.createdByUserId ?? null,
          expiresAt: null,
          revokedAt: null,
        })
        .returning()

      return { secret, record }
    })
  },

  async verifyServiceAccountSecret(serviceAccountId: string, secret: string): Promise<boolean> {
    const db = await getDb()
    const now = new Date()
    const rows = await db
      .select({
        secretHash: mcpServiceAccountSecret.secretHash,
      })
      .from(mcpServiceAccountSecret)
      .where(
        and(
          eq(mcpServiceAccountSecret.serviceAccountId, serviceAccountId),
          isNull(mcpServiceAccountSecret.revokedAt),
          or(isNull(mcpServiceAccountSecret.expiresAt), gt(mcpServiceAccountSecret.expiresAt, now))
        )
      )

    for (const row of rows) {
      if (await verifySecretHash(secret, row.secretHash)) {
        return true
      }
    }
    return false
  },

  async createPolicyBinding(input: CreateMcpPolicyBindingInput) {
    const db = await getDb()
    const now = new Date()
    const values: NewMcpPolicyBinding = {
      id: uuidv7(),
      createdAt: now,
      updatedAt: now,
      principalType: input.principalType,
      principalId: input.principalId,
      organizationId: input.organizationId ?? null,
      toolName: input.toolName ?? null,
      scope: input.scope,
      disabled: false,
    }
    const [record] = await db.insert(mcpPolicyBinding).values(values).returning()
    return record
  },

  async listPolicyBindings(principalType: McpPrincipalType, principalId: string) {
    const db = await getDb()
    return db
      .select()
      .from(mcpPolicyBinding)
      .where(
        and(
          eq(mcpPolicyBinding.principalType, principalType),
          eq(mcpPolicyBinding.principalId, principalId),
          eq(mcpPolicyBinding.disabled, false)
        )
      )
  },

  async canDelegatedUserAccessConnection(userId: string, connectionId: string): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .select({ id: redisConnection.id })
      .from(redisConnection)
      .innerJoin(
        member,
        and(eq(member.organizationId, redisConnection.organizationId), eq(member.userId, userId))
      )
      .where(eq(redisConnection.id, connectionId))
      .limit(1)
    return rows.length > 0
  },

  async listDelegatedUserConnections(userId: string): Promise<
    Array<{
      id: string
      name: string
      environment: string | null
      prefix: string
      isDefault: boolean
      organizationId: string
    }>
  > {
    const db = await getDb()
    const rows = await db
      .select({
        id: redisConnection.id,
        name: redisConnection.name,
        environment: redisConnection.environment,
        prefix: redisConnection.prefix,
        isDefault: redisConnection.isDefault,
        organizationId: redisConnection.organizationId,
      })
      .from(redisConnection)
      .innerJoin(
        member,
        and(eq(member.organizationId, redisConnection.organizationId), eq(member.userId, userId))
      )
    return rows
  },

  async doesConnectionBelongToOrganization(
    connectionId: string,
    organizationId: string
  ): Promise<boolean> {
    const db = await getDb()
    const envConnectionIds = shouldUseEnvConnections()
      ? getEnvRedisConnectionIdsForOrganization(organizationId)
      : null

    if (envConnectionIds && !envConnectionIds.includes(connectionId)) {
      return false
    }

    const rows = await db
      .select({ id: redisConnection.id })
      .from(redisConnection)
      .where(
        and(
          eq(redisConnection.id, connectionId),
          eq(redisConnection.organizationId, organizationId),
          ...(envConnectionIds ? [inArray(redisConnection.id, envConnectionIds)] : [])
        )
      )
      .limit(1)
    return rows.length > 0
  },

  async createAuditEvent(input: {
    correlationId: string
    principalType: McpPrincipalType
    principalId: string
    organizationId?: string | null
    connectionId?: string | null
    toolName: string
    requiredScopes: string[]
    granted: boolean
    denialReason?: string | null
    inputHash?: string | null
    responseClass?: string | null
  }) {
    const db = await getDb()
    const now = new Date()
    const [record] = await db
      .insert(mcpAuditEvent)
      .values({
        id: uuidv7(),
        createdAt: now,
        updatedAt: now,
        correlationId: input.correlationId,
        principalType: input.principalType,
        principalId: input.principalId,
        organizationId: input.organizationId ?? null,
        connectionId: input.connectionId ?? null,
        toolName: input.toolName,
        requiredScopes: input.requiredScopes.join(' '),
        granted: input.granted,
        denialReason: input.denialReason ?? null,
        inputHash: input.inputHash ?? null,
        responseClass: input.responseClass ?? null,
      })
      .returning()
    return record
  },
}
