import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PLANS } from '@durabull/billing'
import { billingRepository, closeDb, getDb, organization } from '@durabull/dal'
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
    ).rejects.toMatchObject({ body: { code: 'plan_limit_reached' } })
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
})
