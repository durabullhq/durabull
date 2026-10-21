import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  mcpPolicyBinding,
  mcpServiceAccount,
  mcpServiceAccountSecret,
} from '../db/schemas/mcp-policy/schema'
import { oauthAccessToken, oauthApplication } from '../db/schemas/oauth-mcp/schema'

/** Prefix that makes leaked service-account tokens easy to recognize and scan for. */
export const SERVICE_ACCOUNT_TOKEN_PREFIX = 'dbsa_'

export interface ServiceAccountSummary {
  id: string
  name: string
  description: string | null
  disabled: boolean
  createdAt: Date
  scopes: string[]
  tokenLastFour: string | null
  tokenExpiresAt: Date | null
}

function generateToken(): string {
  return `${SERVICE_ACCOUNT_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Self-service provisioning for org-scoped MCP service accounts. Each account
 * owns a confidential OAuth client, explicit scope bindings and one bearer
 * access token without a user (the principal resolver requires that).
 */
export const serviceAccountRepository = {
  async list(organizationId: string): Promise<ServiceAccountSummary[]> {
    const db = await getDb()
    const accounts = await db
      .select()
      .from(mcpServiceAccount)
      .where(eq(mcpServiceAccount.organizationId, organizationId))
      .orderBy(desc(mcpServiceAccount.createdAt))
    if (accounts.length === 0) return []
    const ids = accounts.map((account) => account.id)
    const [bindings, secrets] = await Promise.all([
      db
        .select({ principalId: mcpPolicyBinding.principalId, scope: mcpPolicyBinding.scope })
        .from(mcpPolicyBinding)
        .where(
          and(
            eq(mcpPolicyBinding.principalType, 'service_account'),
            inArray(mcpPolicyBinding.principalId, ids),
            eq(mcpPolicyBinding.disabled, false)
          )
        ),
      db
        .select()
        .from(mcpServiceAccountSecret)
        .where(
          and(
            inArray(mcpServiceAccountSecret.serviceAccountId, ids),
            isNull(mcpServiceAccountSecret.revokedAt)
          )
        ),
    ])
    return accounts.map((account) => {
      const secret = secrets.find((s) => s.serviceAccountId === account.id) ?? null
      return {
        id: account.id,
        name: account.name,
        description: account.description,
        disabled: account.disabled,
        createdAt: account.createdAt,
        scopes: [
          ...new Set(bindings.filter((b) => b.principalId === account.id).map((b) => b.scope)),
        ].sort(),
        tokenLastFour: secret?.secretLastFour ?? null,
        tokenExpiresAt: secret?.expiresAt ?? null,
      }
    })
  },

  async create(input: {
    organizationId: string
    name: string
    description: string | null
    scopes: string[]
    resource: string
    expiresAt: Date
    createdByUserId: string
  }): Promise<{ id: string; token: string }> {
    const db = await getDb()
    const token = generateToken()
    const now = new Date()
    const clientId = `durabull-sa-${randomUUID()}`
    const id = await db.transaction(async (tx) => {
      await tx.insert(oauthApplication).values({
        id: randomUUID(),
        name: `Service account: ${input.name}`,
        clientId,
        clientSecret: null,
        redirectUrls: '',
        type: 'confidential',
        disabled: false,
        createdAt: now,
        updatedAt: now,
      })
      // The capacity trigger on mcp_service_account enforces the plan limit
      // atomically inside this transaction.
      const [account] = await tx
        .insert(mcpServiceAccount)
        .values({
          organizationId: input.organizationId,
          name: input.name,
          description: input.description,
          oauthClientId: clientId,
          disabled: false,
        })
        .returning({ id: mcpServiceAccount.id })
      await tx.insert(mcpPolicyBinding).values(
        input.scopes.map((scope) => ({
          principalType: 'service_account' as const,
          principalId: account.id,
          organizationId: input.organizationId,
          toolName: null,
          scope,
        }))
      )
      await tx.insert(oauthAccessToken).values({
        id: randomUUID(),
        accessToken: token,
        refreshToken: `unused-${randomUUID()}`,
        accessTokenExpiresAt: input.expiresAt,
        refreshTokenExpiresAt: input.expiresAt,
        clientId,
        userId: null,
        scopes: input.scopes.join(' '),
        resource: input.resource,
        createdAt: now,
        updatedAt: now,
      })
      await tx.insert(mcpServiceAccountSecret).values({
        serviceAccountId: account.id,
        label: 'access_token',
        secretHash: hashToken(token),
        secretLastFour: token.slice(-4),
        createdByUserId: input.createdByUserId,
        expiresAt: input.expiresAt,
      })
      return account.id
    })
    return { id, token }
  },

  async findInOrganization(organizationId: string, id: string) {
    const db = await getDb()
    const rows = await db
      .select()
      .from(mcpServiceAccount)
      .where(
        and(eq(mcpServiceAccount.id, id), eq(mcpServiceAccount.organizationId, organizationId))
      )
      .limit(1)
    return rows[0] ?? null
  },

  /** Revoke every token for the account and issue a fresh one (returned once). */
  async rotateToken(input: {
    organizationId: string
    id: string
    resource: string
    expiresAt: Date
    createdByUserId: string
  }): Promise<{ token: string } | null> {
    const account = await this.findInOrganization(input.organizationId, input.id)
    if (!account?.oauthClientId) return null
    const clientId = account.oauthClientId
    const db = await getDb()
    const token = generateToken()
    const now = new Date()
    const scopes =
      (await this.list(input.organizationId)).find((a) => a.id === input.id)?.scopes ?? []
    await db.transaction(async (tx) => {
      await tx.delete(oauthAccessToken).where(eq(oauthAccessToken.clientId, clientId))
      await tx
        .update(mcpServiceAccountSecret)
        .set({ revokedAt: now })
        .where(
          and(
            eq(mcpServiceAccountSecret.serviceAccountId, input.id),
            isNull(mcpServiceAccountSecret.revokedAt)
          )
        )
      await tx.insert(oauthAccessToken).values({
        id: randomUUID(),
        accessToken: token,
        refreshToken: `unused-${randomUUID()}`,
        accessTokenExpiresAt: input.expiresAt,
        refreshTokenExpiresAt: input.expiresAt,
        clientId,
        userId: null,
        scopes: scopes.join(' '),
        resource: input.resource,
        createdAt: now,
        updatedAt: now,
      })
      await tx.insert(mcpServiceAccountSecret).values({
        serviceAccountId: input.id,
        label: 'access_token',
        secretHash: hashToken(token),
        secretLastFour: token.slice(-4),
        createdByUserId: input.createdByUserId,
        expiresAt: input.expiresAt,
      })
    })
    return { token }
  },

  async setDisabled(organizationId: string, id: string, disabled: boolean): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .update(mcpServiceAccount)
      .set({ disabled })
      .where(
        and(eq(mcpServiceAccount.id, id), eq(mcpServiceAccount.organizationId, organizationId))
      )
      .returning({ id: mcpServiceAccount.id })
    return rows.length > 0
  },

  /** Delete the account, its OAuth client (cascading tokens) and bindings. */
  async delete(organizationId: string, id: string): Promise<boolean> {
    const account = await this.findInOrganization(organizationId, id)
    if (!account) return false
    const db = await getDb()
    await db.transaction(async (tx) => {
      await tx
        .delete(mcpPolicyBinding)
        .where(
          and(
            eq(mcpPolicyBinding.principalType, 'service_account'),
            eq(mcpPolicyBinding.principalId, id)
          )
        )
      await tx.delete(mcpServiceAccount).where(eq(mcpServiceAccount.id, id))
      if (account.oauthClientId) {
        await tx
          .delete(oauthApplication)
          .where(eq(oauthApplication.clientId, account.oauthClientId))
      }
    })
    return true
  },
}
