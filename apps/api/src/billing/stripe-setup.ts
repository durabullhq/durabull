import { BILLING_CATALOG_VERSION, PLANS, type PurchasablePlanCode } from '@durabull/billing'
import Stripe from 'stripe'
import { STRIPE_API_VERSION } from './gateway'
import { STRIPE_WEBHOOK_EVENTS } from './webhooks'

/** Stripe client pinned to the billing API version (for operator tooling). */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION })
}

const CATALOG: Array<{
  plan: PurchasablePlanCode
  interval: 'month' | 'year'
  env: string
}> = [
  { plan: 'team', interval: 'month', env: 'STRIPE_PRICE_TEAM_MONTHLY' },
  { plan: 'team', interval: 'year', env: 'STRIPE_PRICE_TEAM_ANNUAL' },
  { plan: 'business', interval: 'month', env: 'STRIPE_PRICE_BUSINESS_MONTHLY' },
  { plan: 'business', interval: 'year', env: 'STRIPE_PRICE_BUSINESS_ANNUAL' },
]

/**
 * Idempotently create the self-serve catalog (one Product per plan, monthly
 * and annual Prices with lookup keys) and optionally the webhook endpoint.
 * Prices are immutable: a price change creates a new lookup key version so
 * existing subscribers keep their mapped Price.
 */
export async function setupStripeCatalog(options: {
  secretKey: string
  /** The mode the operator intends; the key must match it in both directions. */
  mode: 'sandbox' | 'live'
  webhookUrl?: string
}): Promise<{ env: Record<string, string>; webhookSecret: string | null }> {
  const live = options.secretKey.startsWith('sk_live_') || options.secretKey.startsWith('rk_live_')
  if (live && options.mode !== 'live') {
    throw new Error('Refusing to create a live catalog without --live. Use a sandbox key.')
  }
  if (!live && options.mode === 'live') {
    throw new Error('--live was given but STRIPE_API_KEY is not a live key (sk_live_/rk_live_).')
  }
  const stripe = new Stripe(options.secretKey, { apiVersion: STRIPE_API_VERSION })
  const env: Record<string, string> = {}
  const products = new Map<PurchasablePlanCode, string>()

  // Listing (not search) is immediately consistent, so re-runs never duplicate.
  const activeProducts = await stripe.products.list({ active: true, limit: 100 })
  for (const plan of ['team', 'business'] as const) {
    const existing = { data: activeProducts.data.filter((p) => p.metadata?.durabull_plan === plan) }
    const product =
      existing.data[0] ??
      (await stripe.products.create({
        name: `Durabull Cloud ${PLANS[plan].name}`,
        description: PLANS[plan].description,
        metadata: { durabull_plan: plan },
      }))
    products.set(plan, product.id)
  }

  for (const entry of CATALOG) {
    const amount =
      entry.interval === 'month'
        ? PLANS[entry.plan].monthlyPriceUsd
        : PLANS[entry.plan].annualPriceUsd
    if (amount === null) continue
    const lookupKey = `durabull_${entry.plan}_${entry.interval}_${BILLING_CATALOG_VERSION}`
    const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
    const price =
      existing.data[0] ??
      (await stripe.prices.create({
        product: products.get(entry.plan) as string,
        currency: 'usd',
        unit_amount: amount * 100,
        recurring: { interval: entry.interval },
        lookup_key: lookupKey,
        tax_behavior: 'exclusive',
        metadata: { durabull_plan: entry.plan, catalog_version: BILLING_CATALOG_VERSION },
      }))
    env[entry.env] = price.id
  }

  // Customer Portal: invoices, payment methods, billing details, immediate
  // prorated switches among the Team/Business Prices, cancellation at period end.
  const portalProducts = (['team', 'business'] as const).map((plan) => ({
    product: products.get(plan) as string,
    prices: CATALOG.filter((entry) => entry.plan === plan).map((entry) => env[entry.env]),
  }))
  const portalFeatures = {
    customer_update: { enabled: true, allowed_updates: ['email', 'address', 'tax_id', 'name'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: 'at_period_end',
      cancellation_reason: {
        enabled: true,
        options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
      },
    },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ['price'],
      proration_behavior: 'always_invoice',
      products: portalProducts,
    },
  } satisfies Stripe.BillingPortal.ConfigurationCreateParams['features']
  const configurations = await stripe.billingPortal.configurations.list({ limit: 100 })
  const existingPortal = configurations.data.find(
    (configuration) => configuration.metadata?.durabull === BILLING_CATALOG_VERSION
  )
  const portal = existingPortal
    ? await stripe.billingPortal.configurations.update(existingPortal.id, {
        features: portalFeatures,
      })
    : await stripe.billingPortal.configurations.create({
        business_profile: {
          headline: 'Durabull Cloud billing',
          privacy_policy_url: 'https://durabull.io/privacy',
          terms_of_service_url: 'https://durabull.io/terms',
        },
        features: portalFeatures,
        metadata: { durabull: BILLING_CATALOG_VERSION },
      })
  env.STRIPE_PORTAL_CONFIGURATION_ID = portal.id

  // Self-serve Checkout starts card-only (cards and card wallets) until the
  // asynchronous lifecycle of other payment methods has been tested.
  const pmcName = `Durabull Cloud cards ${BILLING_CATALOG_VERSION}`
  const pmcs = await stripe.paymentMethodConfigurations.list({ limit: 100 })
  const pmc =
    pmcs.data.find((configuration) => configuration.name === pmcName) ??
    (await stripe.paymentMethodConfigurations.create({ name: pmcName }))
  const allowed = new Set(['card', 'apple_pay', 'google_pay'])
  const updates: Record<string, { display_preference: { preference: 'on' | 'off' } }> = {}
  for (const [type, value] of Object.entries(pmc as unknown as Record<string, unknown>)) {
    if (value && typeof value === 'object' && 'display_preference' in value) {
      updates[type] = { display_preference: { preference: allowed.has(type) ? 'on' : 'off' } }
    }
  }
  await stripe.paymentMethodConfigurations.update(
    pmc.id,
    updates as Stripe.PaymentMethodConfigurationUpdateParams
  )
  env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID = pmc.id

  let webhookSecret: string | null = null
  if (options.webhookUrl) {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
    const existing = endpoints.data.find((endpoint) => endpoint.url === options.webhookUrl)
    if (existing) {
      await stripe.webhookEndpoints.update(existing.id, {
        enabled_events: [...STRIPE_WEBHOOK_EVENTS],
      })
    } else {
      const created = await stripe.webhookEndpoints.create({
        url: options.webhookUrl,
        enabled_events: [...STRIPE_WEBHOOK_EVENTS],
        api_version: STRIPE_API_VERSION,
        description: 'Durabull Cloud billing',
      })
      webhookSecret = created.secret ?? null
    }
  }

  return { env, webhookSecret }
}
