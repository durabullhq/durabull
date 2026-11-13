import { and, eq, lt, ne, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { member, organization } from '../db/schemas/organization/schema'
import { slackInstallation } from '../db/schemas/slack-installation/schema'
import type {
  SlackInstallation,
  SlackInstallationStatus,
} from '../db/schemas/slack-installation/types'
import { user } from '../db/schemas/user/schema'
import { encryptSecret } from '../db/secret-encryption'

export interface UpsertSlackInstallationInput {
  organizationId: string
  slackTeamId: string
  slackTeamName: string
  slackTeamUrl?: string | null
  slackEnterpriseId?: string | null
  slackAppId?: string | null
  botUserId: string
  botToken: string
  refreshToken?: string | null
  botTokenExpiresAt?: Date | null
  scopes: string
  installedByUserId?: string | null
  installedBySlackUserId?: string | null
}

export interface SlackInstallationSettings {
  actionsEnabled?: boolean
  unfurlsEnabled?: boolean
}

export interface SlackOrganizationMember {
  userId: string
  name: string
  email: string
  role: string
}

export interface SlackInstallationWithOrganization extends SlackInstallation {
  organizationSlug: string
  organizationName: string
}

export const slackInstallationRepository = {
  async findByOrganization(organizationId: string): Promise<SlackInstallation | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(slackInstallation)
      .where(eq(slackInstallation.organizationId, organizationId))
      .limit(1)
    return rows[0] ?? null
  },

  /** Active installations of a Slack workspace, with the organization each belongs to. */
  async listActiveByTeam(slackTeamId: string): Promise<SlackInstallationWithOrganization[]> {
    const db = await getDb()
    const rows = await db
      .select({
        installation: slackInstallation,
        organizationSlug: organization.slug,
        organizationName: organization.name,
      })
      .from(slackInstallation)
      .innerJoin(organization, eq(organization.id, slackInstallation.organizationId))
      .where(
        and(eq(slackInstallation.slackTeamId, slackTeamId), eq(slackInstallation.status, 'active'))
      )
      .orderBy(organization.name)
    return rows.map((row) => ({
      ...row.installation,
      organizationSlug: row.organizationSlug,
      organizationName: row.organizationName,
    }))
  },

  /** Number of other organizations with an active installation in this workspace. */
  async countOtherInstallationsForTeam(
    slackTeamId: string,
    excludingOrganizationId: string
  ): Promise<number> {
    const db = await getDb()
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(slackInstallation)
      .where(
        and(
          eq(slackInstallation.slackTeamId, slackTeamId),
          ne(slackInstallation.organizationId, excludingOrganizationId),
          eq(slackInstallation.status, 'active')
        )
      )
    return Number(row?.count ?? 0)
  },

  async upsert(input: UpsertSlackInstallationInput): Promise<SlackInstallation> {
    const db = await getDb()
    const now = new Date()
    const values = {
      organizationId: input.organizationId,
      slackTeamId: input.slackTeamId,
      slackTeamName: input.slackTeamName,
      slackTeamUrl: input.slackTeamUrl ?? null,
      slackEnterpriseId: input.slackEnterpriseId ?? null,
      slackAppId: input.slackAppId ?? null,
      botUserId: input.botUserId,
      encryptedBotToken: encryptSecret(input.botToken),
      encryptedRefreshToken: input.refreshToken ? encryptSecret(input.refreshToken) : null,
      botTokenExpiresAt: input.botTokenExpiresAt ?? null,
      scopes: input.scopes,
      installedByUserId: input.installedByUserId ?? null,
      installedBySlackUserId: input.installedBySlackUserId ?? null,
      installedAt: now,
      status: 'active' as const,
      statusReason: null,
      lastValidatedAt: now,
      updatedAt: now,
    }
    const [row] = await db
      .insert(slackInstallation)
      .values(values)
      .onConflictDoUpdate({ target: slackInstallation.organizationId, set: values })
      .returning()
    return row
  },

  /**
   * Stores rotated tokens. With `expectedRefreshToken` (the encrypted value the
   * caller redeemed) the write only lands if no one else rotated them first.
   */
  async updateTokens(
    organizationId: string,
    tokens: { botToken: string; refreshToken?: string | null; botTokenExpiresAt?: Date | null },
    options: { expectedRefreshToken?: string } = {}
  ): Promise<SlackInstallation | null> {
    const db = await getDb()
    const [row] = await db
      .update(slackInstallation)
      .set({
        encryptedBotToken: encryptSecret(tokens.botToken),
        ...(tokens.refreshToken
          ? { encryptedRefreshToken: encryptSecret(tokens.refreshToken) }
          : {}),
        botTokenExpiresAt: tokens.botTokenExpiresAt ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(slackInstallation.organizationId, organizationId),
          options.expectedRefreshToken
            ? eq(slackInstallation.encryptedRefreshToken, options.expectedRefreshToken)
            : undefined
        )
      )
      .returning()
    return row ?? null
  },

  async updateSettings(
    organizationId: string,
    settings: SlackInstallationSettings
  ): Promise<SlackInstallation | null> {
    const db = await getDb()
    const update: Partial<SlackInstallation> = { updatedAt: new Date() }
    if (settings.actionsEnabled !== undefined) update.actionsEnabled = settings.actionsEnabled
    if (settings.unfurlsEnabled !== undefined) update.unfurlsEnabled = settings.unfurlsEnabled
    const [row] = await db
      .update(slackInstallation)
      .set(update)
      .where(eq(slackInstallation.organizationId, organizationId))
      .returning()
    return row ?? null
  },

  async markValidated(organizationId: string): Promise<void> {
    const db = await getDb()
    await db
      .update(slackInstallation)
      .set({
        status: 'active',
        statusReason: null,
        lastValidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(slackInstallation.organizationId, organizationId))
  },

  /**
   * Sets the installation's status. With `onlyIfBotToken` (the encrypted token
   * a failed call used) it only applies while that token is still the stored
   * one, so a late failure from an old token cannot revoke a reconnect.
   */
  async markStatus(
    organizationId: string,
    status: SlackInstallationStatus,
    reason: string | null,
    options: { onlyIfBotToken?: string } = {}
  ): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .update(slackInstallation)
      .set({ status, statusReason: reason, updatedAt: new Date() })
      .where(
        and(
          eq(slackInstallation.organizationId, organizationId),
          options.onlyIfBotToken
            ? eq(slackInstallation.encryptedBotToken, options.onlyIfBotToken)
            : undefined
        )
      )
      .returning({ id: slackInstallation.id })
    return rows.length > 0
  },

  /**
   * Slack reported the app was uninstalled or its tokens revoked for a whole
   * workspace. With `occurredAt`, installations made after the event (a
   * reconnect that beat a late event) keep their new tokens.
   */
  async markTeamRevoked(
    slackTeamId: string,
    reason: string,
    options: { occurredAt?: Date } = {}
  ): Promise<number> {
    const db = await getDb()
    // Slack event times have one-second precision; a reconnect in the same
    // second as the event is treated as revoked too (the safe side).
    const installedBefore = options.occurredAt
      ? new Date(options.occurredAt.getTime() + 1000)
      : null
    const rows = await db
      .update(slackInstallation)
      .set({ status: 'revoked', statusReason: reason, updatedAt: new Date() })
      .where(
        and(
          eq(slackInstallation.slackTeamId, slackTeamId),
          eq(slackInstallation.status, 'active'),
          installedBefore ? lt(slackInstallation.installedAt, installedBefore) : undefined
        )
      )
      .returning({ id: slackInstallation.id })
    return rows.length
  },

  async delete(organizationId: string): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .delete(slackInstallation)
      .where(eq(slackInstallation.organizationId, organizationId))
      .returning({ id: slackInstallation.id })
    return rows.length > 0
  },

  /**
   * The organization member whose Durabull account email matches a Slack
   * profile email. Slack actions run as this member.
   */
  async findMemberByEmail(
    organizationId: string,
    email: string
  ): Promise<SlackOrganizationMember | null> {
    const db = await getDb()
    const rows = await db
      .select({ userId: user.id, name: user.name, email: user.email, role: member.role })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, organizationId),
          sql`lower(${user.email}) = lower(${email.trim()})`
        )
      )
      .limit(1)
    return rows[0] ?? null
  },

  async findUserName(userId: string): Promise<string | null> {
    const db = await getDb()
    const rows = await db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return row.name?.trim() || row.email
  },
}
