import Stripe from 'stripe'
import { getBillingConfig } from './config'

/**
 * Stripe API version pinned together with the `stripe` SDK major. Upgrade both
 * deliberately and re-run the billing lifecycle tests against a sandbox.
 */
export const STRIPE_API_VERSION = '2026-09-30.endive' as const

export const ORGANIZATION_METADATA_KEY = 'durabull_organization_id'

export type StripeSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'

export interface InvoiceSnapshot {
  id: string
  status: string | null
  amountDue: number
  billingReason: string | null
  periodEnd: Date | null
}

/** Normalized subscription state; the rest of billing never touches SDK types. */
export interface SubscriptionSnapshot {
  id: string
  customerId: string
  status: StripeSubscriptionStatus
  priceId: string | null
  productId: string | null
  itemId: string | null
  interval: 'month' | 'year' | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  cancelAt: Date | null
  canceledAt: Date | null
  endedAt: Date | null
  trialStart: Date | null
  trialEnd: Date | null
  collectionMethod: 'charge_automatically' | 'send_invoice'
  pauseCollection: boolean
  created: Date
  latestInvoice: InvoiceSnapshot | null
  organizationId: string | null
}

export interface CheckoutSessionSnapshot {
  id: string
  status: 'open' | 'complete' | 'expired'
  url: string | null
  customerId: string | null
  subscriptionId: string | null
  organizationId: string | null
  expiresAt: Date | null
}

export interface WebhookEventSnapshot {
  id: string
  type: string
  livemode: boolean
  created: Date
  objectId: string | null
  customerId: string | null
  organizationId: string | null
}

export interface CreateCheckoutInput {
  customerId: string
  priceId: string
  organizationId: string
  attemptId: string
  trialDays: number | null
  successUrl: string
  cancelUrl: string
  expiresAt: Date
  idempotencyKey: string
}

export interface BillingGateway {
  createCustomer(input: {
    organizationId: string
    organizationName: string
    email: string | null
    idempotencyKey: string
  }): Promise<{ id: string; livemode: boolean }>
  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSessionSnapshot>
  retrieveCheckoutSession(id: string): Promise<CheckoutSessionSnapshot | null>
  expireCheckoutSession(id: string): Promise<void>
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>
  listCustomerSubscriptions(customerId: string): Promise<SubscriptionSnapshot[]>
  constructWebhookEvent(rawBody: string, signature: string): Promise<WebhookEventSnapshot>
}

function toDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) ? new Date(seconds * 1000) : null
}

function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id
  }
  return null
}

function metadataOrganization(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[ORGANIZATION_METADATA_KEY]
  return typeof value === 'string' && value ? value : null
}

function normalizeInvoice(value: unknown): InvoiceSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const invoice = value as Stripe.Invoice
  if (!invoice.id) return null
  return {
    id: invoice.id,
    status: invoice.status ?? null,
    amountDue: invoice.amount_due ?? 0,
    billingReason: invoice.billing_reason ?? null,
    periodEnd: toDate(invoice.period_end),
  }
}

export function normalizeSubscription(subscription: Stripe.Subscription): SubscriptionSnapshot {
  // The base plan is a single quantity-one item; period fields live on items.
  const item = subscription.items?.data?.[0]
  const price = item?.price
  const recurringInterval: string | undefined = price?.recurring?.interval
  return {
    id: subscription.id,
    customerId: idOf(subscription.customer) ?? '',
    status: subscription.status as StripeSubscriptionStatus,
    priceId: price?.id ?? null,
    productId: idOf(price?.product),
    itemId: item?.id ?? null,
    interval:
      recurringInterval === 'month' || recurringInterval === 'year' ? recurringInterval : null,
    currentPeriodStart: toDate(item?.current_period_start),
    currentPeriodEnd: toDate(item?.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    cancelAt: toDate(subscription.cancel_at),
    canceledAt: toDate(subscription.canceled_at),
    endedAt: toDate(subscription.ended_at),
    trialStart: toDate(subscription.trial_start),
    trialEnd: toDate(subscription.trial_end),
    collectionMethod:
      subscription.collection_method === 'send_invoice' ? 'send_invoice' : 'charge_automatically',
    pauseCollection: subscription.pause_collection != null,
    created: toDate(subscription.created) ?? new Date(0),
    latestInvoice: normalizeInvoice(subscription.latest_invoice),
    organizationId: metadataOrganization(subscription.metadata),
  }
}

function normalizeCheckoutSession(session: Stripe.Checkout.Session): CheckoutSessionSnapshot {
  return {
    id: session.id,
    status: (session.status ?? 'open') as CheckoutSessionSnapshot['status'],
    url: session.url ?? null,
    customerId: idOf(session.customer),
    subscriptionId: idOf(session.subscription),
    organizationId: session.client_reference_id ?? metadataOrganization(session.metadata),
    expiresAt: toDate(session.expires_at),
  }
}

export function normalizeWebhookEvent(event: Stripe.Event): WebhookEventSnapshot {
  const object = (event.data?.object ?? {}) as unknown as Record<string, unknown>
  const objectType = typeof object.object === 'string' ? object.object : ''
  const customerId = objectType === 'customer' ? idOf(object.id) : idOf(object.customer)
  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode === true,
    created: toDate(event.created) ?? new Date(),
    objectId: idOf(object.id),
    customerId,
    organizationId:
      (typeof object.client_reference_id === 'string' ? object.client_reference_id : null) ??
      metadataOrganization(object.metadata),
  }
}

