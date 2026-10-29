import { exceededLimits, LIMIT_LABELS, PLANS } from '@durabull/billing'
import { billingRepository } from '@durabull/dal'
import {
  type BillingTransitionEmailKind,
  type BillingTransitionEmailProps,
  sendBillingTransitionEmail,
} from '@durabull/email'
import { getBillingUrl } from './config'
import { getBillingGateway } from './gateway'
import { reconcileOrganization } from './reconcile'

/**
 * Beta-to-paid transition. Organizations created before launch keep full
 * access until their migration grant ends; this module tells their owners
 * (notice once, then reminders 7 days and 1 day before the grant ends) and
 * gives every organization a Stripe Customer ahead of purchase.
 */

export const PRICING_URL = 'https://durabull.io/pricing'
const DAY_MS = 24 * 60 * 60 * 1000
/** A claimed email still marked `sending` after this long is retried. */
const STALE_SEND_MS = 60 * 60 * 1000

type NoticeKind = 'transition_notice' | 'reminder_7d' | 'reminder_1d'

const EMAIL_KIND: Record<NoticeKind, BillingTransitionEmailKind> = {
  transition_notice: 'notice',
  reminder_7d: 'reminder_7d',
  reminder_1d: 'reminder_1d',
}

export type TransitionEmailSender = (
  email: BillingTransitionEmailProps & { to: string }
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
  restrictions: string[]
  featuresInUse: string[]
}

/** Subscription statuses that mean the organization already chose a plan. */
const SUBSCRIBED_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
])

/**
 * Organizations on an unexpired beta grant that have not subscribed, with what
 * the Free plan would change for each. An organization that subscribed during
 * the grant still resolves to the (larger) grant until it ends, so the
 * subscription is checked explicitly.
 */
export async function listTransitionAudience(now = new Date()): Promise<TransitionAudienceEntry[]> {
  const organizations = await billingRepository.listMigrationGrantOrganizations(now)
  const audience: TransitionAudienceEntry[] = []
  for (const org of organizations) {
    const subscription = await billingRepository.findCurrentSubscription(org.id)
    if (subscription && SUBSCRIBED_STATUSES.has(subscription.status)) continue
    const [owners, usage, candidates] = await Promise.all([
      billingRepository.listOwners(org.id),
      billingRepository.getUsage(org.id),
      billingRepository.listCapacityCandidates(org.id),
    ])
    const restrictions = exceededLimits(PLANS.free.limits, usage).map(
      ({ limit, usage: used, allowed }) =>
        `${LIMIT_LABELS[limit].name}: ${used} in use, Free includes ${allowed}`
    )
    const featuresInUse: string[] = []
    if (candidates.destinations.some((d) => d.type === 'webhook'))
      featuresInUse.push('Webhook alerts')
    if (candidates.destinations.some((d) => d.type === 'linear'))
      featuresInUse.push('Linear alerts')
    if (candidates.serviceAccounts.length > 0) featuresInUse.push('MCP service accounts')
    audience.push({
      organizationId: org.id,
      organizationName: org.name,
      organizationSlug: org.slug,
      deadline: org.migrationGrantExpiresAt,
      owners: owners.map((owner) => ({ userId: owner.userId, email: owner.email })),
      restrictions,
      featuresInUse,
    })
  }
  return audience
}

export interface StripeCustomerSyncResult {
  created: number
  reconciled: number
  skipped: number
  failed: Array<{ organizationId: string; error: string }>
}

/**
 * Give every organization a Stripe Customer bound to it (contact: the founding
 * owner), and reconcile those that already have one. Idempotent: a fixed
 * idempotency key per organization means retries reuse one Customer.
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
          idempotencyKey: `durabull-customer-${id}`,
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
}

async function sendNotice(
  entry: TransitionAudienceEntry,
  kind: NoticeKind,
  now: Date,
  result: NoticeSendResult
): Promise<void> {
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
    try {
      const { id } = await sender({
        to: owner.email,
        kind: EMAIL_KIND[kind],
        organizationName: entry.organizationName,
        deadline: entry.deadline,
        billingUrl: getBillingUrl(entry.organizationSlug),
        pricingUrl: PRICING_URL,
        teamMonthlyUsd: PLANS.team.monthlyPriceUsd ?? 0,
        businessMonthlyUsd: PLANS.business.monthlyPriceUsd ?? 0,
        restrictions: entry.restrictions,
        featuresInUse: entry.featuresInUse,
      })
      await billingRepository.completeNoticeDelivery(claim.id, {
        sent: true,
        providerMessageId: id,
      })
      result.sent += 1
    } catch (error) {
      const message = (error as Error).message
      await billingRepository.completeNoticeDelivery(claim.id, { sent: false, error: message })
      result.failed.push({
        organizationId: entry.organizationId,
        email: owner.email,
        error: message,
      })
    }
  }
}

/** Send the transition notice to every owner of every organization on a beta grant, once. */
export async function sendTransitionNotices(now = new Date()): Promise<NoticeSendResult> {
  const result: NoticeSendResult = { sent: 0, alreadySent: 0, failed: [] }
  for (const entry of await listTransitionAudience(now)) {
    await sendNotice(entry, 'transition_notice', now, result)
  }
  return result
}

/** Which reminder is due for a grant ending at `deadline`, if any. */
export function dueReminder(deadline: Date, now: Date): NoticeKind | null {
  const remaining = deadline.getTime() - now.getTime()
  if (remaining <= 0) return null
  if (remaining <= DAY_MS) return 'reminder_1d'
  if (remaining <= 7 * DAY_MS) return 'reminder_7d'
  return null
}

/**
 * Send reminders that are due. Only organizations whose owners already got the
 * transition notice receive reminders, so nothing is sent before an operator
 * runs the launch command. Organizations that subscribed have left the grant
 * and are no longer in the audience.
 */
export async function sendDueReminders(now = new Date()): Promise<NoticeSendResult> {
  const result: NoticeSendResult = { sent: 0, alreadySent: 0, failed: [] }
  for (const entry of await listTransitionAudience(now)) {
    const kind = dueReminder(entry.deadline, now)
    if (!kind) continue
    if (!(await billingRepository.hasSentNotice(entry.organizationId, 'transition_notice')))
      continue
    await sendNotice(entry, kind, now, result)
  }
  return result
}
