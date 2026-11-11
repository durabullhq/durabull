import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PLANS } from '@durabull/billing'
import {
  alertRule,
  billingRepository,
  closeDb,
  eq,
  getDb,
  member,
  organization,
  redisConnection,
  user,
} from '@durabull/dal'
import { BillingEmailError } from '@durabull/email'
import { env } from '@durabull/env'
import { createApiApp } from '../app'
import { AUTHLESS_ORG_ID, getAuthlessContext, resetAuthlessStateForTests } from '../lib/authless'
import { evaluateMcpBillingPolicy } from '../mcp/policy/mcp-billing-guard'
import { createBillingOrganizationPolicy } from './auth-policy'
import { CheckoutRefusedError, startCheckout } from './checkout'
import { type BillingConfig, setBillingConfigForTests } from './config'
import {
  getEntitlement,
  hasFeature,
  invalidateEntitlementCache,
  materializeEntitlement,
  rebalanceCapacity,
  syncStoredEnforcement,
} from './entitlements'
import {
  type BillingGateway,
  type CheckoutSessionSnapshot,
  type CreateCheckoutInput,
  type InvoiceSummary,
  type PortalFlow,
  type SubscriptionSnapshot,
  setBillingGatewayForTests,
  type WebhookEventSnapshot,
} from './gateway'
import { runEntitlementSweep } from './lifecycle'
import { reconcileOrganization } from './reconcile'
import {
  listTransitionAudience,
  refreshGrantEligibility,
  sendDueReminders,
  sendTransitionNotices,
  setTransitionEmailSenderForTests,
  syncStripeCustomers,
} from './transition'
import { processWebhookInbox, receiveStripeWebhook } from './webhooks'

const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_AUTHLESS?: boolean
  DURABULL_ENV_CONNECTIONS?: boolean
  DURABULL_REDIS_URL_ENCRYPTION_KEY?: string
}
const original = { ...mutableEnv }
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR
let tempDir = ''

const PRICES = {
  team: { month: 'price_team_m', year: 'price_team_y' },
  business: { month: 'price_business_m', year: 'price_business_y' },
} as const

function billingConfig(overrides: Partial<BillingConfig> = {}): Partial<BillingConfig> {
  return {
    enabled: true,
    enforcement: 'on',
    purchasesEnabled: true,
    trialsEnabled: true,
    launchAt: null,
    migrationGrantUntil: null,
    appBaseUrl: 'https://app.example.test',
    stripe: {
      secretKey: 'sk_test_x',
      webhookSecret: 'whsec_x',
      portalConfigurationId: null,
      paymentMethodConfigurationId: null,
      livemode: false,
    },
    prices: new Map([
      [
        'price_team_m',
        { planCode: 'team', interval: 'month', catalogVersion: 'test', purchasable: true },
      ],
      [
        'price_team_y',
        { planCode: 'team', interval: 'year', catalogVersion: 'test', purchasable: true },
      ],
      [
        'price_business_m',
        { planCode: 'business', interval: 'month', catalogVersion: 'test', purchasable: true },
      ],
      [
        'price_business_y',
        { planCode: 'business', interval: 'year', catalogVersion: 'test', purchasable: true },
      ],
    ]),
    purchasePrices: PRICES,
    enterpriseProductIds: new Set(),
    pilotOrganizationIds: new Set(),
    ...overrides,
  }
}

/** In-memory Stripe stand-in: subscriptions per customer, signed events by id. */
class FakeGateway implements BillingGateway {
  customers = new Map<string, string>()
  subscriptions = new Map<string, SubscriptionSnapshot[]>()
  sessions = new Map<string, CheckoutSessionSnapshot>()
  events = new Map<string, WebhookEventSnapshot>()
  checkoutCalls: CreateCheckoutInput[] = []
  private counter = 0

  async createCustomer(input: { organizationId: string }) {
    const existing = this.customers.get(input.organizationId)
    if (existing) return { id: existing, livemode: false }
    const id = `cus_${++this.counter}`
    this.customers.set(input.organizationId, id)
    return { id, livemode: false }
  }
  async createCheckoutSession(input: CreateCheckoutInput) {
    this.checkoutCalls.push(input)
    const session: CheckoutSessionSnapshot = {
      id: `cs_${++this.counter}`,
      status: 'open',
      url: `https://checkout.stripe.test/${this.counter}`,
      customerId: input.customerId,
      subscriptionId: null,
      organizationId: input.organizationId,
      expiresAt: input.expiresAt,
    }
    this.sessions.set(session.id, session)
    return session
  }
  async retrieveCheckoutSession(id: string) {
    return this.sessions.get(id) ?? null
  }
  async expireCheckoutSession(id: string) {
    const session = this.sessions.get(id)
    if (session) this.sessions.set(id, { ...session, status: 'expired' })
  }
  portalCalls: Array<{ customerId: string; returnUrl: string; flow?: PortalFlow | null }> = []
  invoices = new Map<string, InvoiceSummary[]>()
  failInvoices = false
  async createPortalSession(input: {
    customerId: string
    returnUrl: string
    flow?: PortalFlow | null
  }) {
    this.portalCalls.push(input)
    return { url: 'https://billing.stripe.test/portal' }
  }
  async listInvoices(customerId: string, limit: number) {
    if (this.failInvoices) throw new Error('stripe unavailable')
    return (this.invoices.get(customerId) ?? []).slice(0, limit)
  }
  async listCustomerSubscriptions(customerId: string) {
    return this.subscriptions.get(customerId) ?? []
  }
  async constructWebhookEvent(_raw: string, signature: string) {
    const event = this.events.get(signature)
    if (!event) throw new Error('bad signature')
    return event
  }

  setSubscription(customerId: string, overrides: Partial<SubscriptionSnapshot>) {
    const now = Date.now()
    const snapshot: SubscriptionSnapshot = {
      id: 'sub_1',
      customerId,
      status: 'active',
      priceId: PRICES.team.month,
      productId: 'prod_team',
      itemId: 'si_1',
      interval: 'month',
      currentPeriodStart: new Date(now - 86_400_000),
      currentPeriodEnd: new Date(now + 29 * 86_400_000),
      cancelAtPeriodEnd: false,
      cancelAt: null,
      canceledAt: null,
      endedAt: null,
      trialStart: null,
      trialEnd: null,
      collectionMethod: 'charge_automatically',
      pauseCollection: false,
      created: new Date(now - 86_400_000),
      latestInvoice: {
        id: 'in_1',
        status: 'paid',
        amountDue: 900,
        billingReason: 'subscription_create',
        periodEnd: null,
      },
      organizationId: null,
      ...overrides,
    }
    const list = (this.subscriptions.get(customerId) ?? []).filter((s) => s.id !== snapshot.id)
    this.subscriptions.set(customerId, [...list, snapshot])
  }
}

let gateway: FakeGateway

// Response bodies in these tests are asserted structurally.
// biome-ignore lint/suspicious/noExplicitAny: test helper for JSON assertions
type Json = any
async function json(response: Response): Promise<Json> {
  return response.json()
}

async function bindCustomer(organizationId: string): Promise<string> {
  const { id } = await gateway.createCustomer({ organizationId })
  await billingRepository.bindAccount({
    organizationId,
    stripeCustomerId: id,
    livemode: false,
    billingContactUserId: null,
  })
  return id
}

