import { createHash } from 'node:crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import { getDb } from '../db/client'
import { slackOauthState } from '../db/schemas/slack-oauth-state/schema'
import type { SlackOauthState } from '../db/schemas/slack-oauth-state/types'

export function hashSlackOauthState(state: string): string {
  return createHash('sha256').update(state).digest('hex')
}

export const slackOauthStateRepository = {
  async create(input: {
    organizationId: string
    userId: string
    state: string
    redirectUri: string
    returnTo?: string
    expiresAt: Date
  }): Promise<SlackOauthState> {
    const db = await getDb()
    const [row] = await db
      .insert(slackOauthState)
      .values({
        organizationId: input.organizationId,
        userId: input.userId,
        stateHash: hashSlackOauthState(input.state),
        redirectUri: input.redirectUri,
        returnTo: input.returnTo ?? 'integrations',
        expiresAt: input.expiresAt,
      })
      .returning()
    return row
  },

  /** Single use: the state row is deleted as it is read. */
  async consumeByState(state: string): Promise<SlackOauthState | null> {
    const db = await getDb()
    const rows = await db
      .delete(slackOauthState)
      .where(
        and(
          eq(slackOauthState.stateHash, hashSlackOauthState(state)),
          gt(slackOauthState.expiresAt, new Date())
        )
      )
      .returning()
    return rows[0] ?? null
  },

  async deleteExpired(): Promise<void> {
    const db = await getDb()
    await db.delete(slackOauthState).where(lt(slackOauthState.expiresAt, new Date()))
  },
}
