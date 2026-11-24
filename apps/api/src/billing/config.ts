import {
  BILLING_CATALOG_VERSION,
  type BillingInterval,
  isPlanCode,
  type PlanCode,
  type PurchasablePlanCode,
} from '@durabull/billing'
import { getDatabaseMode } from '@durabull/dal'
import { env } from '@durabull/env'
import { isAuthlessMode } from '../lib/authless'

export const TRIAL_PERIOD_DAYS = 14

export interface PriceMapping {
  planCode: PlanCode
  interval: BillingInterval
  catalogVersion: string
  /** Only current self-serve Prices can start a new purchase. */
  purchasable: boolean
}

export interface BillingConfig {
  enabled: boolean
  purchasesEnabled: boolean
  trialsEnabled: boolean
  appBaseUrl: string
  stripe: {
    secretKey: string | null
    webhookSecret: string | null
    portalConfigurationId: string | null
    /** Card-only payment method configuration for self-serve Checkout. */
    paymentMethodConfigurationId: string | null
    livemode: boolean
  }
  /** Allowlisted Price id → plan. Unknown Prices never grant access. */
  prices: ReadonlyMap<string, PriceMapping>
  /** Current Price ids by plan and interval for new purchases. */
  purchasePrices: Partial<Record<PurchasablePlanCode, Partial<Record<BillingInterval, string>>>>
  enterpriseProductIds: ReadonlySet<string>
}

function parseList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  )
}

function parseLegacyPrices(raw: string | undefined): Map<string, PriceMapping> {
  const map = new Map<string, PriceMapping>()
  if (!raw?.trim()) return map
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('DURABULL_STRIPE_LEGACY_PRICES must be a JSON object.')
  }
  if (!parsed || typeof parsed !== 'object') return map
  for (const [priceId, value] of Object.entries(parsed as Record<string, unknown>)) {
    const [plan, interval, version] = String(value).split(':')
    if (!isPlanCode(plan) || (interval !== 'month' && interval !== 'year')) {
      throw new Error(`DURABULL_STRIPE_LEGACY_PRICES has an invalid mapping for ${priceId}.`)
    }
    map.set(priceId, {
      planCode: plan,
      interval,
      catalogVersion: version || 'legacy',
      purchasable: false,
    })
  }
  return map
}

export function loadBillingConfig(): BillingConfig {
  const enabled = env.DURABULL_BILLING_ENABLED === true
  const prices = parseLegacyPrices(env.DURABULL_STRIPE_LEGACY_PRICES)
  const purchasePrices: BillingConfig['purchasePrices'] = {}
  const current: Array<[PurchasablePlanCode, BillingInterval, string | undefined]> = [
    ['team', 'month', env.STRIPE_PRICE_TEAM_MONTHLY],
    ['team', 'year', env.STRIPE_PRICE_TEAM_ANNUAL],
    ['business', 'month', env.STRIPE_PRICE_BUSINESS_MONTHLY],
    ['business', 'year', env.STRIPE_PRICE_BUSINESS_ANNUAL],
  ]
  for (const [planCode, interval, priceId] of current) {
    if (!priceId) continue
    prices.set(priceId, {
      planCode,
      interval,
      catalogVersion: BILLING_CATALOG_VERSION,
      purchasable: true,
    })
    purchasePrices[planCode] = { ...purchasePrices[planCode], [interval]: priceId }
  }
  const secretKey = env.STRIPE_API_KEY?.trim() || env.STRIPE_SECRET_KEY?.trim() || null

  return {
    enabled,
    purchasesEnabled: env.DURABULL_BILLING_PURCHASES_ENABLED !== false,
    trialsEnabled: env.DURABULL_BILLING_TRIALS_ENABLED !== false,
    appBaseUrl: (env.APP_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
    stripe: {
      secretKey,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim() || null,
      portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID?.trim() || null,
      paymentMethodConfigurationId: env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID?.trim() || null,
      livemode: secretKey?.startsWith('sk_live_') || secretKey?.startsWith('rk_live_') || false,
    },
    prices,
    purchasePrices,
    enterpriseProductIds: parseList(env.STRIPE_ENTERPRISE_PRODUCT_IDS),
  }
}

let cachedConfig: BillingConfig | null = null

export function getBillingConfig(): BillingConfig {
  if (!cachedConfig) cachedConfig = loadBillingConfig()
  return cachedConfig
}

/** Tests replace the configuration wholesale; pass null to reload from env. */
export function setBillingConfigForTests(config: Partial<BillingConfig> | null): void {
  cachedConfig = config ? { ...loadBillingConfig(), ...config } : null
}

export function isBillingEnabled(): boolean {
  return getBillingConfig().enabled
}

export function getBillingUrl(orgSlug?: string | null): string {
  const base = getBillingConfig().appBaseUrl
  // Without a slug, /settings redirects to the active organization's billing page.
  return orgSlug ? `${base}/${orgSlug}/settings/billing` : `${base}/settings?section=billing`
}

/**
 * Deployment problems that make Cloud billing unsafe to run. Billing stays a
 * managed-Cloud deployment policy: local desktop and self-hosted installs never
 * need Stripe to unlock local operations.
 */
export function validateBillingDeployment(config = getBillingConfig()): string[] {
  if (!config.enabled) return []
  const problems: string[] = []
  if (isAuthlessMode()) {
    problems.push('DURABULL_BILLING_ENABLED cannot be combined with DURABULL_AUTHLESS.')
  }
  if (env.DURABULL_ENV_CONNECTIONS === true) {
    problems.push('DURABULL_BILLING_ENABLED cannot be combined with DURABULL_ENV_CONNECTIONS.')
  }
  if (env.NODE_ENV === 'production' && getDatabaseMode() !== 'postgres') {
    problems.push('Cloud billing requires PostgreSQL (DATABASE_URL) in production.')
  }
  if (!config.stripe.secretKey) problems.push('STRIPE_API_KEY is required.')
  if (!config.stripe.webhookSecret) problems.push('STRIPE_WEBHOOK_SECRET is required.')
  for (const plan of ['team', 'business'] as const) {
    for (const interval of ['month', 'year'] as const) {
      if (!config.purchasePrices[plan]?.[interval]) {
        problems.push(
          `STRIPE_PRICE_${plan.toUpperCase()}_${interval === 'month' ? 'MONTHLY' : 'ANNUAL'} is required.`
        )
      }
    }
  }
  if (env.NODE_ENV === 'production' && !config.appBaseUrl.startsWith('https://')) {
    problems.push('APP_BASE_URL must use https when Cloud billing is enabled in production.')
  }
  if (config.stripe.livemode && env.NODE_ENV !== 'production') {
    problems.push('A live Stripe key is configured outside production; use a sandbox key.')
  }
  return problems
}

export function assertBillingDeploymentSafe(): void {
  const problems = validateBillingDeployment()
  if (problems.length > 0) {
    throw new Error(`Unsafe billing configuration:\n- ${problems.join('\n- ')}`)
  }
}