export class StripeBillingGateway implements BillingGateway {
  private readonly stripe: Stripe

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    private readonly portalConfigurationId: string | null,
    private readonly paymentMethodConfigurationId: string | null = null
  ) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
      maxNetworkRetries: 2,
      timeout: 20_000,
      appInfo: { name: 'Durabull Cloud' },
    })
  }

  async createCustomer(input: {
    organizationId: string
    organizationName: string
    email: string | null
    idempotencyKey: string
  }) {
    const customer = await this.stripe.customers.create(
      {
        name: input.organizationName,
        ...(input.email ? { email: input.email } : {}),
        metadata: { [ORGANIZATION_METADATA_KEY]: input.organizationId },
      },
      { idempotencyKey: input.idempotencyKey }
    )
    return { id: customer.id, livemode: customer.livemode }
  }

  async createCheckoutSession(input: CreateCheckoutInput) {
    const metadata = {
      [ORGANIZATION_METADATA_KEY]: input.organizationId,
      durabull_checkout_attempt_id: input.attemptId,
    }
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: input.customerId,
        client_reference_id: input.organizationId,
        line_items: [{ price: input.priceId, quantity: 1 }],
        metadata,
        subscription_data: {
          metadata,
          ...(input.trialDays
            ? {
                trial_period_days: input.trialDays,
                trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
              }
            : {}),
        },
        ...(this.paymentMethodConfigurationId
          ? { payment_method_configuration: this.paymentMethodConfigurationId }
          : {}),
        // Trials start without a card; paid purchases always collect one.
        payment_method_collection: input.trialDays ? 'if_required' : 'always',
        billing_address_collection: 'auto',
        customer_update: { address: 'auto', name: 'auto' },
        tax_id_collection: { enabled: true },
        allow_promotion_codes: false,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: Math.floor(input.expiresAt.getTime() / 1000),
      },
      { idempotencyKey: input.idempotencyKey }
    )
    return normalizeCheckoutSession(session)
  }

  async retrieveCheckoutSession(id: string) {
    try {
      return normalizeCheckoutSession(await this.stripe.checkout.sessions.retrieve(id))
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) return null
      throw error
    }
  }

  async expireCheckoutSession(id: string) {
    try {
      await this.stripe.checkout.sessions.expire(id)
    } catch (error) {
      // Already completed or expired sessions cannot be expired again.
      if ((error as { statusCode?: number }).statusCode !== 400) throw error
    }
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
      ...(this.portalConfigurationId ? { configuration: this.portalConfigurationId } : {}),
    })
    return { url: session.url }
  }

  async listCustomerSubscriptions(customerId: string) {
    const snapshots: SubscriptionSnapshot[] = []
    let startingAfter: string | undefined
    for (let page = 0; page < 10; page += 1) {
      const result = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100,
        expand: ['data.latest_invoice'],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      })
      snapshots.push(...result.data.map(normalizeSubscription))
      if (!result.has_more || result.data.length === 0) break
      startingAfter = result.data[result.data.length - 1]?.id
    }
    return snapshots
  }

  async constructWebhookEvent(rawBody: string, signature: string) {
    const event = await this.stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      this.webhookSecret
    )
    return normalizeWebhookEvent(event)
  }
}

let gateway: BillingGateway | null = null

export function getBillingGateway(): BillingGateway {
  if (gateway) return gateway
  const config = getBillingConfig()
  if (!config.stripe.secretKey || !config.stripe.webhookSecret) {
    throw new Error('Stripe is not configured for this deployment.')
  }
  gateway = new StripeBillingGateway(
    config.stripe.secretKey,
    config.stripe.webhookSecret,
    config.stripe.portalConfigurationId,
    config.stripe.paymentMethodConfigurationId
  )
  return gateway
}

export function setBillingGatewayForTests(next: BillingGateway | null): void {
  gateway = next
}
