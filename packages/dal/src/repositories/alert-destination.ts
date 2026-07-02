import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  type AlertDestinationConfig,
  type AlertDestinationType,
  alertDestination,
} from '../db/schemas/alert-destination/schema'
import type { AlertDestination } from '../db/schemas/alert-destination/types'
import { alertRule } from '../db/schemas/alert-rule/schema'
import { encryptSecret } from '../db/secret-encryption'

export interface CreateAlertDestinationInput {
  organizationId: string
  name: string
  type?: AlertDestinationType
  url?: string | null
  signingSecret?: string | null
  config?: AlertDestinationConfig
  enabled?: boolean
}

export interface UpdateAlertDestinationInput {
  name?: string
  url?: string | null
  signingSecret?: string | null
  config?: AlertDestinationConfig
  enabled?: boolean
}

/** @deprecated Use CreateAlertDestinationInput. */
export type CreateAlertWebhookDestinationInput = CreateAlertDestinationInput
/** @deprecated Use UpdateAlertDestinationInput. */
export type UpdateAlertWebhookDestinationInput = UpdateAlertDestinationInput

function encryptedSigningSecretFromInput(signingSecret: string | null | undefined): string | null {
  if (signingSecret === undefined || signingSecret === null) return null
  const trimmed = signingSecret.trim()
  return trimmed ? encryptSecret(trimmed) : null
}

function assertDestinationShape(
  type: AlertDestinationType,
  url: string | null | undefined,
  config: AlertDestinationConfig | undefined
): void {
  if (type === 'webhook' && !url) {
    throw new Error('Webhook destinations require a URL.')
  }
  if (type === 'email') {
    const target = (config as { target?: unknown } | undefined)?.target
    if (typeof target !== 'string' || !target.includes('@')) {
      throw new Error('Email destinations require a valid target email address.')
    }
  }
}

export const alertDestinationRepository = {
  async listByOrganization(
    organizationId: string,
    options: { type?: AlertDestinationType } = {}
  ): Promise<AlertDestination[]> {
    const db = await getDb()
    return db
      .select()
      .from(alertDestination)
      .where(
        and(
          eq(alertDestination.organizationId, organizationId),
          ...(options.type ? [eq(alertDestination.type, options.type)] : [])
        )
      )
      .orderBy(asc(alertDestination.name))
  },

  async listByIds(ids: string[], organizationId: string): Promise<AlertDestination[]> {
    if (ids.length === 0) return []
    const db = await getDb()
    return db
      .select()
      .from(alertDestination)
      .where(
        and(
          inArray(alertDestination.id, ids),
          eq(alertDestination.organizationId, organizationId)
        )
      )
      .orderBy(asc(alertDestination.name))
  },

  async findById(id: string, organizationId: string): Promise<AlertDestination | null> {
    const db = await getDb()
    const rows = await db
      .select()
      .from(alertDestination)
      .where(and(eq(alertDestination.id, id), eq(alertDestination.organizationId, organizationId)))
      .limit(1)

    return rows[0] ?? null
  },

  async create(input: CreateAlertDestinationInput): Promise<AlertDestination> {
    const type = input.type ?? 'webhook'
    assertDestinationShape(type, input.url, input.config)

    const db = await getDb()
    const [row] = await db
      .insert(alertDestination)
      .values({
        organizationId: input.organizationId,
        name: input.name,
        type,
        url: type === 'webhook' ? (input.url ?? null) : null,
        encryptedSigningSecret:
          input.signingSecret === undefined
            ? null
            : encryptedSigningSecretFromInput(input.signingSecret),
        config: input.config ?? {},
        enabled: input.enabled ?? true,
      })
      .returning()

    return row
  },

  async update(
    id: string,
    organizationId: string,
    input: UpdateAlertDestinationInput
  ): Promise<AlertDestination | null> {
    const db = await getDb()
    const existing = await this.findById(id, organizationId)
    if (!existing) return null

    assertDestinationShape(
      existing.type,
      input.url !== undefined ? input.url : existing.url,
      input.config !== undefined ? input.config : existing.config
    )

    const update: Partial<AlertDestination> = { updatedAt: new Date() }

    if (input.name !== undefined) update.name = input.name
    if (input.url !== undefined) update.url = input.url
    if (input.config !== undefined) update.config = input.config
    if (input.enabled !== undefined) update.enabled = input.enabled
    if (input.signingSecret !== undefined) {
      update.encryptedSigningSecret = encryptedSigningSecretFromInput(input.signingSecret)
    }

    const [row] = await db
      .update(alertDestination)
      .set(update)
      .where(and(eq(alertDestination.id, id), eq(alertDestination.organizationId, organizationId)))
      .returning()

    return row ?? null
  },

  async delete(id: string, organizationId: string): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .delete(alertDestination)
      .where(and(eq(alertDestination.id, id), eq(alertDestination.organizationId, organizationId)))
      .returning({ id: alertDestination.id })

    return rows.length > 0
  },

  async countRuleReferences(id: string, organizationId: string): Promise<number> {
    const db = await getDb()
    // Matches both the generalized {type:'destination'} channel variant and
    // the legacy {type:'webhook', destinationId} saved-webhook variant.
    const result = await db.execute(sql`
      SELECT count(*)::int AS count
      FROM ${alertRule}
      WHERE ${alertRule.organizationId} = ${organizationId}
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(${alertRule.notificationChannels}) AS channel
          WHERE channel->>'type' IN ('webhook', 'destination')
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

/** @deprecated Use alertDestinationRepository. */
export const alertWebhookDestinationRepository = alertDestinationRepository
