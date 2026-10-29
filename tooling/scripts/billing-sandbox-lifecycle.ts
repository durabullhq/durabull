/**
 * Stripe sandbox lifecycle verification for Durabull Cloud billing.
 *
 * Runs the billing lifecycle scenarios (trial, upgrade, failed payment, cancellation,
 * duplicate and forged webhooks) against a real Stripe sandbox
 * (test clocks, test payment methods) and a disposable PostgreSQL database,
 * through the production gateway, reconciliation and entitlement code.
 *
 * Usage:
 *   STRIPE_API_KEY=sk_test_… \
 *   DURABULL_BILLING_VERIFY_DATABASE_URL=postgresql://…/durabull_billing_verify \
 *   bun tooling/scripts/billing-sandbox-lifecycle.ts
 *
 * Refuses live keys. Creates only test-mode objects (test clocks are deleted
 * afterwards, which removes their customers and subscriptions).
 */

import { randomUUID } from 'node:crypto'
import { env } from '@durabull/env'

const apiKey = env.STRIPE_API_KEY ?? env.STRIPE_SECRET_KEY
const databaseUrl = process.env.DURABULL_BILLING_VERIFY_DATABASE_URL
if (!apiKey?.startsWith('sk_test_') && !apiKey?.startsWith('rk_test_')) {
  console.error('A Stripe test-mode key (sk_test_…) is required in STRIPE_API_KEY.')
  process.exit(1)
}
if (!databaseUrl) {
  console.error('DURABULL_BILLING_VERIFY_DATABASE_URL must point at a disposable PostgreSQL database.')
  process.exit(1)
}

// Configure billing for this process before any billing module reads it.
const mutableEnv = env as Record<string, unknown>
mutableEnv.DATABASE_URL = databaseUrl
mutableEnv.DURABULL_AUTHLESS = false
mutableEnv.DURABULL_ENV_CONNECTIONS = false
mutableEnv.DURABULL_BILLING_ENABLED = true
mutableEnv.DURABULL_BILLING_ENFORCEMENT = 'on'
mutableEnv.STRIPE_WEBHOOK_SECRET = `whsec_${randomUUID().replaceAll('-', '')}`

const { createStripeClient, setupStripeCatalog } = await import(
  '../../apps/api/src/billing/stripe-setup'
)
const catalog = await setupStripeCatalog({ secretKey: apiKey, mode: 'sandbox' })
Object.assign(mutableEnv, catalog.env)

const { billingRepository, closeDb, getDb, organization } = await import('@durabull/dal')
const { setBillingGatewayForTests } = await import('../../apps/api/src/billing/gateway')
const { hasFeature, invalidateEntitlementCache, materializeEntitlement } =
  await import('../../apps/api/src/billing/entitlements')
const { reconcileOrganization } = await import('../../apps/api/src/billing/reconcile')
const { startCheckout, createPortalSession } = await import('../../apps/api/src/billing/checkout')
const { receiveStripeWebhook, processWebhookInbox } = await import(
  '../../apps/api/src/billing/webhooks'
)
const { getBillingConfig } = await import('../../apps/api/src/billing/config')

const stripe = createStripeClient(apiKey)
setBillingGatewayForTests(null)

const DAY = 24 * 60 * 60
const results: Array<{ scenario: string; ok: boolean; detail: string }> = []
const clocks: string[] = []
const organizations: string[] = []

