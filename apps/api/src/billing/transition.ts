import {
  type CapacityLimitKey,
  CLOUD_PRICING_URL,
  dueTransitionReminder,
  exceededLimits,
  FEATURE_KEYS,
  FEATURE_LABELS,
  type FeatureKey,
  formatTransitionDeadline,
  HISTORY_RECOVERY_WINDOW_MS,
  LIMIT_LABELS,
  PLAN_CHOSEN_SUBSCRIPTION_STATUSES,
  PLANS,
  type PlanCode,
  requiredPlanForFeature,
  type SubscriptionStatus,
  smallestPlanForUsage,
} from '@durabull/billing'
import { type BillingNoticeKind, billingRepository } from '@durabull/dal'
import {
  BillingEmailError,
  type BillingTransitionEmailProps,
  sendBillingTransitionEmail,
} from '@durabull/email'
import { getBillingConfig, getBillingUrl } from './config'
import { materializeEntitlement } from './entitlements'
import { getBillingGateway } from './gateway'
import { reconcileOrganization } from './reconcile'

/**
 * Beta-to-paid transition. Organizations created before launch keep full
 * access until their migration grant ends; this module tells their owners
 * (notice once, then reminders 7 days and 1 day before the grant ends) and
 * gives every organization a Stripe Customer ahead of purchase.
 */

/** A claimed email still marked `sending` after this long is retried with the same idempotency key. */
const STALE_SEND_MS = 60 * 60 * 1000
/** Resources named per limit in the email before "and N more". */
const NAMED_RESOURCES = 5

export type TransitionEmailSender = (
  email: BillingTransitionEmailProps & { to: string; idempotencyKey: string }
) => Promise<{ id: string | null }>

let sender: TransitionEmailSender = sendBillingTransitionEmail

export function setTransitionEmailSenderForTests(next: TransitionEmailSender | null): void {
  sender = next ?? sendBillingTransitionEmail
}

export interface TransitionAudienceEntry {
  organizationId: string
  organizationName: string
  organizationSlug: string
  deadline: Date
  owners: Array<{ userId: string; email: string }>
  proposedPlan: PlanCode
  restrictions: string[]
  featuresInUse: FeatureKey[]
}

function hasChosenPlan(status: string | undefined): boolean {
  return status !== undefined && PLAN_CHOSEN_SUBSCRIPTION_STATUSES.has(status as SubscriptionStatus)
}

function nameList(names: string[]): string {
  const shown = names.slice(0, NAMED_RESOURCES).join(', ')
  const more = names.length - NAMED_RESOURCES
  return more > 0 ? `${shown} and ${more} more` : shown
}

/**
 * Organizations on an unexpired beta grant that have not chosen a plan, with
 * what the Free plan would change for each. An organization that subscribed
 * during the grant still resolves to the (larger) grant until it ends, so the
 * subscription is checked explicitly.
 */
export async function listTransitionAudience(now = new Date()): Promise<TransitionAudienceEntry[]> {
  const organizations = await billingRepository.listMigrationGrantOrganizations(now)
  const audience: TransitionAudienceEntry[] = []
  for (const org of organizations) {
    const subscription = await billingRepository.findCurrentSubscription(org.id)
    if (hasChosenPlan(subscription?.status)) continue
    const [owners, usage, candidates] = await Promise.all([
      billingRepository.listOwners(org.id),
      billingRepository.getUsage(org.id),
      billingRepository.listCapacityCandidates(org.id),
    ])
    const namesByLimit: Record<CapacityLimitKey, string[]> = {
      'connections.enabled': candidates.connections.map((c) => c.name),
      'members.reserved': [
        ...candidates.members.map((m) => m.name || m.email),
        ...candidates.invitations.map((i) => `${i.email} (invited)`),
      ],
      'alerts.enabled': candidates.rules.map((r) => r.name),
      'alerts.destinations': candidates.destinations.map((d) => d.name),
      'service_accounts.enabled': candidates.serviceAccounts.map((a) => a.name),
    }
    const featuresInUse: FeatureKey[] = []
    if (candidates.destinations.some((d) => d.type === 'webhook'))
      featuresInUse.push('alerts.webhook')
    if (candidates.destinations.some((d) => d.type === 'linear'))
      featuresInUse.push('alerts.linear')
    if (candidates.serviceAccounts.length > 0) featuresInUse.push('automation.service_accounts')
    const restrictions = exceededLimits(PLANS.free.limits, usage)
      // Service accounts stop as a feature on Free; listing the count too would repeat it.
      .filter(({ limit }) => limit !== 'service_accounts.enabled')
      .map(
        ({ limit, usage: used, allowed }) =>
          `${LIMIT_LABELS[limit].name}: ${used} in use (${nameList(namesByLimit[limit])}); Free includes ${allowed}, and you choose which stay active`
      )
    audience.push({
      organizationId: org.id,
      organizationName: org.name,
      organizationSlug: org.slug,
      deadline: org.migrationGrantExpiresAt,
      owners: owners.map((owner) => ({ userId: owner.userId, email: owner.email })),
      proposedPlan: smallestPlanForUsage(usage),
      restrictions,
      featuresInUse,
    })
  }
  return audience
}

