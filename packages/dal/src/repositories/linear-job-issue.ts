import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import { alertEvent } from '../db/schemas/alert-event/schema'
import { linearJobIssue } from '../db/schemas/linear-job-issue/schema'
import type { LinearJobIssue } from '../db/schemas/linear-job-issue/types'
import { linearJobIssueEvent } from '../db/schemas/linear-job-issue-event/schema'

export interface CreateLinearJobIssueInput {
  organizationId: string
  connectionId: string
  queueName: string
  jobId: string
  alertEventId: string
  linearIssueId: string
  linearIssueIdentifier: string
  linearIssueUrl: string
}

async function findLinearJobIssueByJob(input: {
  organizationId: string
  connectionId: string
  queueName: string
  jobId: string
}): Promise<LinearJobIssue | null> {
  const db = await getDb()
  const rows = await db
    .select()
    .from(linearJobIssue)
    .where(
      and(
        eq(linearJobIssue.organizationId, input.organizationId),
        eq(linearJobIssue.connectionId, input.connectionId),
        eq(linearJobIssue.queueName, input.queueName),
        eq(linearJobIssue.jobId, input.jobId)
      )
    )
    .limit(1)

  return rows[0] ?? null
}

async function linkIssueToEvent(linearJobIssueId: string, alertEventId: string): Promise<void> {
  const db = await getDb()
  await db
    .insert(linearJobIssueEvent)
    .values({ linearJobIssueId, alertEventId })
    .onConflictDoNothing({
      target: [linearJobIssueEvent.linearJobIssueId, linearJobIssueEvent.alertEventId],
    })
}

export const linearJobIssueRepository = {
  async findByJob(input: {
    organizationId: string
    connectionId: string
    queueName: string
    jobId: string
  }): Promise<LinearJobIssue | null> {
    return findLinearJobIssueByJob(input)
  },

  async createOrGet(input: CreateLinearJobIssueInput): Promise<LinearJobIssue> {
    const db = await getDb()
    const [inserted] = await db
      .insert(linearJobIssue)
      .values({
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        queueName: input.queueName,
        jobId: input.jobId,
        linearIssueId: input.linearIssueId,
        linearIssueIdentifier: input.linearIssueIdentifier,
        linearIssueUrl: input.linearIssueUrl,
      })
      .onConflictDoNothing({
        target: [
          linearJobIssue.organizationId,
          linearJobIssue.connectionId,
          linearJobIssue.queueName,
          linearJobIssue.jobId,
        ],
      })
      .returning()

    if (inserted) {
      await linkIssueToEvent(inserted.id, input.alertEventId)
      return inserted
    }

    const existing = await findLinearJobIssueByJob(input)

    if (!existing) {
      throw new Error('Linear job issue dedupe conflict could not be resolved.')
    }

    await linkIssueToEvent(existing.id, input.alertEventId)
    return existing
  },

  /**
   * Whether any alert event linked to this issue — other than the given ones —
   * is still firing. Used to avoid closing a Linear issue while a related
   * incident remains open.
   */
  async hasOtherFiringEvents(
    linearJobIssueId: string,
    excludeAlertEventIds: string[]
  ): Promise<boolean> {
    const db = await getDb()
    const rows = await db
      .select({ alertEventId: linearJobIssueEvent.alertEventId })
      .from(linearJobIssueEvent)
      .innerJoin(alertEvent, eq(alertEvent.id, linearJobIssueEvent.alertEventId))
      .where(
        and(
          eq(linearJobIssueEvent.linearJobIssueId, linearJobIssueId),
          eq(alertEvent.status, 'firing'),
          ...(excludeAlertEventIds.length > 0
            ? [notInArray(linearJobIssueEvent.alertEventId, excludeAlertEventIds)]
            : [])
        )
      )
      .limit(1)

    return rows.length > 0
  },

  async findByEvent(alertEventId: string): Promise<LinearJobIssue[]> {
    const db = await getDb()
    const links = await db
      .select({ linearJobIssueId: linearJobIssueEvent.linearJobIssueId })
      .from(linearJobIssueEvent)
      .where(eq(linearJobIssueEvent.alertEventId, alertEventId))

    if (links.length === 0) return []

    return db
      .select()
      .from(linearJobIssue)
      .where(
        inArray(
          linearJobIssue.id,
          links.map((link) => link.linearJobIssueId)
        )
      )
  },
}
