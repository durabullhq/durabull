import { randomUUID } from 'node:crypto'
import {
  type AlertEvent,
  type AlertRule,
  alertDeliveryRepository,
  alertEventRepository,
  alertRuleRepository,
  eq,
  getDb,
  type LinearIntegration,
  linearIntegrationRepository,
  linearIssueResolutionRepository,
  linearJobIssueRepository,
  organization,
  redisConnectionRepository,
  type AlertResolutionReason as StoredAlertResolutionReason,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { buildAlertAppUrls } from './alert-app-urls'
import {
  createLinearComment,
  fetchLinearIssueStatus,
  LinearApiError,
  updateLinearIssueState,
} from './linear-client'
import { getValidLinearAccessToken } from './linear-oauth'

const MAX_CONCURRENT_LINEAR_SYNCS = 3
const LINEAR_SYNC_RETRY_BASE_MS = 30_000
const LINEAR_SYNC_RETRY_MAX_MS = 15 * 60_000
// About one day of provider retries. Persist exhausted cleanup so rule deletion
// can finish without repeatedly calling a permanently unavailable integration.
const LINEAR_SYNC_MAX_ATTEMPTS = 100

class LinearIntegrationUnavailableError extends Error {}
const RULE_DELETION_SYNC_BATCH_SIZE = 25
const RULE_DELETION_CONTINUE_DELAY_MS = 1_000
const RULE_DELETION_FAILURE_RETRY_MS = 30_000

export type AlertResolutionReason = { kind: StoredAlertResolutionReason }

/**
 * Drain one bounded batch before finalizing a requested rule deletion. Alert
 * events retain the delivery/link metadata needed for external cleanup until
 * this succeeds; repeated worker sweeps make progress without blocking APIs.
 */
export async function finalizePendingAlertRuleDeletion(
  rule: Pick<AlertRule, 'id'>,
  claimToken: string
): Promise<boolean> {
  try {
    const pending = await alertEventRepository.findPendingLinearResolutionSyncForRule(
      rule.id,
      RULE_DELETION_SYNC_BATCH_SIZE
    )
    if (pending.length > 0) {
      const result = await syncLinearIssuesForResolvedEvents(pending)
      if (result.failedEventIds.length > 0) {
        await alertRuleRepository.releaseDeletionClaim(
          rule.id,
          claimToken,
          new Date(Date.now() + RULE_DELETION_FAILURE_RETRY_MS)
        )
        return false
      }
    }

    const remaining = await alertEventRepository.findPendingLinearResolutionSyncForRule(rule.id, 1)
    if (remaining.length > 0) {
      await alertRuleRepository.releaseDeletionClaim(
        rule.id,
        claimToken,
        new Date(Date.now() + RULE_DELETION_CONTINUE_DELAY_MS)
      )
      return false
    }
    const deleted = await alertRuleRepository.deleteIfDeletionRequested(rule.id, claimToken)
    if (!deleted) {
      await alertRuleRepository.releaseDeletionClaim(
        rule.id,
        claimToken,
        new Date(Date.now() + RULE_DELETION_FAILURE_RETRY_MS)
      )
    }
    return deleted
  } catch (error) {
    await alertRuleRepository.releaseDeletionClaim(
      rule.id,
      claimToken,
      new Date(Date.now() + RULE_DELETION_FAILURE_RETRY_MS)
    )
    throw error
  }
}

interface LinearIssueRef {
  issueId: string
  /** Set when the ref came from the job→issue mapping table. */
  linearJobIssueId?: string
}

/**
 * Close the Linear issues associated with alert events that were just resolved
 * in Durabull: move each issue to its team's "completed" workflow state and add
 * a comment explaining why. Provider failures leave the durable outbox pending
 * for retry; resolution in Durabull remains the source of truth.
 */
export async function syncLinearIssuesForResolvedEvents(
  events: AlertEvent[],
  reason?: AlertResolutionReason
): Promise<{ failedEventIds: string[] }> {
  if (events.length === 0) return { failedEventIds: [] }
  const claimToken = randomUUID()

  const integrationCache = new Map<
    string,
    { integration: LinearIntegration; accessToken: string } | null
  >()
  const connectionNameCache = new Map<string, string>()
  const organizationSlugCache = new Map<string, string | null>()
  const issueSyncs = new Map<string, Promise<void>>()
  const failedEventIds = new Set<string>()

  await processWithConcurrency(events, MAX_CONCURRENT_LINEAR_SYNCS, async (event) => {
    const claimedEvent = await alertEventRepository.claimLinearResolutionSync(event.id, claimToken)
    if (!claimedEvent) {
      failedEventIds.add(event.id)
      return
    }

    try {
      const issueRefs = await collectLinearIssueRefs(claimedEvent)
      if (issueRefs.length === 0) {
        await alertEventRepository.clearLinearResolutionSyncPending([event.id], claimToken)
        return
      }

      const auth = await getCachedLinearAuth(claimedEvent.organizationId, integrationCache)
      if (!auth) {
        throw new LinearIntegrationUnavailableError(
          'Linear integration is unavailable for a linked incident.'
        )
      }

      const issueFailures: unknown[] = []
      for (const ref of issueRefs) {
        const syncKey = `${claimedEvent.organizationId}:${ref.issueId}`
        const existingSync = issueSyncs.get(syncKey)
        if (existingSync) {
          try {
            await existingSync
          } catch (error) {
            issueFailures.push(error)
          }
          continue
        }

        const issueSync = (async () => {
          const issueClaimToken = `${claimToken}:${ref.issueId}`
          const issueClaim = await linearIssueResolutionRepository.claim(
            claimedEvent.organizationId,
            ref.issueId,
            issueClaimToken
          )
          if (issueClaim === 'completed') return
          if (issueClaim === 'busy') {
            throw new Error(`Linear issue ${ref.issueId} is already being synchronized.`)
          }

          let completed = false
          try {
            // A single Linear issue can be linked to several incidents for the same
            // job. Don't close it while any of those incidents is still firing.
            if (ref.linearJobIssueId) {
              const stillFiring = await linearJobIssueRepository.hasOtherFiringEvents(
                ref.linearJobIssueId,
                events.map((resolved) => resolved.id)
              )
              if (stillFiring) return
            }

            await completeLinearIssue({
              accessToken: auth.accessToken,
              issueId: ref.issueId,
              issueClaimToken,
              event: claimedEvent,
              reason: reason ?? {
                kind: claimedEvent.linearResolutionReason ?? 'legacy',
              },
              connectionName: await getConnectionName(
                claimedEvent.connectionId,
                connectionNameCache
              ),
              organizationSlug: await getCachedOrganizationSlug(
                claimedEvent.organizationId,
                organizationSlugCache
              ),
            })
            completed = await linearIssueResolutionRepository.markCompleted(
              ref.issueId,
              issueClaimToken
            )
            if (!completed) throw new Error(`Lost the Linear issue lease for ${ref.issueId}.`)
          } finally {
            if (!completed) {
              await linearIssueResolutionRepository.release(ref.issueId, issueClaimToken)
            }
          }
        })()
        issueSyncs.set(syncKey, issueSync)
        try {
          await issueSync
        } catch (error) {
          if (issueSyncs.get(syncKey) === issueSync) issueSyncs.delete(syncKey)
          issueFailures.push(error)
        }
      }
      if (issueFailures.length > 0) {
        // Try every linked issue before finishing the event. One deleted issue
        // must not discard cleanup metadata for other healthy destinations.
        // Keep the event retryable while any independent cleanup can recover.
        throw issueFailures.find((error) => !isPermanentLinearFailure(error)) ?? issueFailures[0]
      }
      await alertEventRepository.clearLinearResolutionSyncPending([event.id], claimToken)
    } catch (error) {
      const exhausted = claimedEvent.linearResolutionAttempts + 1 >= LINEAR_SYNC_MAX_ATTEMPTS
      const permanent =
        error instanceof LinearIntegrationUnavailableError || isPermanentLinearFailure(error)
      if (exhausted || permanent) {
        // Persist a safe category rather than provider text, which can include
        // credentials or customer data. A late successful delivery may re-arm it.
        await alertEventRepository.abandonLinearResolutionSync(
          [event.id],
          claimToken,
          error instanceof LinearIntegrationUnavailableError
            ? 'Linear integration disconnected.'
            : exhausted
              ? 'Linear cleanup retry limit reached.'
              : 'Linear rejected incident cleanup permanently.'
        )
        console.error('[alert-resolution] Linear cleanup abandoned:', { alertEventId: event.id })
        return
      }
      failedEventIds.add(event.id)
      const retryDelayMs = Math.min(
        LINEAR_SYNC_RETRY_MAX_MS,
        LINEAR_SYNC_RETRY_BASE_MS * 2 ** Math.min(claimedEvent.linearResolutionAttempts, 10)
      )
      await alertEventRepository.releaseLinearResolutionSyncClaims(
        [event.id],
        claimToken,
        new Date(
          Math.max(
            Date.now() + retryDelayMs,
            error instanceof LinearApiError ? (error.rateLimitResetAt?.getTime() ?? 0) : 0
          )
        )
      )
      console.error('[alert-resolution] Linear sync failed for event:', {
        alertEventId: event.id,
        error,
      })
    }
  })

  return { failedEventIds: Array.from(failedEventIds) }
}

function isPermanentLinearFailure(error: unknown): boolean {
  return (
    error instanceof LinearApiError &&
    !error.retryable &&
    error.status !== 401 &&
    error.status !== 403
  )
}

async function collectLinearIssueRefs(event: AlertEvent): Promise<LinearIssueRef[]> {
  const refs = new Map<string, LinearIssueRef>()
  // Resolved incidents no longer need notifications. Reclaim only due work
  // using the normal delivery lease policy, so crashed delivery workers cannot
  // hold cleanup forever when notification dispatch is disabled.
  const obsoleteDeliveries = await alertDeliveryRepository.claimDueForEvent(event.id)
  for (const delivery of obsoleteDeliveries) {
    if (!delivery.claimedAt) throw new Error('Alert delivery claim is missing its lease timestamp.')
    await alertDeliveryRepository.markFailed(delivery.id, {
      error: 'Alert incident resolved before delivery.',
      retryable: false,
      expectedClaimedAt: delivery.claimedAt,
    })
  }

  const deliveries = await alertDeliveryRepository.listByEvent(event.id)
  for (const delivery of deliveries) {
    // A provider request can finish after the incident is resolved. Until it
    // records its issue ID, treating this event as synchronized would lose the
    // cleanup work and could allow rule deletion to cascade its delivery row.
    if (
      delivery.status === 'claimed' &&
      (delivery.channelType === 'linear' || delivery.channelType === 'destination')
    ) {
      throw new Error('A notification delivery is still in flight for this incident.')
    }
  }

  // Read mappings after delivery state: a completed job delivery must have
  // persisted its mapping, including the link needed to check firing peers.
  const jobIssues = await linearJobIssueRepository.findByEvent(event.id)
  for (const issue of jobIssues) {
    refs.set(issue.linearIssueId, {
      issueId: issue.linearIssueId,
      linearJobIssueId: issue.id,
    })
  }

  // Rule-level events (no jobId) record their Linear issue on the delivery row
  // instead of the job→issue mapping table.
  for (const delivery of deliveries) {
    const metadata =
      delivery.providerMetadata && typeof delivery.providerMetadata === 'object'
        ? delivery.providerMetadata
        : {}
    const isLinearDelivery =
      delivery.channelType === 'linear' ||
      (delivery.channelType === 'destination' && metadata.resolvedType === 'linear')
    if (!isLinearDelivery || delivery.status !== 'delivered') continue
    if (typeof delivery.externalId !== 'string' || delivery.externalId.length === 0) continue
    if (refs.has(delivery.externalId)) continue
    refs.set(delivery.externalId, { issueId: delivery.externalId })
  }

  return Array.from(refs.values())
}

async function completeLinearIssue({
  accessToken,
  issueId,
  issueClaimToken,
  event,
  reason,
  connectionName,
  organizationSlug,
}: {
  accessToken: string
  issueId: string
  issueClaimToken?: string
  event: AlertEvent
  reason: AlertResolutionReason
  connectionName: string
  organizationSlug: string | null
}): Promise<void> {
  const status = await fetchLinearIssueStatus(accessToken, issueId)
  if (status.state.type === 'canceled') return

  let commentId = issueClaimToken
    ? await linearIssueResolutionRepository.findCommentId(issueId, issueClaimToken)
    : null
  // An operator may have completed the issue independently. Only finish a
  // comment when our durable ledger shows that we started its resolution.
  if (status.state.type === 'completed' && !commentId) return

  if (status.state.type !== 'completed') {
    const completedState = status.teamStates
      .filter((state) => state.type === 'completed')
      .sort((a, b) => a.position - b.position)[0]
    if (!completedState) {
      throw new Error(`Linear issue ${issueId} has no completed workflow state available.`)
    }

    // Save comment progress before changing external state. A retry must still
    // post the comment when the issue state changed but its request failed.
    commentId = issueClaimToken
      ? await linearIssueResolutionRepository.prepareComment(issueId, issueClaimToken)
      : randomUUID()
    if (!commentId) throw new Error(`Lost the Linear issue lease for ${issueId}.`)
    await updateLinearIssueState(accessToken, issueId, completedState.id)
  }

  await createLinearComment(
    accessToken,
    issueId,
    buildResolutionComment({ event, reason, connectionName, organizationSlug }),
    commentId ?? undefined
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
    connectionWide: event.type === 'redis_health',
  })

  const reasonLine =
    reason.kind === 'auto_job_completed'
      ? `Durabull auto-resolved this incident because job \`${safeLinearMarkdown(jobId ?? 'unknown', 100)}\` completed successfully.`
      : reason.kind === 'auto_condition_cleared'
        ? 'Durabull auto-resolved this incident because the alert condition is no longer met.'
        : reason.kind === 'rule_changed'
          ? 'Durabull resolved this incident because its alert rule was disabled, edited, or deleted.'
          : reason.kind === 'legacy'
            ? 'This incident was previously resolved in Durabull; its original resolution reason was not recorded.'
            : 'This incident was marked resolved by an operator in Durabull.'

  const lines = [
    '✅ **Incident resolved in Durabull**',
    '',
    reasonLine,
    '',
    `- Connection: ${safeLinearMarkdown(connectionName, 200)}`,
    `- ${event.type === 'redis_health' ? 'Scope' : 'Queue'}: ${safeLinearMarkdown(event.queueName, 200)}`,
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
    const scopes = integration.scopes.split(/[\s,]+/)
    if (!scopes.includes('write') && !scopes.includes('admin')) {
      // Refreshing a creation-only token cannot grant issue-update permission.
      // Keep cleanup retryable while the operator reconnects the integration.
      throw new LinearApiError('Reconnect Linear to grant incident cleanup permissions.', {
        status: 403,
        retryable: false,
      })
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
    throw error
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

  const results = await Promise.allSettled(workers)
  const failure = results.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
}

export const __alertResolutionTestUtils = {
  collectLinearIssueRefs,
  buildResolutionComment,
  completeLinearIssue,
}
