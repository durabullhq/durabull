import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PLANS } from '@durabull/billing'
import {
  alertRule,
  billingRepository,
  closeDb,
  getDb,
  member,
  organization,
  user,
} from '@durabull/dal'
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
  syncStoredEnforcement,
} from './entitlements'
import {
  type BillingGateway,
  type CheckoutSessionSnapshot,
  type CreateCheckoutInput,
  type SubscriptionSnapshot,
  setBillingGatewayForTests,
  type WebhookEventSnapshot,
} from './gateway'
import { reconcileOrganization } from './reconcile'
import {
  dueReminder,
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
  async createPortalSession() {
    return { url: 'https://billing.stripe.test/portal' }
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
  describe('beta transition notices', () => {
    const day = 86_400_000
    let sentEmails: Array<{
      to: string
      kind: string
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
      expect(sentEmails[0]).toMatchObject({ kind: 'notice' })
      expect(sentEmails[0].restrictions).toEqual([
        'Enabled Redis connections: 2 in use, Free includes 1',
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
        sentEmails.push({ to: email.to, kind: email.kind, restrictions: [], featuresInUse: [] })
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
        'notice',
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

    it('picks the reminder by time left', () => {
      const now = new Date('2026-11-01T00:00:00Z')
      expect(dueReminder(new Date('2026-11-20T00:00:00Z'), now)).toBeNull()
      expect(dueReminder(new Date('2026-11-07T00:00:00Z'), now)).toBe('reminder_7d')
      expect(dueReminder(new Date('2026-11-01T12:00:00Z'), now)).toBe('reminder_1d')
      expect(dueReminder(new Date('2026-10-31T00:00:00Z'), now)).toBeNull()
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
