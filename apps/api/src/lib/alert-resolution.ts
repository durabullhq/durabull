import {
  type AlertEvent,
  alertDeliveryRepository,
  eq,
  getDb,
  linearIntegrationRepository,
  linearJobIssueRepository,
  organization,
  redisConnectionRepository,
  type LinearIntegration,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { buildAlertAppUrls } from './alert-app-urls'
import {
  createLinearComment,
  fetchLinearIssueStatus,
  updateLinearIssueState,
} from './linear-client'
import { getValidLinearAccessToken } from './linear-oauth'

const MAX_CONCURRENT_LINEAR_SYNCS = 3

export type AlertResolutionReason =
  | { kind: 'manual' }
  | { kind: 'auto_job_completed' }
  | { kind: 'auto_condition_cleared' }

interface LinearIssueRef {
  issueId: string
  /** Set when the ref came from the job→issue mapping table. */
  linearJobIssueId?: string
}

/**
 * Close the Linear issues associated with alert events that were just resolved
 * in Durabull: move each issue to its team's "completed" workflow state and add
 * a comment explaining why. Best-effort — failures are logged, never thrown, so
 * resolution in Durabull (the source of truth) always wins.
 */
export async function syncLinearIssuesForResolvedEvents(
  events: AlertEvent[],
  reason: AlertResolutionReason
): Promise<void> {
  if (events.length === 0) return

  const integrationCache = new Map<
    string,
    { integration: LinearIntegration; accessToken: string } | null
  >()
  const connectionNameCache = new Map<string, string>()
  const organizationSlugCache = new Map<string, string | null>()
  const completedIssueIds = new Set<string>()

  await processWithConcurrency(events, MAX_CONCURRENT_LINEAR_SYNCS, async (event) => {
    try {
      const issueRefs = await collectLinearIssueRefs(event)
      if (issueRefs.length === 0) return

      const auth = await getCachedLinearAuth(event.organizationId, integrationCache)
      if (!auth) return

      for (const ref of issueRefs) {
        if (completedIssueIds.has(ref.issueId)) continue

        // A single Linear issue can be linked to several incidents for the same
        // job. Don't close it while any of those incidents is still firing.
        if (ref.linearJobIssueId) {
          const stillFiring = await linearJobIssueRepository.hasOtherFiringEvents(
            ref.linearJobIssueId,
            events.map((resolved) => resolved.id)
          )
          if (stillFiring) continue
        }

        completedIssueIds.add(ref.issueId)
        await completeLinearIssue({
          accessToken: auth.accessToken,
          issueId: ref.issueId,
          event,
          reason,
          connectionName: await getConnectionName(event.connectionId, connectionNameCache),
          organizationSlug: await getCachedOrganizationSlug(
            event.organizationId,
            organizationSlugCache
          ),
        })
      }
    } catch (error) {
      console.error('[alert-resolution] Linear sync failed for event:', {
        alertEventId: event.id,
        error,
      })
    }
  })
}

async function collectLinearIssueRefs(event: AlertEvent): Promise<LinearIssueRef[]> {
  const refs = new Map<string, LinearIssueRef>()

  const jobIssues = await linearJobIssueRepository.findByEvent(event.id)
  for (const issue of jobIssues) {
    refs.set(issue.linearIssueId, {
      issueId: issue.linearIssueId,
      linearJobIssueId: issue.id,
    })
  }

  // Rule-level events (no jobId) record their Linear issue on the delivery row
  // instead of the job→issue mapping table.
  const deliveries = await alertDeliveryRepository.listByEvent(event.id)
  for (const delivery of deliveries) {
    if (delivery.channelType !== 'linear' || delivery.status !== 'delivered') continue
    if (typeof delivery.externalId !== 'string' || delivery.externalId.length === 0) continue
    if (refs.has(delivery.externalId)) continue
    refs.set(delivery.externalId, { issueId: delivery.externalId })
  }

  return Array.from(refs.values())
}

async function completeLinearIssue({
  accessToken,
  issueId,
  event,
  reason,
  connectionName,
  organizationSlug,
}: {
  accessToken: string
  issueId: string
  event: AlertEvent
  reason: AlertResolutionReason
  connectionName: string
  organizationSlug: string | null
}): Promise<void> {
  const status = await fetchLinearIssueStatus(accessToken, issueId)
  if (status.state.type === 'completed' || status.state.type === 'canceled') {
    return
  }

  const completedState = status.teamStates
    .filter((state) => state.type === 'completed')
    .sort((a, b) => a.position - b.position)[0]
  if (!completedState) {
    console.warn('[alert-resolution] Linear team has no completed workflow state:', {
      issueId,
      alertEventId: event.id,
    })
    return
  }

  await updateLinearIssueState(accessToken, issueId, completedState.id)
  await createLinearComment(
    accessToken,
    issueId,
    buildResolutionComment({ event, reason, connectionName, organizationSlug })
  )
  console.log(
    `[alert-resolution] Completed Linear issue ${status.identifier} for alert event ${event.id}`
  )
}

function buildResolutionComment({
  event,
  reason,
  connectionName,
  organizationSlug,
}: {
  event: AlertEvent
  reason: AlertResolutionReason
  connectionName: string
  organizationSlug: string | null
}): string {
  const jobId = getJobId(event.context)
  const { jobUrl, dashboardUrl } = buildAlertAppUrls({
    appBaseUrl: env.APP_BASE_URL,
    organizationSlug,
    connectionId: event.connectionId,
    queueName: event.queueName,
    alertRuleId: event.alertRuleId,
    jobId,
  })

  const reasonLine =
    reason.kind === 'auto_job_completed'
      ? `Durabull auto-resolved this incident because job \`${safeLinearMarkdown(jobId ?? 'unknown', 100)}\` completed successfully.`
      : reason.kind === 'auto_condition_cleared'
        ? 'Durabull auto-resolved this incident because the alert condition is no longer met.'
        : 'This incident was marked resolved by an operator in Durabull.'

  const lines = [
    '✅ **Incident resolved in Durabull**',
    '',
    reasonLine,
    '',
    `- Connection: ${safeLinearMarkdown(connectionName, 200)}`,
    `- Queue: ${safeLinearMarkdown(event.queueName, 200)}`,
    `- Incident: ${safeLinearMarkdown(event.summary)}`,
    `- Fired at: ${event.firedAt.toISOString()}`,
    `- Resolved at: ${(event.resolvedAt ?? new Date()).toISOString()}`,
  ]
  if (jobId) lines.push(`- Job ID: ${safeLinearMarkdown(jobId, 100)}`)
  lines.push('', `[Open in Durabull](${jobId ? jobUrl : dashboardUrl})`)

  return lines.join('\n')
}

function getJobId(context: unknown): string | null {
  const source =
    typeof context === 'object' && context !== null ? (context as Record<string, unknown>) : {}
  return typeof source.jobId === 'string' ? source.jobId : null
}

async function getCachedLinearAuth(
  organizationId: string,
  cache: Map<string, { integration: LinearIntegration; accessToken: string } | null>
): Promise<{ integration: LinearIntegration; accessToken: string } | null> {
  const cached = cache.get(organizationId)
  if (cached !== undefined) return cached

  try {
    const integration = await linearIntegrationRepository.findByOrganization(organizationId)
    if (!integration) {
      cache.set(organizationId, null)
      return null
    }
    const accessToken = await getValidLinearAccessToken(integration)
    const auth = { integration, accessToken }
    cache.set(organizationId, auth)
    return auth
  } catch (error) {
    console.error('[alert-resolution] Failed to load Linear integration:', {
      organizationId,
      error,
    })
    cache.set(organizationId, null)
    return null
  }
}

async function getConnectionName(
  connectionId: string,
  cache: Map<string, string>
): Promise<string> {
  const cached = cache.get(connectionId)
  if (cached !== undefined) return cached

  const connection = await redisConnectionRepository.findByIdUnsafe(connectionId)
  const name = connection?.name ?? 'Unknown connection'
  cache.set(connectionId, name)
  return name
}

async function getCachedOrganizationSlug(
  organizationId: string,
  cache: Map<string, string | null>
): Promise<string | null> {
  const cached = cache.get(organizationId)
  if (cached !== undefined) return cached

  const db = await getDb()
  const rows = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)

  const slug = rows[0]?.slug ?? null
  cache.set(organizationId, slug)
  return slug
}

function safeLinearMarkdown(value: string, maxLength = 1000): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  const truncated =
    normalized.length > maxLength
      ? `${normalized.slice(0, Math.max(0, maxLength - 1))}...`
      : normalized
  return truncated.replace(/([\\`*_{}[\]()#+\-.!>])/g, '\\$1')
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return

  const queue = [...items]
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) return
      await worker(item)
    }
  })

  await Promise.all(workers)
}

export const __alertResolutionTestUtils = {
  collectLinearIssueRefs,
  buildResolutionComment,
  completeLinearIssue,
}