async function subscribe(organizationId: string, overrides: Partial<SubscriptionSnapshot> = {}) {
  const customerId =
    (await billingRepository.findAccount(organizationId))?.stripeCustomerId ??
    (await bindCustomer(organizationId))
  gateway.setSubscription(customerId, overrides)
  await reconcileOrganization(organizationId, { reason: 'test' })
  invalidateEntitlementCache()
}

async function createApp() {
  const { app } = await createApiApp({
    enableLogging: false,
    enforceBillingDeploymentSafety: false,
  })
  return app
}

async function createConnection(app: Awaited<ReturnType<typeof createApp>>, name: string) {
  return app.request('/api/connections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, url: 'redis://localhost:6379' }),
  })
}

describe('Cloud billing', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'durabull-billing-api-'))
    process.env.DURABULL_PGLITE_DIR = tempDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_AUTHLESS = true
    mutableEnv.DURABULL_ENV_CONNECTIONS = false
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    resetAuthlessStateForTests()
    await closeDb()
    gateway = new FakeGateway()
    setBillingGatewayForTests(gateway)
    setBillingConfigForTests(billingConfig())
    invalidateEntitlementCache()
    await getAuthlessContext()
  })

  afterEach(async () => {
    setBillingConfigForTests(null)
    setBillingGatewayForTests(null)
    invalidateEntitlementCache()
    resetAuthlessStateForTests()
    await closeDb()
    Object.assign(mutableEnv, original)
    if (originalPgliteDir) process.env.DURABULL_PGLITE_DIR = originalPgliteDir
    else delete process.env.DURABULL_PGLITE_DIR
    if (tempDir) await rm(tempDir, { recursive: true, force: true })
  })

  it('keeps every local feature available when billing is disabled (self-hosted)', async () => {
    setBillingConfigForTests({ enabled: false, enforcement: 'off' })
    const app = await createApp()
    for (const name of ['a', 'b', 'c']) {
      expect((await createConnection(app, name)).status).toBe(201)
    }
    const entitlement = await getEntitlement(AUTHLESS_ORG_ID)
    expect(entitlement.planCode).toBe('self_hosted')
    const billing = await json(await app.request('/api/billing'))
    expect(billing.enabled).toBe(false)
  })

  it('returns the documented 409 when a Free organization exceeds its connection limit', async () => {
    const app = await createApp()
    expect((await createConnection(app, 'primary')).status).toBe(201)
    const response = await createConnection(app, 'second')
    expect(response.status).toBe(409)
    const body = await json(response)
    expect(body).toMatchObject({
      code: 'plan_limit_reached',
      limit: 'connections.enabled',
      usage: 1,
      allowed: 1,
      requiredPlan: 'team',
    })
  })

  it('does not count a disabled connection and blocks enabling beyond the limit', async () => {
    const app = await createApp()
    await createConnection(app, 'primary')
    const disabled = await app.request('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'spare', url: 'redis://localhost:6379', enabled: false }),
    })
    expect(disabled.status).toBe(201)
    const { connection } = await json(disabled)
    const enable = await app.request(`/api/connections/${connection.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    })
    expect(enable.status).toBe(409)
    const operational = await app.request(`/api/c/${connection.id}/queues/emails/jobs/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: ['1'] }),
    })
    expect(operational.status).toBe(409)
    expect((await json(operational)).code).toBe('connection_disabled')
  })

  it('rejects premium routes on the server even when the client is modified', async () => {
    const app = await createApp()
    const created = await createConnection(app, 'primary')
    const { connection } = await json(created)

    const bulk = await app.request(`/api/c/${connection.id}/queues/emails/jobs/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statuses: ['failed'] }),
    })
    expect(bulk.status).toBe(403)
    expect(await json(bulk)).toMatchObject({
      code: 'feature_not_entitled',
      feature: 'jobs.bulk_recovery',
      requiredPlan: 'team',
    })

    const bulkPromote = await app.request(`/api/c/${connection.id}/queues/emails/jobs/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: ['1', '2'] }),
    })
    expect(bulkPromote.status).toBe(403)
    expect((await json(bulkPromote)).feature).toBe('jobs.bulk_recovery')

    const webhook = await app.request('/api/alerts/destinations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'webhook', name: 'hook', url: 'https://hooks.example.com/x' }),
    })
    expect(webhook.status).toBe(403)
    expect((await json(webhook)).feature).toBe('alerts.webhook')

    const serviceAccount = await app.request('/api/service-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ci', scopes: ['mcp:jobs:read'] }),
    })
    expect(serviceAccount.status).toBe(403)
  })

  it('unlocks Team only from reconciled Stripe state and keeps organizations separate', async () => {
    const db = await getDb()
    const now = new Date()
    await db
      .insert(organization)
      .values({ id: 'other-org', name: 'Other', slug: 'other', createdAt: now, updatedAt: now })

    await subscribe(AUTHLESS_ORG_ID)
    expect((await getEntitlement(AUTHLESS_ORG_ID)).planCode).toBe('team')
    expect((await getEntitlement('other-org')).planCode).toBe('free')

    const app = await createApp()
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      expect((await createConnection(app, name)).status).toBe(201)
    }
    expect((await createConnection(app, 'f')).status).toBe(409)

    const serviceAccount = await app.request('/api/service-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ci', scopes: ['mcp:jobs:read'] }),
    })
    expect(serviceAccount.status).toBe(201)
    expect((await json(serviceAccount)).token).toStartWith('dbsa_')
    const second = await app.request('/api/service-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ci-2', scopes: ['mcp:jobs:read'] }),
    })
    expect(second.status).toBe(409)
  })

  it('never unlocks an unpaid upgrade and keeps the last paid plan in grace', async () => {
    await subscribe(AUTHLESS_ORG_ID)
    await subscribe(AUTHLESS_ORG_ID, {
      priceId: PRICES.business.month,
      latestInvoice: {
        id: 'in_2',
        status: 'open',
        amountDue: 2000,
        billingReason: 'subscription_update',
        periodEnd: null,
      },
    })
    const pending = await getEntitlement(AUTHLESS_ORG_ID)
    expect(pending.planCode).toBe('team')
    expect(pending.subscribedPlanCode).toBe('business')

    await subscribe(AUTHLESS_ORG_ID, {
      priceId: PRICES.team.month,
      status: 'past_due',
      latestInvoice: {
        id: 'in_3',
        status: 'open',
        amountDue: 900,
        billingReason: 'subscription_cycle',
        periodEnd: null,
      },
    })
    const grace = await getEntitlement(AUTHLESS_ORG_ID)
    expect(grace.planCode).toBe('team')
    expect(grace.source).toBe('payment_grace')
    expect(grace.graceExpiresAt).not.toBeNull()
  })

  it('converges with duplicate and out-of-order webhook deliveries', async () => {
    const customerId = await bindCustomer(AUTHLESS_ORG_ID)
    const event = (id: string, type: string): WebhookEventSnapshot => ({
      id,
      type,
      livemode: false,
      created: new Date(),
      objectId: 'sub_1',
      customerId,
      organizationId: AUTHLESS_ORG_ID,
    })
    gateway.events.set('sig-created', event('evt_created', 'customer.subscription.created'))
    gateway.events.set('sig-deleted', event('evt_deleted', 'customer.subscription.deleted'))

    // Stripe's current state is "canceled", whatever order events arrive in.
    gateway.setSubscription(customerId, { status: 'canceled', endedAt: new Date() })
    expect((await receiveStripeWebhook('{}', 'sig-deleted')).duplicate).toBe(false)
    expect((await receiveStripeWebhook('{}', 'sig-created')).duplicate).toBe(false)
    expect((await receiveStripeWebhook('{}', 'sig-created')).duplicate).toBe(true)
    await expect(receiveStripeWebhook('{}', 'forged')).rejects.toThrow('Invalid Stripe signature.')

    const result = await processWebhookInbox()
    expect(result).toEqual({ processed: 2, failed: 0 })
    invalidateEntitlementCache()
    expect((await getEntitlement(AUTHLESS_ORG_ID)).planCode).toBe('free')
  })

  it('creates at most one Checkout attempt for concurrent owners and refuses a second subscription', async () => {
    const input = {
      organizationId: AUTHLESS_ORG_ID,
      organizationName: 'Authless',
      organizationSlug: 'authless',
      user: { id: 'authless-user', email: 'admin@localhost', emailVerified: true },
      planCode: 'team' as const,
      interval: 'month' as const,
      trial: false,
    }
    const [first, second] = await Promise.all([startCheckout(input), startCheckout(input)])
    expect(gateway.checkoutCalls).toHaveLength(1)
    expect(first.url).toBe(second.url)

    await subscribe(AUTHLESS_ORG_ID)
    let refused: unknown = null
    try {
      await startCheckout({ ...input, planCode: 'business' })
    } catch (error) {
      refused = error
    }
    expect(refused).toBeInstanceOf(CheckoutRefusedError)
    expect((refused as CheckoutRefusedError).reason).toBe('subscription_exists')
  })

  it('starts a Business trial without a card once per organization', async () => {
    const input = {
      organizationId: AUTHLESS_ORG_ID,
      organizationName: 'Authless',
      organizationSlug: 'authless',
      user: { id: 'authless-user', email: 'admin@localhost', emailVerified: true },
      planCode: 'business' as const,
      interval: 'month' as const,
      trial: true,
    }
    await startCheckout(input)
    expect(gateway.checkoutCalls[0]?.trialDays).toBe(14)
    await subscribe(AUTHLESS_ORG_ID, {
      status: 'trialing',
      priceId: PRICES.business.month,
      trialStart: new Date(),
      trialEnd: new Date(Date.now() + 14 * 86_400_000),
      latestInvoice: {
        id: 'in_t',
        status: 'paid',
        amountDue: 0,
        billingReason: 'subscription_create',
        periodEnd: null,
      },
    })
    const trial = await getEntitlement(AUTHLESS_ORG_ID)
    expect(trial.planCode).toBe('business')
    expect(trial.source).toBe('trial')

    // Trial ends without a payment method: Stripe cancels; Free applies.
    await subscribe(AUTHLESS_ORG_ID, {
      status: 'canceled',
      priceId: PRICES.business.month,
      trialStart: new Date(Date.now() - 15 * 86_400_000),
      trialEnd: new Date(Date.now() - 86_400_000),
      endedAt: new Date(),
    })
    expect((await getEntitlement(AUTHLESS_ORG_ID)).planCode).toBe('free')
    await expect(startCheckout(input)).rejects.toBeInstanceOf(CheckoutRefusedError)
  })

  it('suspends excess resources reversibly after the adjustment window and restores on upgrade', async () => {
    await subscribe(AUTHLESS_ORG_ID)
    const app = await createApp()
    for (const name of ['a', 'b', 'c']) await createConnection(app, name)

    await subscribe(AUTHLESS_ORG_ID, { status: 'canceled', endedAt: new Date() })
    const windowed = await getEntitlement(AUTHLESS_ORG_ID, { fresh: true })
    expect(windowed.capacityAdjustmentExpiresAt).not.toBeNull()
    expect((await billingRepository.listSuspensions(AUTHLESS_ORG_ID)).length).toBe(0)
    // New creation is blocked during the window.
    expect((await createConnection(app, 'd')).status).toBe(409)

    await materializeEntitlement(AUTHLESS_ORG_ID, {
      reason: 'test',
      now: new Date(Date.now() + 8 * 86_400_000),
    })
    const suspended = await billingRepository.listSuspensions(AUTHLESS_ORG_ID)
    expect(suspended.filter((s) => s.resourceKind === 'connection')).toHaveLength(2)

    const listed = await json(await app.request('/api/connections'))
    expect(listed.connections.filter((c: { suspended: boolean }) => c.suspended)).toHaveLength(2)

    await subscribe(AUTHLESS_ORG_ID, { id: 'sub_2', status: 'active' })
    expect((await billingRepository.listSuspensions(AUTHLESS_ORG_ID)).length).toBe(0)
  })

  it('protects only the founding owner when seats are over the limit', async () => {
    const db = await getDb()
    const now = Date.now()
    for (let i = 0; i < 3; i += 1) {
      const userId = `extra-owner-${i}`
      await db.insert(user).values({
        id: userId,
        name: `Owner ${i}`,
        email: `${userId}@example.com`,
        emailVerified: true,
        createdAt: new Date(now + i),
        updatedAt: new Date(now + i),
      })
      await db.insert(member).values({
        id: `${userId}-member`,
        organizationId: AUTHLESS_ORG_ID,
        userId,
        role: 'owner',
        createdAt: new Date(now + 1000 + i),
      })
    }
    await subscribe(AUTHLESS_ORG_ID, { status: 'canceled', endedAt: new Date() })
    await materializeEntitlement(AUTHLESS_ORG_ID, {
      reason: 'test',
      now: new Date(now + 8 * 86_400_000),
    })
    const suspendedMembers = (await billingRepository.listSuspensions(AUTHLESS_ORG_ID)).filter(
      (s) => s.resourceKind === 'member'
    )
    // Free has one seat: the founding owner keeps it, every promoted owner is suspended.
    expect(suspendedMembers).toHaveLength(3)
  })

  it('stops enforcing stored limits once enforcement is rolled back', async () => {
    const app = await createApp()
    await createConnection(app, 'a')
    expect((await createConnection(app, 'b')).status).toBe(409)

    setBillingConfigForTests(billingConfig({ enforcement: 'shadow' }))
    invalidateEntitlementCache()
    expect(await syncStoredEnforcement()).toBe(1)
    // The capacity trigger no longer rejects, even before the organization is re-materialized.
    expect((await createConnection(app, 'b')).status).toBe(201)
  })

  it('keeps alert rules on connections that stay active when trimming to the plan', async () => {
    await subscribe(AUTHLESS_ORG_ID)
    const app = await createApp()
    const oldest = (await json(await createConnection(app, 'oldest'))).connection
    const newer = (await json(await createConnection(app, 'newer'))).connection
    const db = await getDb()
    const rule = (connectionId: string, name: string, offset: number) => ({
      organizationId: AUTHLESS_ORG_ID,
      connectionId,
      name,
      type: 'job_failed' as const,
      config: {},
      createdAt: new Date(Date.now() - 86_400_000 + offset),
    })
    // The newer connection's rules are older, so plain oldest-first would keep them.
    await db
      .insert(alertRule)
      .values([
        rule(newer.id, 'n1', 0),
        rule(newer.id, 'n2', 1),
        rule(newer.id, 'n3', 2),
        rule(oldest.id, 'o1', 3),
      ])

    await subscribe(AUTHLESS_ORG_ID, { status: 'canceled', endedAt: new Date() })
    await materializeEntitlement(AUTHLESS_ORG_ID, {
      reason: 'test',
      now: new Date(Date.now() + 8 * 86_400_000),
    })
    const suspensions = await billingRepository.listSuspensions(AUTHLESS_ORG_ID)
    const suspendedRules = new Set(
      suspensions.filter((s) => s.resourceKind === 'alert_rule').map((s) => s.resourceId)
    )
    const rules = await db.select().from(alertRule)
    const keptOnLiveConnection = rules.filter(
      (r) => r.connectionId === oldest.id && !suspendedRules.has(r.id)
    )
    expect(keptOnLiveConnection).toHaveLength(1)
  })

  it('keeps collected history for the recovery window when enforcement turns on', async () => {
    setBillingConfigForTests(billingConfig({ enforcement: 'shadow' }))
    invalidateEntitlementCache()
    await materializeEntitlement(AUTHLESS_ORG_ID, { reason: 'test' })

    setBillingConfigForTests(billingConfig({ enforcement: 'on' }))
    invalidateEntitlementCache()
    const enforced = await materializeEntitlement(AUTHLESS_ORG_ID, { reason: 'test' })
    expect(enforced.historyRetentionFloorExpiresAt).not.toBeNull()
  })

  it('applies the beta grant to organizations whose rows predate the launch dates', async () => {
    // The shadow sweep created the row before launch dates were configured.
    await getEntitlement(AUTHLESS_ORG_ID)
    setBillingConfigForTests(
      billingConfig({
        launchAt: new Date(Date.now() + 86_400_000),
        migrationGrantUntil: new Date(Date.now() + 31 * 86_400_000),
      })
    )
    invalidateEntitlementCache()
    const entitlement = await materializeEntitlement(AUTHLESS_ORG_ID, { reason: 'test' })
    expect(entitlement.source).toBe('migration_grant')
  })

  it('stops premium deliveries and MCP writes after a downgrade', async () => {
    await subscribe(AUTHLESS_ORG_ID)
    expect(await hasFeature(AUTHLESS_ORG_ID, 'alerts.webhook')).toBe(true)
    await subscribe(AUTHLESS_ORG_ID, { status: 'canceled', endedAt: new Date() })
    expect(await hasFeature(AUTHLESS_ORG_ID, 'alerts.webhook')).toBe(false)

    const write = await evaluateMcpBillingPolicy({
      principal: {
        type: 'delegated_user',
        principalId: 'authless-user',
        userId: 'authless-user',
        organizationId: null,
      },
      operationName: 'retry_job',
      connectionId: null,
      connectionOrganizationId: AUTHLESS_ORG_ID,
    })
    expect(write.allowed).toBe(false)
    const read = await evaluateMcpBillingPolicy({
      principal: {
        type: 'delegated_user',
        principalId: 'authless-user',
        userId: 'authless-user',
        organizationId: null,
      },
      operationName: 'list_queues',
      connectionId: null,
      connectionOrganizationId: AUTHLESS_ORG_ID,
    })
    expect(read.allowed).toBe(true)
  })

  it('clamps history to the plan window over HTTP', async () => {
    const app = await createApp()
    const { connection } = await json(await createConnection(app, 'primary'))
    const response = await app.request(
      `/api/c/${connection.id}/metrics/redis-health?windowMinutes=43200&targetPoints=30`
    )
    expect(response.status).toBe(200)
    const body = await json(response)
    expect(body.rangeClamped).toBe(true)
    expect(body.planHistoryDays).toBe(PLANS.free.limits['history.redis_health_days'])
  })

  it('enforces seat reservations at the auth-plugin boundary', async () => {
    const policy = createBillingOrganizationPolicy()
    expect(policy).toBeDefined()
    // The authless owner already uses Free's single seat.
    await expect(
      policy?.beforeCreateInvitation?.({
        organizationId: AUTHLESS_ORG_ID,
        email: 'new@example.com',
      })
    ).rejects.toMatchObject({ status: 'CONFLICT', body: { code: 'plan_limit_reached' } })
  })

  it('tells an invitee who to ask when the organization is above its seat limit', async () => {
    const policy = createBillingOrganizationPolicy()
    const accept = () =>
      policy?.beforeAcceptInvitation?.({
        organizationId: AUTHLESS_ORG_ID,
        invitationId: 'pending-invitation',
        userId: 'invitee',
      })
    // At the limit the reservation already exists, so acceptance goes through.
    await expect(accept()).resolves.toBeUndefined()

    // A second member from the Team period leaves Free's single seat oversubscribed.
    await subscribe(AUTHLESS_ORG_ID)
    const db = await getDb()
    await db.insert(user).values({
      id: 'second-member',
      name: 'Second member',
      email: 'second-member@example.com',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(member).values({
      id: 'second-member-row',
      organizationId: AUTHLESS_ORG_ID,
      userId: 'second-member',
      role: 'member',
      createdAt: new Date(),
    })
    await subscribe(AUTHLESS_ORG_ID, { status: 'canceled', endedAt: new Date() })
    invalidateEntitlementCache()

    // Not the owner's upgrade prompt: the invitee cannot change the plan.
    await expect(accept()).rejects.toMatchObject({
      status: 'CONFLICT',
      body: { code: 'invitation_seat_unavailable' },
    })
  })

  it('only observes denials in shadow mode', async () => {
    setBillingConfigForTests(billingConfig({ enforcement: 'shadow' }))
    invalidateEntitlementCache()
    const app = await createApp()
    expect((await createConnection(app, 'a')).status).toBe(201)
    expect((await createConnection(app, 'b')).status).toBe(201)
    const entitlement = await getEntitlement(AUTHLESS_ORG_ID)
    expect(entitlement.enforced).toBe(false)
    expect(entitlement.planCode).toBe('free')
  })

  it('applies the beta migration grant to organizations created before launch', async () => {
    setBillingConfigForTests(
      billingConfig({
        launchAt: new Date(Date.now() + 86_400_000),
        migrationGrantUntil: new Date(Date.now() + 31 * 86_400_000),
      })
    )
    invalidateEntitlementCache()
    const entitlement = await getEntitlement(AUTHLESS_ORG_ID)
    expect(entitlement.source).toBe('migration_grant')
    expect(entitlement.limits['connections.enabled']).toBeNull()
    const app = await createApp()
    const billing = await json(await app.request('/api/billing'))
    expect(billing.migrationGrantExpiresAt).not.toBeNull()
    expect(billing.proposedPlanCode).toBe('free')
  })
  /** Team organization with two connections, then moved to Free with the window already over. */
  async function downgradeWithTwoConnections(app: Awaited<ReturnType<typeof createApp>>) {
    await subscribe(AUTHLESS_ORG_ID)
    const first = (await json(await createConnection(app, 'first'))).connection
    const second = (await json(await createConnection(app, 'second'))).connection
    await subscribe(AUTHLESS_ORG_ID, { status: 'canceled', endedAt: new Date() })
    await materializeEntitlement(AUTHLESS_ORG_ID, {
      reason: 'test',
      now: new Date(Date.now() + 8 * 86_400_000),
    })
    invalidateEntitlementCache()
    return { first, second }
  }

  async function suspendedIdsOf(kind: string): Promise<string[]> {
    return (await billingRepository.listSuspensions(AUTHLESS_ORG_ID))
      .filter((s) => s.resourceKind === kind)
      .map((s) => s.resourceId)
  }

  it('answers what the organization may use from one small endpoint', async () => {
    const app = await createApp()
    await createConnection(app, 'primary')
    const entitlement = await json(await app.request('/api/billing/entitlement'))
    expect(entitlement).toMatchObject({
      enabled: true,
      enforced: true,
      planCode: 'free',
      planName: 'Free',
      features: [],
      canManageBilling: true,
      suspended: [],
      subscription: null,
      transition: null,
    })
    expect(entitlement.limits['connections.enabled']).toBe(1)
    expect(entitlement.usage['connections.enabled']).toBe(1)

    await subscribe(AUTHLESS_ORG_ID)
    const team = await json(await app.request('/api/billing/entitlement'))
    expect(team.planCode).toBe('team')
    expect(team.features).toContain('jobs.bulk_recovery')
    expect(team.subscription).toMatchObject({
      status: 'active',
      planCode: 'team',
      interval: 'month',
    })

    setBillingConfigForTests({ enabled: false, enforcement: 'off' })
    invalidateEntitlementCache()
    expect(await json(await app.request('/api/billing/entitlement'))).toEqual({
      enabled: false,
      planCode: 'self_hosted',
    })
  })

  it('lists the organization’s invoices for the owner and survives a Stripe failure', async () => {
    const app = await createApp()
    // No Stripe customer yet: an empty list, not an error.
    expect(await json(await app.request('/api/billing/invoices'))).toEqual({ invoices: [] })

    const customerId = await bindCustomer(AUTHLESS_ORG_ID)
    gateway.invoices.set(customerId, [
      {
        id: 'in_2',
        number: 'DURA-0002',
        status: 'open',
        total: 900,
        amountDue: 900,
        currency: 'usd',
        created: new Date('2026-11-01T00:00:00Z'),
        hostedInvoiceUrl: 'https://invoice.stripe.test/in_2',
        invoicePdf: 'https://invoice.stripe.test/in_2.pdf',
      },
      {
        id: 'in_1',
        number: 'DURA-0001',
        status: 'paid',
        total: 900,
        amountDue: 0,
        currency: 'usd',
        created: new Date('2026-10-01T00:00:00Z'),
        hostedInvoiceUrl: 'https://invoice.stripe.test/in_1',
        invoicePdf: null,
      },
    ])
    const { invoices } = await json(await app.request('/api/billing/invoices'))
    expect(invoices).toHaveLength(2)
    expect(invoices[0]).toEqual({
      id: 'in_2',
      number: 'DURA-0002',
      status: 'open',
      total: 900,
      amountDue: 900,
      currency: 'usd',
      created: '2026-11-01T00:00:00.000Z',
      hostedInvoiceUrl: 'https://invoice.stripe.test/in_2',
      invoicePdf: 'https://invoice.stripe.test/in_2.pdf',
    })

    gateway.failInvoices = true
    const failed = await app.request('/api/billing/invoices')
    expect(failed.status).toBe(502)
    expect((await json(failed)).code).toBe('invoices_unavailable')
  })

  it('opens the Customer Portal on the screen the owner asked for', async () => {
    const app = await createApp()
    const portal = (body: unknown) =>
      app.request('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    // No Stripe customer: a clear refusal rather than a broken link.
    const none = await portal({})
    expect(none.status).toBe(400)
    expect((await json(none)).code).toBe('no_billing_account')

    await subscribe(AUTHLESS_ORG_ID)
    const lastFlow = () => gateway.portalCalls.at(-1)?.flow ?? null

    // An old client that posts no body still gets the portal home.
    expect((await app.request('/api/billing/portal', { method: 'POST' })).status).toBe(200)
    expect(lastFlow()).toBeNull()

    await portal({ intent: 'change_plan', plan: 'business', interval: 'year' })
    expect(lastFlow()).toEqual({
      type: 'subscription_update_confirm',
      subscriptionId: 'sub_1',
      itemId: 'si_1',
      priceId: PRICES.business.year,
    })
    // The price they already pay: nothing to confirm, so the plan picker opens.
    await portal({ intent: 'change_plan', plan: 'team', interval: 'month' })
    expect(lastFlow()).toEqual({ type: 'subscription_update', subscriptionId: 'sub_1' })

    await portal({ intent: 'payment_method' })
    expect(lastFlow()).toEqual({ type: 'payment_method_update' })

    await portal({ intent: 'cancel' })
    expect(lastFlow()).toEqual({ type: 'subscription_cancel', subscriptionId: 'sub_1' })

    // Already ending: the portal home is where the customer can resume it.
    await subscribe(AUTHLESS_ORG_ID, { cancelAt: new Date(Date.now() + 86_400_000) })
    await portal({ intent: 'cancel' })
    expect(lastFlow()).toBeNull()
    expect(gateway.portalCalls.at(-1)?.returnUrl).toContain('/settings/billing?portal=returned')
  })

  it('restores a paused connection as soon as the customer makes room', async () => {
    const app = await createApp()
    const { first, second } = await downgradeWithTwoConnections(app)
    expect(await suspendedIdsOf('connection')).toEqual([second.id])

    const removed = await app.request(`/api/connections/${first.id}`, { method: 'DELETE' })
    expect(removed.status).toBe(200)
    expect(await suspendedIdsOf('connection')).toEqual([])
    const listed = await json(await app.request('/api/connections'))
    expect(listed.connections).toMatchObject([{ id: second.id, suspended: false }])
  })

  it('drops the pause on a resource the customer disables, and re-enabling needs room', async () => {
    const app = await createApp()
    const { first, second } = await downgradeWithTwoConnections(app)
    const patch = (id: string, enabled: boolean) =>
      app.request(`/api/connections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })

    // Disabling the paused connection clears its pause instead of leaving a stale one.
    expect((await patch(second.id, false)).status).toBe(200)
    expect(await suspendedIdsOf('connection')).toEqual([])
    // The plan's one connection is in use, so it cannot come back yet.
    expect((await patch(second.id, true)).status).toBe(409)
    expect((await patch(first.id, false)).status).toBe(200)
    const enabled = await patch(second.id, true)
    expect(enabled.status).toBe(200)
    expect((await json(enabled)).connection).toMatchObject({ enabled: true, suspended: false })
  })

  it('pauses alert rules with their connection and lets them be cleaned up', async () => {
    const app = await createApp()
    await subscribe(AUTHLESS_ORG_ID)
    const first = (await json(await createConnection(app, 'first'))).connection
    const second = (await json(await createConnection(app, 'second'))).connection
    const db = await getDb()
    const rule = (connectionId: string, name: string) => ({
      organizationId: AUTHLESS_ORG_ID,
      connectionId,
      name,
      type: 'job_failed' as const,
      config: {},
    })
    await db
      .insert(alertRule)
      .values([rule(first.id, 'f1'), rule(second.id, 's1'), rule(second.id, 's2')])

    await subscribe(AUTHLESS_ORG_ID, { status: 'canceled', endedAt: new Date() })
    await materializeEntitlement(AUTHLESS_ORG_ID, {
      reason: 'test',
      now: new Date(Date.now() + 8 * 86_400_000),
    })
    invalidateEntitlementCache()

    // Three rules fit Free's allowance of three, but two watch a paused
    // connection: they are paused with it and stop using the allowance.
    expect(await suspendedIdsOf('connection')).toEqual([second.id])
    expect(await suspendedIdsOf('alert_rule')).toHaveLength(2)
    const usage = await billingRepository.getUsage(AUTHLESS_ORG_ID)
    expect(usage['alerts.enabled']).toBe(1)

    // The paused connection still lists its rules (flagged) and lets them go.
    const queues = await app.request(`/api/c/${second.id}/queues`)
    expect(queues.status).toBe(403)
    expect((await json(queues)).code).toBe('connection_suspended')
    const listed = await json(await app.request(`/api/c/${second.id}/alerts/rules`))
    expect(listed.rules).toHaveLength(2)
    expect(listed.rules.every((r: { suspended: boolean }) => r.suspended)).toBe(true)
    const active = await json(await app.request(`/api/c/${first.id}/alerts/rules`))
    expect(active.rules).toMatchObject([{ name: 'f1', suspended: false }])

    const blocked = await app.request(`/api/connections/${second.id}`, { method: 'DELETE' })
    expect(blocked.status).toBe(409)
    expect((await json(blocked)).code).toBe('connection_has_alert_rules')
    for (const paused of listed.rules) {
      const deleted = await app.request(`/api/c/${second.id}/alerts/rules/${paused.id}`, {
        method: 'DELETE',
      })
      expect(deleted.status).toBe(202)
    }
    // Deleting clears the pauses too; nothing stale is left behind.
    expect(await suspendedIdsOf('alert_rule')).toEqual([])
  })

  it('lets rules on a paused connection be turned off but not changed otherwise', async () => {
    const app = await createApp()
    const { second } = await downgradeWithTwoConnections(app)
    const db = await getDb()
    const [paused] = await db
      .insert(alertRule)
      .values({
        organizationId: AUTHLESS_ORG_ID,
        connectionId: second.id,
        name: 'on-paused',
        type: 'job_failed' as const,
        config: {},
      })
      .returning()
    const patch = (body: unknown) =>
      app.request(`/api/c/${second.id}/alerts/rules/${paused!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    expect((await patch({ name: 'renamed' })).status).toBe(403)
    expect((await patch({ enabled: false, name: 'renamed' })).status).toBe(403)
    expect((await patch({ enabled: false })).status).toBe(200)
  })

  it('never pauses anything while only restoring', async () => {
    const app = await createApp()
    const { second } = await downgradeWithTwoConnections(app)
    const db = await getDb()
    // A rule that predates rule-follows-connection pausing: still running.
    await db.insert(alertRule).values({
      organizationId: AUTHLESS_ORG_ID,
      connectionId: second.id,
      name: 'legacy',
      type: 'job_failed' as const,
      config: {},
    })
    expect(await suspendedIdsOf('connection')).toEqual([second.id])
    expect(await rebalanceCapacity(AUTHLESS_ORG_ID)).toBe(0)
    expect(await suspendedIdsOf('alert_rule')).toEqual([])
  })

  it('does not offer or accept rules on a paused connection in the allocation', async () => {
    const app = await createApp()
    const { first, second } = await downgradeWithTwoConnections(app)
    const db = await getDb()
    const [onPaused] = await db
      .insert(alertRule)
      .values([
        {
          organizationId: AUTHLESS_ORG_ID,
          connectionId: second.id,
          name: 'on-paused',
          type: 'job_failed' as const,
          config: {},
        },
        {
          organizationId: AUTHLESS_ORG_ID,
          connectionId: first.id,
          name: 'on-active',
          type: 'job_failed' as const,
          config: {},
        },
      ])
      .returning()
    await materializeEntitlement(AUTHLESS_ORG_ID, {
      reason: 'test',
      now: new Date(Date.now() + 8 * 86_400_000),
    })
    invalidateEntitlementCache()

    const overview = await json(await app.request('/api/billing'))
    const offered = overview.allocation['alerts.enabled'].map((o: { name: string }) => o.name)
    expect(offered).toEqual(['on-active'])

    const saved = await app.request('/api/billing/allocation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keep: { 'alerts.enabled': [onPaused!.id] } }),
    })
    expect(saved.status).toBe(400)
    expect((await json(saved)).code).toBe('allocation_rule_connection_paused')
  })

  it('leaves rules on a connection the customer disabled out of plan pauses', async () => {
    const app = await createApp()
    await subscribe(AUTHLESS_ORG_ID)
    const first = (await json(await createConnection(app, 'first'))).connection
    const second = (await json(await createConnection(app, 'second'))).connection
    const db = await getDb()
    await db.insert(alertRule).values({
      organizationId: AUTHLESS_ORG_ID,
      connectionId: first.id,
      name: 'on-first',
      type: 'job_failed' as const,
      config: {},
    })
    await subscribe(AUTHLESS_ORG_ID, { status: 'canceled', endedAt: new Date() })
    await materializeEntitlement(AUTHLESS_ORG_ID, {
      reason: 'test',
      now: new Date(Date.now() + 8 * 86_400_000),
    })
    invalidateEntitlementCache()
    expect(await suspendedIdsOf('connection')).toEqual([second.id])

    // Disabling the active connection makes room for the paused one. Its rule
    // is off because the connection is, not because of the plan.
    const disabled = await app.request(`/api/connections/${first.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })
    expect(disabled.status).toBe(200)
    expect(await billingRepository.listSuspensions(AUTHLESS_ORG_ID)).toEqual([])
    const entitlement = await json(await app.request('/api/billing/entitlement'))
    expect(entitlement.suspended).toEqual([])
  })

  it('lets rules follow connections chosen in the same allocation', async () => {
    const app = await createApp()
    await subscribe(AUTHLESS_ORG_ID)
    const first = (await json(await createConnection(app, 'first'))).connection
    const second = (await json(await createConnection(app, 'second'))).connection
    const db = await getDb()
    const rule = (connectionId: string, name: string) => ({
      organizationId: AUTHLESS_ORG_ID,
      connectionId,
      name,
      type: 'job_failed' as const,
      config: {},
    })
    const [onFirst, onSecond] = await db
      .insert(alertRule)
      .values([rule(first.id, 'on-first'), rule(second.id, 'on-second')])
      .returning()
    await subscribe(AUTHLESS_ORG_ID, { status: 'canceled', endedAt: new Date() })
    await materializeEntitlement(AUTHLESS_ORG_ID, {
      reason: 'test',
      now: new Date(Date.now() + 8 * 86_400_000),
    })
    invalidateEntitlementCache()
    expect(await suspendedIdsOf('alert_rule')).toEqual([onSecond!.id])

    const allocate = (keep: Record<string, string[]>) =>
      app.request('/api/billing/allocation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep }),
      })

    // Swapping which connection stays: its rule may be chosen in the same request.
    const swapped = await allocate({
      'connections.enabled': [second.id],
      'alerts.enabled': [onSecond!.id],
    })
    expect(swapped.status).toBe(200)
    expect(await suspendedIdsOf('connection')).toEqual([first.id])
    expect(await suspendedIdsOf('alert_rule')).toEqual([onFirst!.id])

    // Choosing only connections still moves the rules with them.
    expect((await allocate({ 'connections.enabled': [first.id] })).status).toBe(200)
    expect(await suspendedIdsOf('connection')).toEqual([second.id])
    expect(await suspendedIdsOf('alert_rule')).toEqual([onSecond!.id])

    // A rule whose connection this allocation leaves paused is refused, unchanged.
    const refused = await allocate({ 'alerts.enabled': [onSecond!.id] })
    expect(refused.status).toBe(400)
    expect((await json(refused)).code).toBe('allocation_rule_connection_paused')
    expect(await suspendedIdsOf('alert_rule')).toEqual([onSecond!.id])
  })

  it('sweeps only organizations where a paused resource can come back', async () => {
    const app = await createApp()
    const { first, second } = await downgradeWithTwoConnections(app)
    expect(await billingRepository.listOrganizationsWithRestorableSuspensions()).toEqual([])

    // A pause left behind for a resource that no longer exists is pruned.
    await billingRepository.suspend(
      AUTHLESS_ORG_ID,
      [{ kind: 'service_account', resourceId: 'gone' }],
      'test'
    )
    expect(await billingRepository.pruneStaleSuspensions()).toBe(1)
    expect(await suspendedIdsOf('connection')).toEqual([second.id])

    // Room freed without an API call (the route would rebalance itself).
    const db = await getDb()
    await db.update(redisConnection).set({ enabled: false }).where(eq(redisConnection.id, first.id))
    expect(await billingRepository.listOrganizationsWithRestorableSuspensions()).toEqual([
      AUTHLESS_ORG_ID,
    ])
    await runEntitlementSweep()
    expect(await suspendedIdsOf('connection')).toEqual([])
  })

  it('applies only the limits the owner chose and keeps the window for the rest', async () => {
    const app = await createApp()
    await subscribe(AUTHLESS_ORG_ID)
    const first = (await json(await createConnection(app, 'first'))).connection
    const second = (await json(await createConnection(app, 'second'))).connection
    const db = await getDb()
    await db.insert(user).values({
      id: 'teammate',
      name: 'Teammate',
      email: 'teammate@example.com',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(member).values({
      id: 'teammate-member',
      organizationId: AUTHLESS_ORG_ID,
      userId: 'teammate',
      role: 'member',
      createdAt: new Date(Date.now() + 1000),
    })
    // Downgrade now: connections and members are over Free, inside the window.
    await subscribe(AUTHLESS_ORG_ID, { status: 'canceled', endedAt: new Date() })
    expect(await billingRepository.listSuspensions(AUTHLESS_ORG_ID)).toEqual([])

    const saved = await app.request('/api/billing/allocation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keep: { 'connections.enabled': [second.id] } }),
    })
    expect(saved.status).toBe(200)
    expect(await suspendedIdsOf('connection')).toEqual([first.id])
    // The teammate's seat was not part of the choice and keeps its window.
    expect(await suspendedIdsOf('member')).toEqual([])
    const overview = await json(await app.request('/api/billing'))
    expect(overview.capacityAdjustmentExpiresAt).not.toBeNull()
  })

  it('hides the beta grant from the overview once it has ended', async () => {
    const db = await getDb()
    await db
      .update(organization)
      .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(organization.id, AUTHLESS_ORG_ID))
    const grantUntil = new Date(Date.now() + 40 * 86_400_000)
    setBillingConfigForTests(
      billingConfig({
        launchAt: new Date(Date.now() - 86_400_000),
        migrationGrantUntil: grantUntil,
      })
    )
    invalidateEntitlementCache()
    const app = await createApp()
    const during = await json(await app.request('/api/billing'))
    expect(during.source).toBe('migration_grant')
    expect(during.migrationGrantExpiresAt).toBe(grantUntil.toISOString())

    await materializeEntitlement(AUTHLESS_ORG_ID, {
      reason: 'test',
      now: new Date(grantUntil.getTime() + 1000),
    })
    invalidateEntitlementCache()
    // The stored expiry is now in the past; getEntitlement would re-materialize
    // on every read, so the overview must not present it as upcoming.
    const stored = await billingRepository.findEntitlement(AUTHLESS_ORG_ID)
    expect(stored?.source).toBe('free')
    expect(stored?.migrationGrantExpiresAt).not.toBeNull()
    const afterExpiry = new Date(grantUntil.getTime() + 60_000)
    // An ended grant is history, not a deadline: the organization must not be
    // recomputed on every sweep and every read from then on.
    expect(await billingRepository.listEntitlementsDue(afterExpiry)).not.toContain(AUTHLESS_ORG_ID)
  })

  describe('beta transition notices', () => {
    const day = 86_400_000
    let sentEmails: Array<{
      to: string
      kind: string
      idempotencyKey: string
      restrictions: string[]
      featuresInUse: string[]
    }>

    async function startGrant(grantDays: number) {
      setBillingConfigForTests(
        billingConfig({
          launchAt: new Date(Date.now() + day),
          migrationGrantUntil: new Date(Date.now() + grantDays * day),
        })
      )
      invalidateEntitlementCache()
      await getEntitlement(AUTHLESS_ORG_ID)
    }

    beforeEach(() => {
      sentEmails = []
      setTransitionEmailSenderForTests(async (email) => {
        sentEmails.push({
          to: email.to,
          kind: email.kind,
          idempotencyKey: email.idempotencyKey,
          restrictions: email.restrictions,
          featuresInUse: email.featuresInUse,
        })
        return { id: `msg_${sentEmails.length}` }
      })
    })

    afterEach(() => setTransitionEmailSenderForTests(null))

    it('emails every owner once, with what the Free plan would change', async () => {
      await startGrant(31)
      const app = await createApp()
      await createConnection(app, 'a')
      await createConnection(app, 'b')

      const first = await sendTransitionNotices()
      expect(first.sent).toBe(1)
      expect(sentEmails[0]).toMatchObject({ kind: 'transition_notice' })
      expect(sentEmails[0].restrictions).toEqual([
        'Enabled Redis connections: 2 in use (a, b); Free includes 1, and you choose which stay active',
      ])

      // Running the launch again never emails an owner twice.
      const second = await sendTransitionNotices()
      expect(second.sent).toBe(0)
      expect(second.alreadySent).toBe(1)
      expect(sentEmails).toHaveLength(1)
    })

    it('tells organizations whose usage fits Free that only paid features change', async () => {
      await startGrant(31)
      await sendTransitionNotices()
      expect(sentEmails[0].restrictions).toEqual([])
      expect(sentEmails[0].featuresInUse).toEqual([])
    })

    it('retries an owner whose email failed, without resending to others', async () => {
      await startGrant(31)
      setTransitionEmailSenderForTests(async () => {
        throw new Error('provider down')
      })
      const failed = await sendTransitionNotices()
      expect(failed.failed).toHaveLength(1)

      setTransitionEmailSenderForTests(async (email) => {
        sentEmails.push({
          to: email.to,
          kind: email.kind,
          idempotencyKey: email.idempotencyKey,
          restrictions: [],
          featuresInUse: [],
        })
        return { id: 'msg_retry' }
      })
      const retried = await sendTransitionNotices()
      expect(retried.sent).toBe(1)
    })

    it('sends reminders 7 days and 1 day before the grant ends, only after the notice', async () => {
      await startGrant(31)
      const grantEnd = new Date(Date.now() + 31 * day)

      // No notice yet: reminders never go out on their own.
      expect((await sendDueReminders(new Date(grantEnd.getTime() - 6 * day))).sent).toBe(0)

      await sendTransitionNotices()
      expect((await sendDueReminders(new Date(grantEnd.getTime() - 10 * day))).sent).toBe(0)
      expect((await sendDueReminders(new Date(grantEnd.getTime() - 6 * day))).sent).toBe(1)
      expect((await sendDueReminders(new Date(grantEnd.getTime() - 5 * day))).sent).toBe(0)
      expect((await sendDueReminders(new Date(grantEnd.getTime() - 12 * 3_600_000))).sent).toBe(1)
      expect(sentEmails.map((email) => email.kind)).toEqual([
        'transition_notice',
        'reminder_7d',
        'reminder_1d',
      ])
    })

    it('stops reminding organizations that subscribed', async () => {
      await startGrant(31)
      await sendTransitionNotices()
      await subscribe(AUTHLESS_ORG_ID)
      const grantEnd = new Date(Date.now() + 31 * day)
      expect((await sendDueReminders(new Date(grantEnd.getTime() - 6 * day))).sent).toBe(0)
    })

    it('keeps reminding an organization whose first payment is incomplete', async () => {
      await startGrant(31)
      await sendTransitionNotices()
      await subscribe(AUTHLESS_ORG_ID, { status: 'incomplete' })
      const grantEnd = new Date(Date.now() + 31 * day)
      expect((await sendDueReminders(new Date(grantEnd.getTime() - 6 * day))).sent).toBe(1)
    })

    it('shows the in-app banner only after the notice and until a plan is chosen', async () => {
      await startGrant(31)
      const app = await createApp()
      expect((await json(await app.request('/api/billing'))).transition).toBeNull()

      await sendTransitionNotices()
      const overview = await json(await app.request('/api/billing'))
      expect(overview.transition.deadline).toBe(overview.migrationGrantExpiresAt)
      expect(overview.transition.noticeSentAt).toBeTruthy()

      await subscribe(AUTHLESS_ORG_ID)
      invalidateEntitlementCache()
      expect((await json(await app.request('/api/billing'))).transition).toBeNull()
    })

    it('retries a send it could not record under the same idempotency key', async () => {
      await startGrant(31)
      const spy = spyOn(billingRepository, 'completeNoticeDelivery').mockImplementationOnce(
        async () => {
          throw new Error('database unavailable')
        }
      )
      try {
        const first = await sendTransitionNotices()
        // The provider accepted it, so it counts as sent; only the record is missing.
        expect(first.sent).toBe(1)
        expect(first.delivered.has(AUTHLESS_ORG_ID)).toBe(true)
        expect(first.failed[0].error).toContain('Sent, but recording the delivery failed')

        // Still claimed: an immediate rerun does not send again.
        expect((await sendTransitionNotices()).sent).toBe(0)

        // Once the claim is stale it is retried with the same key, which the
        // provider deduplicates.
        const later = await sendTransitionNotices(new Date(Date.now() + 2 * 3_600_000))
        expect(later.sent).toBe(1)
        expect(sentEmails).toHaveLength(2)
        expect(sentEmails[1].idempotencyKey).toBe(sentEmails[0].idempotencyKey)
      } finally {
        spy.mockRestore()
      }
    })

    it('keeps the idempotency key when the provider may have accepted the send', async () => {
      await startGrant(31)
      const keys: string[] = []
      setTransitionEmailSenderForTests(async (email) => {
        keys.push(email.idempotencyKey)
        throw new BillingEmailError('Unable to fetch data', true)
      })
      const uncertain = await sendTransitionNotices()
      expect(uncertain.failed[0].error).toContain('delivery uncertain')

      setTransitionEmailSenderForTests(async (email) => {
        keys.push(email.idempotencyKey)
        return { id: 'msg_retry' }
      })
      // Left claimed, so only a stale retry sends again, under the same key.
      expect((await sendTransitionNotices()).sent).toBe(0)
      const later = await sendTransitionNotices(new Date(Date.now() + 2 * 3_600_000))
      expect(later.sent).toBe(1)
      expect(keys).toHaveLength(2)
      expect(keys[1]).toBe(keys[0])
    })

    it('ignores a slow attempt finishing after its claim was taken over', async () => {
      await startGrant(31)
      const claim = async (now: Date) =>
        billingRepository.claimNoticeDelivery({
          organizationId: AUTHLESS_ORG_ID,
          kind: 'transition_notice',
          userId: 'owner-x',
          email: 'owner-x@example.com',
          now,
          staleBefore: new Date(now.getTime() - 3_600_000),
        })
      const first = await claim(new Date())
      const second = await claim(new Date(Date.now() + 2 * 3_600_000))
      expect(first && second).toBeTruthy()
      if (!first || !second) return
      expect(
        await billingRepository.completeNoticeDelivery(second, {
          sent: true,
          providerMessageId: 'msg_new',
        })
      ).toBe(true)
      // The first attempt fails late; the delivered row must stay delivered.
      expect(
        await billingRepository.completeNoticeDelivery(first, { sent: false, error: 'timeout' })
      ).toBe(false)
      const [row] = await billingRepository.listNoticeDeliveries(AUTHLESS_ORG_ID)
      expect(row.status).toBe('sent')
    })

    it('gives an owner added later their own reminder gap', async () => {
      await startGrant(31)
      await sendTransitionNotices()
      const db = await getDb()
      await db.insert(user).values({
        id: 'late-owner',
        name: 'Late owner',
        email: 'late-owner@example.com',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await db.insert(member).values({
        id: 'late-owner-member',
        organizationId: AUTHLESS_ORG_ID,
        userId: 'late-owner',
        role: 'owner',
        createdAt: new Date(),
      })
      const grantEnd = new Date(Date.now() + 31 * day)
      // Six days left: the original owner is due a reminder; the new owner only
      // gets the notice now, and no reminder in the same pass.
      await sendDueReminders(new Date(grantEnd.getTime() - 6 * day))
      expect(sentEmails.map((email) => [email.to, email.kind]).slice(1)).toEqual(
        expect.arrayContaining([
          ['late-owner@example.com', 'transition_notice'],
          [expect.not.stringContaining('late-owner'), 'reminder_7d'],
        ])
      )
      expect(
        sentEmails.filter((email) => email.to === 'late-owner@example.com').map((e) => e.kind)
      ).toEqual(['transition_notice'])
    })

    it('hides the in-app banner while an operator override provides access', async () => {
      await startGrant(31)
      await sendTransitionNotices()
      await billingRepository.createOverride({
        organizationId: AUTHLESS_ORG_ID,
        planCode: 'team',
        limits: null,
        reason: 'test',
        createdBy: 'test',
        expiresAt: new Date(Date.now() + 60 * day),
      })
      await materializeEntitlement(AUTHLESS_ORG_ID, { reason: 'test' })
      invalidateEntitlementCache()
      const app = await createApp()
      const overview = await json(await app.request('/api/billing'))
      expect(overview.source).toBe('override')
      expect(overview.transition).toBeNull()
    })

    it('finds organizations whose entitlement predates the launch dates', async () => {
      // Materialized before launch was configured: no grant recorded.
      await getEntitlement(AUTHLESS_ORG_ID)
      setBillingConfigForTests(
        billingConfig({
          launchAt: new Date(Date.now() + day),
          migrationGrantUntil: new Date(Date.now() + 31 * day),
        })
      )
      invalidateEntitlementCache()
      expect(await listTransitionAudience()).toHaveLength(0)

      const dryRun = await refreshGrantEligibility({ execute: false })
      expect(dryRun.pending.map((org) => org.id)).toEqual([AUTHLESS_ORG_ID])
      expect(await listTransitionAudience()).toHaveLength(0)

      const executed = await refreshGrantEligibility({ execute: true })
      expect(executed.refreshed).toBe(1)
      expect((await listTransitionAudience()).map((entry) => entry.organizationId)).toEqual([
        AUTHLESS_ORG_ID,
      ])
      expect((await refreshGrantEligibility({ execute: false })).pending).toHaveLength(0)
    })

    it('creates one Stripe Customer per organization, and a dry run creates none', async () => {
      const dryRun = await syncStripeCustomers({ execute: false })
      expect(dryRun.created).toBe(1)
      expect(await billingRepository.findAccount(AUTHLESS_ORG_ID)).toBeNull()

      const first = await syncStripeCustomers({ execute: true })
      expect(first.created).toBe(1)
      expect((await billingRepository.findAccount(AUTHLESS_ORG_ID))?.stripeCustomerId).toBe('cus_1')

      const second = await syncStripeCustomers({ execute: true })
      expect(second.created).toBe(0)
      expect(second.reconciled).toBe(1)
    })
  })
})