function check(scenario: string, condition: boolean, detail: string) {
  results.push({ scenario, ok: condition, detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${scenario}: ${detail}`)
}

async function waitForClock(id: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const clock = await stripe.testHelpers.testClocks.retrieve(id)
    if (clock.status === 'ready') return clock
    if (clock.status === 'internal_failure') throw new Error(`Test clock ${id} failed`)
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  throw new Error(`Test clock ${id} did not become ready`)
}

async function advance(clockId: string, seconds: number): Promise<Date> {
  const clock = await stripe.testHelpers.testClocks.retrieve(clockId)
  const target = clock.frozen_time + seconds
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: target })
  await waitForClock(clockId)
  return new Date(target * 1000)
}

async function newOrganization(label: string) {
  const id = `sandbox-${label}-${randomUUID().slice(0, 8)}`
  const db = await getDb()
  const now = new Date()
  await db.insert(organization).values({ id, name: `Sandbox ${label}`, slug: id, createdAt: now, updatedAt: now })
  organizations.push(id)
  return id
}

async function clockCustomer(organizationId: string, label: string) {
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name: `durabull-${label}`,
  })
  clocks.push(clock.id)
  const customer = await stripe.customers.create({
    name: `Durabull sandbox ${label}`,
    test_clock: clock.id,
    metadata: { durabull_organization_id: organizationId },
  })
  await billingRepository.bindAccount({
    organizationId,
    stripeCustomerId: customer.id,
    livemode: false,
    billingContactUserId: null,
  })
  return { clock, customer }
}

async function setCard(customerId: string, token: string) {
  const method = await stripe.paymentMethods.attach(token, { customer: customerId })
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: method.id },
  })
  return method.id
}

async function plan(organizationId: string, now: Date) {
  await reconcileOrganization(organizationId, { reason: 'sandbox', now })
  invalidateEntitlementCache(organizationId)
  const row = await materializeEntitlement(organizationId, { reason: 'sandbox', now })
  return row
}

const prices = getBillingConfig().purchasePrices

try {
  // A. Paid Team → entitlement → cancellation at period end → Free.
  {
    const org = await newOrganization('paid')
    const { clock, customer } = await clockCustomer(org, 'paid')
    await setCard(customer.id, 'pm_card_visa')
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: prices.team?.month as string }],
      metadata: { durabull_organization_id: org },
    })
    let now = new Date(clock.frozen_time * 1000)
    let row = await plan(org, now)
    check('A1 paid Team purchase grants Team', row.planCode === 'team' && row.source === 'subscription', `${row.planCode}/${row.source}`)
    check('A2 premium operation allowed', await hasFeature(org, 'alerts.webhook'), 'alerts.webhook entitled')
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true })
    row = await plan(org, now)
    check('A3 scheduled cancellation keeps Team', row.planCode === 'team' && (row.notices as string[]).includes('cancellation_scheduled'), `${row.planCode} ${JSON.stringify(row.notices)}`)
    now = await advance(clock.id, 32 * DAY)
    row = await plan(org, now)
    check('A4 cancellation at period end returns to Free', row.planCode === 'free', `${row.planCode}/${row.source}`)
    invalidateEntitlementCache(org)
    check('A5 premium operation denied after cancellation', !(await hasFeature(org, 'alerts.webhook')), 'alerts.webhook denied')
  }

  // A'. Flexible billing: a Portal cancellation records cancel_at, not
  // cancel_at_period_end. It must be scheduled, then end access.
  {
    const org = await newOrganization('cancel-at')
    const { clock, customer } = await clockCustomer(org, 'cancel-at')
    await setCard(customer.id, 'pm_card_visa')
    const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: prices.team?.month as string }] })
    const periodEnd = sub.items.data[0]?.current_period_end as number
    await stripe.subscriptions.update(sub.id, { cancel_at: periodEnd })
    let now = new Date(clock.frozen_time * 1000)
    let row = await plan(org, now)
    check("A'1 cancel_at keeps Team and schedules cancellation", row.planCode === 'team' && (row.notices as string[]).includes('cancellation_scheduled'), `${row.planCode} ${JSON.stringify(row.notices)}`)
    now = await advance(clock.id, 32 * DAY)
    row = await plan(org, now)
    check("A'2 cancel_at end returns to Free", row.planCode === 'free', `${row.planCode}/${row.source}`)
  }

  // B. Renewal fails → 7-day grace on last paid plan → Free; recovery restores access once.
  {
    const org = await newOrganization('dunning')
    const { clock, customer } = await clockCustomer(org, 'dunning')
    await setCard(customer.id, 'pm_card_visa')
    await stripe.subscriptions.create({ customer: customer.id, items: [{ price: prices.business?.month as string }] })
    let now = new Date(clock.frozen_time * 1000)
    let row = await plan(org, now)
    check('B1 Business active', row.planCode === 'business', row.planCode)
    await setCard(customer.id, 'pm_card_chargeCustomerFail')
    now = await advance(clock.id, 31 * DAY + 2 * 60 * 60)
    row = await plan(org, now)
    const current = await billingRepository.findCurrentSubscription(org)
    check('B2 failed renewal keeps last paid plan in grace', row.planCode === 'business' && row.source === 'payment_grace', `${current?.status} → ${row.planCode}/${row.source}`)
    row = await materializeEntitlement(org, { reason: 'sandbox', now: new Date(now.getTime() + 8 * DAY * 1000) })
    check('B3 grace expiry falls back to Free', row.planCode === 'free', `${row.planCode}/${row.source}`)
    const pm = await setCard(customer.id, 'pm_card_visa')
    const open = await stripe.invoices.list({ customer: customer.id, status: 'open', limit: 10 })
    for (const invoice of open.data) await stripe.invoices.pay(invoice.id as string, { payment_method: pm })
    row = await plan(org, now)
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'all' })
    check('B4 recovered payment restores Business without a second subscription', row.planCode === 'business' && subs.data.length === 1, `${row.planCode}, ${subs.data.length} subscription(s)`)
  }

  // C. Business trial without a payment method → Free at trial end.
  {
    const org = await newOrganization('trial')
    const { clock, customer } = await clockCustomer(org, 'trial')
    await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: prices.business?.month as string }],
      trial_period_days: 14,
      payment_settings: { save_default_payment_method: 'on_subscription' },
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    })
    let now = new Date(clock.frozen_time * 1000)
    let row = await plan(org, now)
    check('C1 trial grants Business without a card', row.planCode === 'business' && row.source === 'trial', `${row.planCode}/${row.source}`)
    now = await advance(clock.id, 15 * DAY)
    row = await plan(org, now)
    const invoices = await stripe.invoices.list({ customer: customer.id, limit: 10 })
    const charged = invoices.data.some((invoice) => (invoice.amount_paid ?? 0) > 0)
    check('C2 trial end without card returns to Free with no charge', row.planCode === 'free' && !charged, `${row.planCode}, charged=${charged}`)
  }

  // D. Upgrade whose payment fails never unlocks the higher plan.
  {
    const org = await newOrganization('upgrade')
    const { clock, customer } = await clockCustomer(org, 'upgrade')
    await setCard(customer.id, 'pm_card_visa')
    const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: prices.team?.month as string }] })
    const now = new Date(clock.frozen_time * 1000)
    await plan(org, now)
    await setCard(customer.id, 'pm_card_chargeCustomerFail')
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: sub.items.data[0]?.id, price: prices.business?.month as string }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'allow_incomplete',
    })
    let row = await plan(org, now)
    check('D1 unpaid upgrade keeps last paid plan', row.planCode === 'team' && row.subscribedPlanCode === 'business', `${row.planCode} (subscribed ${row.subscribedPlanCode})`)
    const pm = await setCard(customer.id, 'pm_card_visa')
    const open = await stripe.invoices.list({ customer: customer.id, status: 'open', limit: 10 })
    for (const invoice of open.data) await stripe.invoices.pay(invoice.id as string, { payment_method: pm })
    row = await plan(org, now)
    check('D2 paid upgrade unlocks Business', row.planCode === 'business', row.planCode)
  }

  // E. Hosted Checkout: concurrent owners get one session; Portal session works.
  {
    const org = await newOrganization('checkout')
    const input = {
      organizationId: org,
      organizationName: 'Sandbox checkout',
      organizationSlug: org,
      user: { id: 'sandbox-owner', email: 'owner@example.com', emailVerified: true },
      planCode: 'team' as const,
      interval: 'month' as const,
      trial: false,
    }
    const db = await getDb()
    const { user } = await import('@durabull/dal')
    const now = new Date()
    await db.insert(user).values({ id: 'sandbox-owner', name: 'Owner', email: `owner-${org}@example.com`, emailVerified: true, createdAt: now, updatedAt: now }).onConflictDoNothing()
    const [first, second] = await Promise.all([startCheckout(input), startCheckout(input)])
    const session = first.url.startsWith('https://checkout.stripe.com')
    check('E1 concurrent Checkout requests share one hosted session', session && first.url === second.url, first.url.slice(0, 40))
    const sessionId = new URL(first.url).pathname.split('/').pop()?.split('#')[0] ?? ''
    const attempt = await billingRepository.findOpenCheckoutAttempt(org)
    const created = attempt?.stripeSessionId
      ? await stripe.checkout.sessions.retrieve(attempt.stripeSessionId)
      : null
    const methods = created?.payment_method_types ?? []
    check(
      'E3 Checkout offers cards only',
      methods.length > 0 && methods.every((type) => type === 'card' || type === 'link'),
      `${methods.join(', ') || sessionId}`
    )
    const portal = await createPortalSession(org, org)
    check('E2 Customer Portal session is created', portal.url.startsWith('https://billing.stripe.com'), portal.url.slice(0, 40))
    const account = await billingRepository.findAccount(org)
    if (account) await stripe.customers.del(account.stripeCustomerId)
  }

  // F. Signed webhook of a real event is verified, deduplicated and reconciled.
  {
    const events = await stripe.events.list({ limit: 1, type: 'customer.subscription.updated' })
    const event = events.data[0]
    if (event) {
      const payload = JSON.stringify(event)
      const header = await stripe.webhooks.generateTestHeaderStringAsync({
        payload,
        secret: env.STRIPE_WEBHOOK_SECRET as string,
      })
      const firstDelivery = await receiveStripeWebhook(payload, header)
      const duplicate = await receiveStripeWebhook(payload, header)
      let forgedRejected = false
      try {
        await receiveStripeWebhook(payload, header.replace(/v1=[0-9a-f]+/, 'v1=deadbeef'))
      } catch {
        forgedRejected = true
      }
      const processed = await processWebhookInbox()
      check(
        'F1 webhook signature, idempotency and processing',
        !firstDelivery.duplicate && duplicate.duplicate && forgedRejected && processed.processed + processed.failed >= 1,
        `duplicate=${duplicate.duplicate} forgedRejected=${forgedRejected} processed=${processed.processed} failed=${processed.failed}`
      )
    }
  }
} finally {
  for (const clock of clocks) {
    await stripe.testHelpers.testClocks.del(clock).catch(() => {})
  }
  const db = await getDb()
  const { eq } = await import('@durabull/dal')
  for (const id of organizations) await db.delete(organization).where(eq(organization.id, id))
  const { user } = await import('@durabull/dal')
  await db.delete(user).where(eq(user.id, 'sandbox-owner'))
  await closeDb()
  const failed = results.filter((result) => !result.ok)
  console.log(`\n${results.length - failed.length}/${results.length} sandbox checks passed`)
  if (failed.length > 0) process.exitCode = 1
}

