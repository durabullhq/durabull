import { billingRepository } from '@durabull/dal'
import { isEmailConfigured } from '@durabull/email'
import { expireStaleCheckoutAttempts } from './checkout'
import { isBillingEnabled } from './config'
import { materializeEntitlement } from './entitlements'
import { reconcileAllOrganizations } from './reconcile'
import { sendDueReminders } from './transition'
import { processWebhookInbox } from './webhooks'

const INBOX_INTERVAL_MS = 15_000
const SWEEP_INTERVAL_MS = 60_000
const RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000
const REMINDER_INTERVAL_MS = 60 * 60 * 1000
const EVENT_LAG_ALERT_MS = 15 * 60 * 1000

const timers: Array<ReturnType<typeof setInterval>> = []
let running = false
const inFlight = new Set<string>()

async function singleFlight(name: string, task: () => Promise<void>): Promise<void> {
  if (inFlight.has(name)) return
  inFlight.add(name)
  try {
    await task()
  } catch (error) {
    console.error(`[billing] ${name} failed:`, error instanceof Error ? error.message : error)
  } finally {
    inFlight.delete(name)
  }
}

/** Drain the durable webhook inbox. */
export async function runInboxPass(): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    const result = await processWebhookInbox({ limit: 25 })
    if (result.processed + result.failed < 25) break
  }
}

/**
 * Apply time-based transitions (trial end, grace expiry, capacity windows,
 * migration grants, history recovery) and backfill entitlements for
 * organizations that predate billing.
 */
export async function runEntitlementSweep(now = new Date()): Promise<void> {
  const due = await billingRepository.listEntitlementsDue(now)
  for (const organizationId of due) {
    await materializeEntitlement(organizationId, { reason: 'deadline', now })
  }

  const [organizations, entitlements] = await Promise.all([
    billingRepository.listAllOrganizationIds(),
    billingRepository.listEntitlements(),
  ])
  const known = new Set(entitlements.map((row) => row.organizationId))
  let backfilled = 0
  for (const organization of organizations) {
    if (known.has(organization.id)) continue
    await materializeEntitlement(organization.id, { reason: 'backfill', now })
    backfilled += 1
    if (backfilled >= 200) break
  }

  await expireStaleCheckoutAttempts(now)

  const stats = await billingRepository.webhookInboxStats(now)
  if (stats.dead > 0) {
    console.error(
      `[billing] ALERT ${stats.dead} Stripe webhook event(s) are dead-lettered; run billing-ops events --dead`
    )
  }
  if (stats.oldestPendingAgeMs !== null && stats.oldestPendingAgeMs > EVENT_LAG_ALERT_MS) {
    console.error(
      `[billing] ALERT Stripe webhook processing lag is ${Math.round(stats.oldestPendingAgeMs / 60000)} minutes`
    )
  }
}

export function startBillingLifecycle(): void {
  if (running || !isBillingEnabled()) return
  running = true
  void singleFlight('inbox', runInboxPass)
  void singleFlight('sweep', () => runEntitlementSweep())
  timers.push(setInterval(() => void singleFlight('inbox', runInboxPass), INBOX_INTERVAL_MS))
  timers.push(
    setInterval(() => void singleFlight('sweep', () => runEntitlementSweep()), SWEEP_INTERVAL_MS)
  )
  timers.push(
    setInterval(() => void singleFlight('reminders', () => runReminderPass()), REMINDER_INTERVAL_MS)
  )
  timers.push(
    setInterval(
      () =>
        void singleFlight('reconcile', async () => {
          const result = await reconcileAllOrganizations({ reason: 'scheduled' })
          if (result.failed > 0) {
            console.error(
              `[billing] ALERT scheduled reconciliation failed for ${result.failed} organization(s)`
            )
          }
        }),
      RECONCILE_INTERVAL_MS
    )
  )
}

/**
 * Send beta-transition reminders that are due. Replicas can run this at the
 * same time: each email is claimed in the database before it is sent.
 */
export async function runReminderPass(now = new Date()): Promise<void> {
  if (!isEmailConfigured()) return
  const result = await sendDueReminders(now)
  if (result.sent > 0) console.log(`[billing] Sent ${result.sent} transition reminder(s)`)
  if (result.failed.length > 0) {
    console.error(
      `[billing] ALERT ${result.failed.length} transition reminder(s) failed; they are retried on the next pass`
    )
  }
}

export function stopBillingLifecycle(): void {
  running = false
  for (const timer of timers.splice(0)) clearInterval(timer)
}

/** Nudge the inbox right after a webhook is recorded instead of waiting for the timer. */
export function nudgeWebhookInbox(): void {
  if (!running) return
  void singleFlight('inbox', runInboxPass)
}
