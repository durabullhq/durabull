import { and, asc, eq, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { alertRule } from '../db/schemas/alert-rule/schema'
import { alertWebhookDestination } from '../db/schemas/alert-webhook-destination/schema'
import type { AlertWebhookDestination } from '../db/schemas/alert-webhook-destination/types'
import { encryptSecret } from '../db/secret-encryption'

export interface CreateAlertWebhookDestinationInput {
  organizationId: string
  name: string
  url: string
  signingSecret?: string | null
  enabled?: boolean
}

export interface UpdateAlertWebhookDestinationInput {
  name?: string
  url?: string
  signingSecret?: string | null
  enabled?: boolean
}

function encryptedSigningSecretFromInput(signingSecret: string | null | undefined): string | null {
  if (signingSecret === undefined || signingSecret === null) return null
  const trimmed = signingSecret.trim()
  return trimmed ? encryptSecret(trimmed) : null
}

export const alertWebhookDestinationRepository = {
  async listByOrganization(organizationId: string): Promise<AlertWebhookDestination[]> {
    const db = await getDb()
    return db
      .select()
      .from(alertWebhookDestination)
      .where(eq(alertWebhookDestination.organizationId, organizationId))
      .orderBy(asc(alertWebhookDestination.name))
  },

  async findById(id: string, organizationId: string): Promise<AlertWebhookDestination | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(alertWebhookDestination)
      .where(
        and(
          eq(alertWebhookDestination.id, id),
          eq(alertWebhookDestination.organizationId, organizationId)
        )
      )
      .limit(1)

    return rows[0] ?? null
  },

  async create(input: CreateAlertWebhookDestinationInput): Promise<AlertWebhookDestination> {
    const db = await getDb()
    const [row] = await db
      .insert(alertWebhookDestination)
      .values({
        organizationId: input.organizationId,
        name: input.name,
        url: input.url,
        encryptedSigningSecret:
          input.signingSecret === undefined
            ? null
            : encryptedSigningSecretFromInput(input.signingSecret),
        enabled: input.enabled ?? true,
      })
      .returning()

    return row
  },

  async update(
    id: string,
    organizationId: string,
    input: UpdateAlertWebhookDestinationInput
  ): Promise<AlertWebhookDestination | null> {
    const db = await getDb()
    const update: Partial<AlertWebhookDestination> = { updatedAt: new Date() }

    if (input.name !== undefined) update.name = input.name
    if (input.url !== undefined) update.url = input.url
    if (input.enabled !== undefined) update.enabled = input.enabled
    if (input.signingSecret !== undefined) {
      update.encryptedSigningSecret = encryptedSigningSecretFromInput(input.signingSecret)
    }

    const [row] = await db
      .update(alertWebhookDestination)
      .set(update)
      .where(
        and(
          eq(alertWebhookDestination.id, id),
          eq(alertWebhookDestination.organizationId, organizationId)
        )
      )
      .returning()

    return row ?? null
  },

  async delete(id: string, organizationId: string): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .delete(alertWebhookDestination)
      .where(
        and(
          eq(alertWebhookDestination.id, id),
          eq(alertWebhookDestination.organizationId, organizationId)
        )
      )
      .returning({ id: alertWebhookDestination.id })

    return rows.length > 0
  },

  async countRuleReferences(id: string, organizationId: string): Promise<number> {
    const db = await getDb()
    const result = await db.execute(sql`
      SELECT count(*)::int AS count
      FROM ${alertRule}
      WHERE ${alertRule.organizationId} = ${organizationId}
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(${alertRule.notificationChannels}) AS channel
          WHERE channel->>'type' = 'webhook'
            AND channel->>'destinationId' = ${id}
        )
    `)

    const rows = Array.isArray(result)
      ? result
      : typeof result === 'object' &&
          result !== null &&
          Array.isArray((result as { rows?: unknown[] }).rows)
        ? (result as { rows: Array<{ count?: number | string | bigint }> }).rows
        : []

    const count = rows[0]?.count
    return count === undefined ? 0 : Number(count)
  },
}