function planLabel(code: PlanCode): string {
  const price = PLANS[code].monthlyPriceUsd
  return price ? `${PLANS[code].name} ($${price}/month)` : PLANS[code].name
}

function priceSummary(): string {
  const { team, business } = PLANS
  const monthsFree =
    team.monthlyPriceUsd && team.annualPriceUsd
      ? Math.round(12 - team.annualPriceUsd / team.monthlyPriceUsd)
      : 0
  const annual = monthsFree > 0 ? `, with ${monthsFree} months free on annual billing` : ''
  return `${team.name} is $${team.monthlyPriceUsd}/month and ${business.name} is $${business.monthlyPriceUsd}/month per organization, not per seat${annual}.`
}

function historyNote(): string {
  const freeDays = PLANS.free.limits['history.redis_health_days'] ?? 0
  const window = freeDays === 1 ? '24 hours' : `${freeDays} days`
  const recoveryDays = Math.round(HISTORY_RECOVERY_WINDOW_MS / (24 * 60 * 60 * 1000))
  return `Redis health history on Free covers the last ${window}; older history is kept for ${recoveryDays} more days in case you upgrade, then removed.`
}

function emailFor(
  entry: TransitionAudienceEntry,
  kind: BillingNoticeKind
): BillingTransitionEmailProps {
  // Every paid capability unlocks on the same plan; name it from the catalog.
  const paidPlan = PLANS[requiredPlanForFeature(FEATURE_KEYS[0])]
  return {
    kind,
    organizationName: entry.organizationName,
    deadlineLabel: formatTransitionDeadline(entry.deadline),
    billingUrl: getBillingUrl(entry.organizationSlug),
    pricingUrl: CLOUD_PRICING_URL,
    proposedPlan: planLabel(entry.proposedPlan),
    paidPlanName: paidPlan.name,
    priceSummary: priceSummary(),
    restrictions: entry.restrictions,
    featuresInUse: entry.featuresInUse.map((feature) => FEATURE_LABELS[feature].name),
    paidFeatures: FEATURE_KEYS.map((feature) => FEATURE_LABELS[feature].name),
    historyNote: historyNote(),
  }
}

/**
 * Organizations created before launch whose stored entitlement never decided
 * the beta grant, usually because it was materialized before the launch dates
 * were configured. They are missing from the audience until recomputed. With
 * `execute`, recompute them so eligible ones get their grant; a dry run only
 * lists them.
 */
export async function refreshGrantEligibility(options: {
  execute: boolean
  now?: Date
}): Promise<{ pending: Array<{ id: string; name: string }>; refreshed: number }> {
  const { launchAt, migrationGrantUntil } = getBillingConfig()
  const now = options.now ?? new Date()
  if (!launchAt || !migrationGrantUntil || migrationGrantUntil.getTime() <= now.getTime()) {
    return { pending: [], refreshed: 0 }
  }
  const pending = await billingRepository.listOrganizationsWithoutMigrationGrant(launchAt)
  if (!options.execute) return { pending, refreshed: 0 }
  for (const { id } of pending) {
    await materializeEntitlement(id, { reason: 'transition_launch', now })
  }
  return { pending, refreshed: pending.length }
}

export interface StripeCustomerSyncResult {
  created: number
  reconciled: number
  skipped: number
  failed: Array<{ organizationId: string; error: string }>
}

/**
 * Give every organization a Stripe Customer bound to it (contact: the founding
 * owner), and reconcile those that already have one. A fixed idempotency key
 * per organization (separate from Checkout's, whose parameters differ) means
 * retries reuse one Customer.
 */
export async function syncStripeCustomers(options: {
  execute: boolean
}): Promise<StripeCustomerSyncResult> {
  const result: StripeCustomerSyncResult = { created: 0, reconciled: 0, skipped: 0, failed: [] }
  for (const { id } of await billingRepository.listAllOrganizationIds()) {
    try {
      if (await billingRepository.findAccount(id)) {
        if (options.execute) await reconcileOrganization(id, { reason: 'transition_sync' })
        result.reconciled += 1
        continue
      }
      const [organization, owners] = await Promise.all([
        billingRepository.findOrganization(id),
        billingRepository.listOwners(id),
      ])
      const founder = owners[0]
      if (!organization || !founder) {
        result.skipped += 1
        continue
      }
      if (!options.execute) {
        result.created += 1
        continue
      }
      const created = await billingRepository.withOrganizationLock(id, async () => {
        if (await billingRepository.findAccount(id)) return false
        const customer = await getBillingGateway().createCustomer({
          organizationId: id,
          organizationName: organization.name,
          email: founder.email,
          idempotencyKey: `durabull-customer-sync-${id}`,
        })
        await billingRepository.bindAccount({
          organizationId: id,
          stripeCustomerId: customer.id,
          livemode: customer.livemode,
          billingContactUserId: founder.userId,
        })
        return true
      })
      if (created) result.created += 1
      else result.reconciled += 1
    } catch (error) {
      result.failed.push({ organizationId: id, error: (error as Error).message })
    }
  }
  return result
}

