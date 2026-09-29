import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { linearIssueResolution } from '../db/schemas/linear-issue-resolution/schema'

export type LinearIssueResolutionClaim = 'claimed' | 'busy' | 'completed'

export const linearIssueResolutionRepository = {
  async claim(
    organizationId: string,
    issueId: string,
    claimToken: string,
    leaseMinutes = 15
  ): Promise<LinearIssueResolutionClaim> {
    const db = await getDb()
    const now = new Date()
    const staleBefore = new Date(now.getTime() - leaseMinutes * 60_000)
    return db.transaction(async (tx) => {
      await tx
        .insert(linearIssueResolution)
        .values({ issueId, organizationId })
        .onConflictDoNothing({ target: linearIssueResolution.issueId })

      const [row] = await tx
        .select()
        .from(linearIssueResolution)
        .where(eq(linearIssueResolution.issueId, issueId))
        .for('update')
        .limit(1)
      if (!row || row.organizationId !== organizationId) return 'busy'
      if (row.completedAt) return 'completed'
      if (row.claimToken && row.claimedAt && row.claimedAt >= staleBefore) return 'busy'

      await tx
        .update(linearIssueResolution)
        .set({ claimToken, claimedAt: now, updatedAt: now })
        .where(eq(linearIssueResolution.issueId, issueId))
      return 'claimed'
    })
  },

  async markCompleted(issueId: string, claimToken: string): Promise<boolean> {
    const db = await getDb()
    const now = new Date()
    const rows = await db
      .update(linearIssueResolution)
      .set({ claimToken: null, claimedAt: null, completedAt: now, updatedAt: now })
      .where(
        and(
          eq(linearIssueResolution.issueId, issueId),
          eq(linearIssueResolution.claimToken, claimToken)
        )
      )
      .returning({ issueId: linearIssueResolution.issueId })
    return rows.length > 0
  },

  async release(issueId: string, claimToken: string): Promise<void> {
    const db = await getDb()
    await db
      .update(linearIssueResolution)
      .set({ claimToken: null, claimedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(linearIssueResolution.issueId, issueId),
          eq(linearIssueResolution.claimToken, claimToken)
        )
      )
  },

  async deleteCompletedOlderThan(cutoff: Date, limit = 5_000): Promise<number> {
    const db = await getDb()
    return db.transaction(async (tx) => {
      const expired = await tx
        .select({ issueId: linearIssueResolution.issueId })
        .from(linearIssueResolution)
        .where(
          and(
            isNotNull(linearIssueResolution.completedAt),
            sql`${linearIssueResolution.completedAt} < ${cutoff}`
          )
        )
        .orderBy(asc(linearIssueResolution.completedAt))
        .limit(Math.max(1, Math.min(limit, 10_000)))
        .for('update', { skipLocked: true })
      if (expired.length === 0) return 0
      const deleted = await tx
        .delete(linearIssueResolution)
        .where(
          inArray(
            linearIssueResolution.issueId,
            expired.map((row) => row.issueId)
          )
        )
        .returning({ issueId: linearIssueResolution.issueId })
      return deleted.length
    })
  },
}