export interface NoticeSendResult {
  sent: number
  alreadySent: number
  failed: Array<{ organizationId: string; email: string; error: string }>
  /** Organizations at least one owner of which received an email in this pass. */
  delivered: Set<string>
}

function emptyResult(): NoticeSendResult {
  return { sent: 0, alreadySent: 0, failed: [], delivered: new Set() }
}

async function sendNotice(
  entry: TransitionAudienceEntry,
  kind: BillingNoticeKind,
  now: Date,
  result: NoticeSendResult
): Promise<void> {
  const email = emailFor(entry, kind)
  for (const owner of entry.owners) {
    const claim = await billingRepository.claimNoticeDelivery({
      organizationId: entry.organizationId,
      kind,
      userId: owner.userId,
      email: owner.email,
      now,
      staleBefore: new Date(now.getTime() - STALE_SEND_MS),
    })
    if (!claim) {
      result.alreadySent += 1
      continue
    }
    const failed = (error: string) =>
      result.failed.push({ organizationId: entry.organizationId, email: owner.email, error })
    let providerMessageId: string | null
    try {
      const sent = await sender({
        ...email,
        to: owner.email,
        idempotencyKey: `durabull-billing-notice-${claim.idempotencyKey}`,
      })
      providerMessageId = sent.id
    } catch (error) {
      const message = (error as Error).message
      if (error instanceof BillingEmailError && error.uncertain) {
        // The provider may have accepted it: leave the claim in `sending` so
        // the retry after STALE_SEND_MS reuses the key instead of a new one.
        failed(`${message} (delivery uncertain; retried later with the same key)`)
        continue
      }
      failed(message)
      try {
        await billingRepository.completeNoticeDelivery(claim, { sent: false, error: message }, now)
      } catch (recordError) {
        failed(`Recording the failure also failed: ${(recordError as Error).message}`)
      }
      continue
    }
    // The email went out. If recording that fails, the claim stays `sending`
    // and a retry after STALE_SEND_MS reuses the key, so it is not delivered twice.
    result.sent += 1
    result.delivered.add(entry.organizationId)
    try {
      await billingRepository.completeNoticeDelivery(claim, { sent: true, providerMessageId }, now)
    } catch (error) {
      failed(`Sent, but recording the delivery failed: ${(error as Error).message}`)
    }
  }
}

/** Send the transition notice to every owner of every organization on a beta grant, once. */
export async function sendTransitionNotices(now = new Date()): Promise<NoticeSendResult> {
  const result = emptyResult()
  for (const entry of await listTransitionAudience(now)) {
    await sendNotice(entry, 'transition_notice', now, result)
  }
  return result
}

/**
 * Follow-up pass after the launch: retries notices that failed (and reaches
 * owners added since), then sends reminders that are due. Only organizations
 * whose notice was already attempted take part, so nothing goes out before an
 * operator runs the launch command, and reminders keep a gap after the notice.
 */
export async function sendDueReminders(now = new Date()): Promise<NoticeSendResult> {
  const result = emptyResult()
  for (const entry of await listTransitionAudience(now)) {
    const before = await billingRepository.findNoticeProgress(
      entry.organizationId,
      'transition_notice'
    )
    if (!before.attempted) continue
    await sendNotice(entry, 'transition_notice', now, result)
    // Per owner: an owner added later gets the notice first and their own
    // reminder gap, not the organization's earliest notice time.
    const deliveries = await billingRepository.listNoticeDeliveries(entry.organizationId)
    for (const owner of entry.owners) {
      const noticeSentAt = deliveries.find(
        (delivery) =>
          delivery.kind === 'transition_notice' &&
          delivery.userId === owner.userId &&
          delivery.status === 'sent'
      )?.sentAt
      if (!noticeSentAt) continue
      const reminder = dueTransitionReminder(entry.deadline, noticeSentAt, now)
      if (reminder) await sendNotice({ ...entry, owners: [owner] }, reminder, now, result)
    }
  }
  return result
}

/**
 * Beta transition state for the in-app banner: shown only once the notice has
 * gone out, and only while access comes from the grant (an operator override
 * can outlast it) and the organization has not chosen a plan.
 */
export async function getTransitionStatus(
  organizationId: string,
  entitlement: { source: string; migrationGrantExpiresAt: Date | null },
  subscriptionStatus: string | undefined,
  now = new Date()
): Promise<{ deadline: string; noticeSentAt: string } | null> {
  const { migrationGrantExpiresAt } = entitlement
  if (entitlement.source !== 'migration_grant') return null
  if (!migrationGrantExpiresAt || migrationGrantExpiresAt.getTime() <= now.getTime()) return null
  if (hasChosenPlan(subscriptionStatus)) return null
  const { firstSentAt } = await billingRepository.findNoticeProgress(
    organizationId,
    'transition_notice'
  )
  if (!firstSentAt) return null
  return {
    deadline: migrationGrantExpiresAt.toISOString(),
    noticeSentAt: firstSentAt.toISOString(),
  }
}
