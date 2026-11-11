import {
  BILLING_INTERVALS,
  CAPACITY_LIMIT_KEYS,
  type CapacityLimitKey,
  exceededLimits,
  PLAN_CODES,
  PLANS,
  PURCHASABLE_PLAN_CODES,
  smallestPlanForUsage,
} from '@durabull/billing'
import { billingRepository, isOwnerRole } from '@durabull/dal'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { recordBillingEvent } from '../billing/analytics'
import {
  CheckoutRefusedError,
  cancelCheckoutAttempt,
  confirmCheckoutReturn,
  createPortalSession,
  listInvoices,
  MAX_TRIALS_PER_USER,
  startCheckout,
} from '../billing/checkout'
import { getBillingConfig, isBillingEnabled, TRIAL_PERIOD_DAYS } from '../billing/config'
import {
  type EffectiveEntitlement,
  getEntitlement,
  materializeEntitlementLocked,
} from '../billing/entitlements'
import { nudgeWebhookInbox } from '../billing/lifecycle'
import { reconcileOrganization } from '../billing/reconcile'
import {
  AllocationPreferenceError,
  allocateCapacity,
  findFoundingOwnerId,
} from '../billing/suspension'
import { getTransitionStatus } from '../billing/transition'
import { receiveStripeWebhook, WebhookSignatureError } from '../billing/webhooks'
import { requireOrganization } from '../middleware/auth'

function serializeDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

const OWNER_ONLY_MESSAGE =
  'Only the organization owner can manage billing. Ask your organization owner to upgrade.'

async function requireOwner(organizationId: string, userId: string | undefined) {
  if (!userId) return false
  const membership = await billingRepository.findMembership(organizationId, userId)
  return isOwnerRole(membership?.role)
}

const OWNER_REQUIRED_BODY = {
  error: 'Forbidden',
  message: OWNER_ONLY_MESSAGE,
  code: 'billing_owner_required',
} as const

function planName(entitlement: EffectiveEntitlement): string {
  return entitlement.planCode === 'self_hosted' ? 'Self-hosted' : PLANS[entitlement.planCode].name
}

type SubscriptionRow = Awaited<ReturnType<typeof billingRepository.findCurrentSubscription>>

/** The current subscription as shown to members: no Stripe identifiers. */
function serializeSubscription(subscription: SubscriptionRow) {
  if (!subscription) return null
  return {
    status: subscription.status,
    planCode: subscription.planCode,
    interval: subscription.billingInterval,
    currentPeriodEnd: serializeDate(subscription.currentPeriodEnd),
    // Flexible billing records Portal cancellations as cancel_at.
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || subscription.cancelAt !== null,
    cancelAt: serializeDate(
      subscription.cancelAt ??
        (subscription.cancelAtPeriodEnd ? subscription.currentPeriodEnd : null)
    ),
    trialEnd: serializeDate(subscription.trialEnd),
    collectionMethod: subscription.collectionMethod,
  }
}

/** The beta grant end, only while access actually comes from the grant. */
function activeMigrationGrant(entitlement: EffectiveEntitlement, now = new Date()): string | null {
  const expiresAt = entitlement.migrationGrantExpiresAt
  if (entitlement.source !== 'migration_grant' || !expiresAt) return null
  return expiresAt.getTime() > now.getTime() ? expiresAt.toISOString() : null
}

function checkoutRefusalStatus(error: CheckoutRefusedError): 400 | 409 | 503 {
  switch (error.reason) {
    case 'purchases_paused':
    case 'trials_unavailable':
      return 503
    case 'subscription_exists':
      return 409
    default:
      return 400
  }
}

/** Plan catalog as rendered by the billing page and upgrade prompts. */
function serializeCatalog() {
  return PLAN_CODES.map((code) => {
    const plan = PLANS[code]
    return {
      code,
      name: plan.name,
      description: plan.description,
      monthlyPriceUsd: plan.monthlyPriceUsd,
      annualPriceUsd: plan.annualPriceUsd,
      selfServe: plan.selfServe,
      features: [...plan.features],
      limits: plan.limits,
      support: plan.support,
    }
  })
}

const checkoutSchema = z.object({
  plan: z.enum(PURCHASABLE_PLAN_CODES),
  interval: z.enum(BILLING_INTERVALS),
  trial: z.boolean().optional(),
})

const portalSchema = z.object({
  intent: z.enum(['manage', 'payment_method', 'cancel', 'change_plan']).optional(),
  plan: z.enum(PURCHASABLE_PLAN_CODES).optional(),
  interval: z.enum(BILLING_INTERVALS).optional(),
})

const allocationSchema = z.object({
  keep: z.record(z.enum(CAPACITY_LIMIT_KEYS), z.array(z.string().min(1)).max(500)),
})

/**
 * Stripe webhook endpoint. No browser session: only valid Stripe-signed raw
 * requests are accepted. The body is read as raw text before any parsing so
 * the signature covers exactly what Stripe sent.
 */
export const billingWebhookRoutes = new Hono().post('/', async (c) => {
  if (!isBillingEnabled()) return c.json({ error: 'Billing is not enabled' }, 404)
  const rawBody = await c.req.text()
  try {
    const result = await receiveStripeWebhook(rawBody, c.req.header('stripe-signature'))
    nudgeWebhookInbox()
    return c.json({ received: true, duplicate: result.duplicate })
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      return c.json({ error: 'Invalid signature' }, 400)
    }
    throw error
  }
})

const app = new Hono()
  .use('*', requireOrganization)

  // What this organization may use right now. Small enough for every page to
  // load: the web app gates features and shows plan status from it.
  .get('/entitlement', async (c) => {
    const organizationId = c.get('organizationId')!
    const user = c.get('user')
    if (!isBillingEnabled()) {
      return c.json({ enabled: false as const, planCode: 'self_hosted' as const })
    }
    const [entitlement, usage, subscription, suspensions, membership] = await Promise.all([
      getEntitlement(organizationId),
      billingRepository.getUsage(organizationId),
      billingRepository.findCurrentSubscription(organizationId),
      billingRepository.listSuspensions(organizationId),
      user ? billingRepository.findMembership(organizationId, user.id) : null,
    ])
    return c.json({
      enabled: true as const,
      enforced: entitlement.enforced,
      planCode: entitlement.planCode,
      planName: planName(entitlement),
      subscribedPlanCode: entitlement.subscribedPlanCode,
      source: entitlement.source,
      degraded: entitlement.degraded,
      notices: entitlement.notices,
      features: entitlement.features,
      limits: entitlement.limits,
      usage,
      // Unenforced organizations have no paused resources to explain.
      suspended: entitlement.enforced
        ? suspensions.map((s) => ({ kind: s.resourceKind, id: s.resourceId }))
        : [],
      subscription: serializeSubscription(subscription),
      graceExpiresAt: serializeDate(entitlement.graceExpiresAt),
      capacityAdjustmentExpiresAt: serializeDate(entitlement.capacityAdjustmentExpiresAt),
      canManageBilling: isOwnerRole(membership?.role),
      // Beta transition banner: only after the notice was sent, until a plan is chosen.
      transition: await getTransitionStatus(organizationId, entitlement, subscription?.status),
    })
  })

  // Recent invoices with Stripe-hosted links, for the owner.
  .get('/invoices', async (c) => {
    if (!isBillingEnabled()) return c.json({ error: 'Billing is not enabled' }, 404)
    const organizationId = c.get('organizationId')!
    if (!(await requireOwner(organizationId, c.get('user')?.id))) {
      return c.json(OWNER_REQUIRED_BODY, 403)
    }
    try {
      const invoices = await listInvoices(organizationId)
      return c.json({
        invoices: invoices.map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          status: invoice.status,
          total: invoice.total,
          amountDue: invoice.amountDue,
          currency: invoice.currency,
          created: invoice.created.toISOString(),
          hostedInvoiceUrl: invoice.hostedInvoiceUrl,
          invoicePdf: invoice.invoicePdf,
        })),
      })
    } catch (error) {
      console.error(
        `[billing] Listing invoices failed for organization ${organizationId}:`,
        error instanceof Error ? error.message : String(error)
      )
      return c.json(
        {
          error: 'Invoices unavailable',
          message:
            'Invoices could not be loaded right now. Try again, or open Manage billing to see them on Stripe.',
          code: 'invoices_unavailable',
        },
        502
      )
    }
  })

  // Current member: safe plan, limits, usage and billing status.
  .get('/', async (c) => {
    const organizationId = c.get('organizationId')!
    const user = c.get('user')
    const config = getBillingConfig()
    const catalog = serializeCatalog()

    if (!isBillingEnabled()) {
      return c.json({
        enabled: false as const,
        planCode: 'self_hosted' as const,
        catalog,
      })
    }

    const [
      entitlement,
      usage,
      subscription,
      account,
      openAttempt,
      suspensions,
      membership,
      candidates,
    ] = await Promise.all([
      getEntitlement(organizationId),
      billingRepository.getUsage(organizationId),
      billingRepository.findCurrentSubscription(organizationId),
      billingRepository.findAccount(organizationId),
      billingRepository.findOpenCheckoutAttempt(organizationId),
      billingRepository.listSuspensions(organizationId),
      user ? billingRepository.findMembership(organizationId, user.id) : null,
      billingRepository.listCapacityCandidates(organizationId),
    ])

    // Only the founding owner is never paused; other owners count like any member.
    const foundingOwnerId = findFoundingOwnerId(candidates.members)

    const names = new Map<string, string>()
    for (const connection of candidates.connections)
      names.set(`connection:${connection.id}`, connection.name)
    for (const rule of candidates.rules) names.set(`alert_rule:${rule.id}`, rule.name)
    for (const destination of candidates.destinations) {
      names.set(`alert_destination:${destination.id}`, destination.name)
    }
    for (const account of candidates.serviceAccounts)
      names.set(`service_account:${account.id}`, account.name)
    for (const invitation of candidates.invitations)
      names.set(`invitation:${invitation.id}`, invitation.email)
    for (const memberRow of candidates.members)
      names.set(`member:${memberRow.id}`, memberRow.name || memberRow.email)

    // The owner chooses which resources stay enabled when the organization is
    // above a limit; every candidate is listed with its current state.
    const suspendedKeys = new Set(suspensions.map((s) => `${s.resourceKind}:${s.resourceId}`))
    const overLimit = exceededLimits(entitlement.limits, usage)
    const allocationOption = (kind: string, id: string, extra: { pinned?: boolean } = {}) => ({
      id,
      kind,
      name: names.get(`${kind}:${id}`) ?? id,
      suspended: suspendedKeys.has(`${kind}:${id}`),
      pinned: extra.pinned === true,
    })
    const allocation =
      entitlement.enforced && (overLimit.length > 0 || suspensions.length > 0)
        ? {
            'connections.enabled': candidates.connections.map((c) =>
              allocationOption('connection', c.id)
            ),
            'members.reserved': [
              ...candidates.members.map((m) =>
                allocationOption('member', m.id, { pinned: m.id === foundingOwnerId })
              ),
              ...candidates.invitations.map((i) => allocationOption('invitation', i.id)),
            ],
            // A rule on a paused connection cannot run whichever rules are
            // chosen, so it is not offered; restoring the connection brings it back.
            'alerts.enabled': candidates.rules
              .filter((r) => !suspendedKeys.has(`connection:${r.connectionId}`))
              .map((r) => allocationOption('alert_rule', r.id)),
            'alerts.destinations': candidates.destinations.map((d) =>
              allocationOption('alert_destination', d.id)
            ),
            'service_accounts.enabled': candidates.serviceAccounts.map((a) =>
              allocationOption('service_account', a.id)
            ),
          }
        : null

    const canManageBilling = isOwnerRole(membership?.role)
    const trialEligible =
      config.trialsEnabled &&
      !account?.trialConsumedAt &&
      !subscription &&
      // Checkout refuses trials for unverified emails, so do not offer one.
      (user?.emailVerified
        ? (await billingRepository.countTrialsStartedByUser(user.id)) < MAX_TRIALS_PER_USER
        : false)

    return c.json({
      enabled: true as const,
      enforcement: config.enforcement,
      enforced: entitlement.enforced,
      planCode: entitlement.planCode,
      planName: planName(entitlement),
      subscribedPlanCode: entitlement.subscribedPlanCode,
      source: entitlement.source,
      degraded: entitlement.degraded,
      notices: entitlement.notices,
      features: entitlement.features,
      limits: entitlement.limits,
      usage,
      overLimit,
      allocation,
      subscription: serializeSubscription(subscription),
      graceExpiresAt: serializeDate(entitlement.graceExpiresAt),
      capacityAdjustmentExpiresAt: serializeDate(entitlement.capacityAdjustmentExpiresAt),
      // Null once the grant has ended, so its notice does not outlive it.
      migrationGrantExpiresAt: activeMigrationGrant(entitlement),
      // Beta transition banner: only after the notice was sent, until a plan is chosen.
      transition: await getTransitionStatus(organizationId, entitlement, subscription?.status),
      historyRetentionFloorExpiresAt: serializeDate(entitlement.historyRetentionFloorExpiresAt),
      // Beta transition: the smallest plan that fits current usage, and what
      // Free would restrict, so owners see the exact impact before it applies.
      proposedPlanCode: smallestPlanForUsage(usage),
      freePlanExceeded: exceededLimits(PLANS.free.limits, usage),
      pendingCheckout: openAttempt
        ? {
            planCode: openAttempt.planCode,
            interval: openAttempt.billingInterval,
            trial: openAttempt.trial,
            createdAt: openAttempt.createdAt.toISOString(),
          }
        : null,
      suspended: suspensions.map((suspension) => ({
        kind: suspension.resourceKind,
        id: suspension.resourceId,
        name: names.get(`${suspension.resourceKind}:${suspension.resourceId}`) ?? null,
        since: suspension.createdAt.toISOString(),
      })),
      hasBillingAccount: account !== null,
      canManageBilling,
      purchasesEnabled: config.purchasesEnabled,
      trialEligible,
      trialDays: TRIAL_PERIOD_DAYS,
      catalog,
    })
  })

  .post('/checkout', zValidator('json', checkoutSchema), async (c) => {
    if (!isBillingEnabled()) return c.json({ error: 'Billing is not enabled' }, 404)
    const organizationId = c.get('organizationId')!
    const user = c.get('user')
    if (!user || !(await requireOwner(organizationId, user.id))) {
      return c.json(OWNER_REQUIRED_BODY, 403)
    }
    const organization = await billingRepository.findOrganization(organizationId)
    if (!organization) return c.json({ error: 'Organization not found' }, 404)
    const body = c.req.valid('json')
    try {
      const result = await startCheckout({
        organizationId,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        user: { id: user.id, email: user.email, emailVerified: user.emailVerified },
        planCode: body.plan,
        interval: body.interval,
        trial: body.trial === true,
      })
      return c.json(result)
    } catch (error) {
      if (error instanceof CheckoutRefusedError) {
        return c.json(
          { error: 'Checkout unavailable', message: error.message, code: error.reason },
          checkoutRefusalStatus(error)
        )
      }
      throw error
    }
  })

  .post(
    '/checkout/confirm',
    zValidator('json', z.object({ sessionId: z.string().min(1).max(255) })),
    async (c) => {
      if (!isBillingEnabled()) return c.json({ error: 'Billing is not enabled' }, 404)
      const organizationId = c.get('organizationId')!
      const { sessionId } = c.req.valid('json')
      const result = await confirmCheckoutReturn(organizationId, sessionId)
      return c.json(result)
    }
  )

  .post('/checkout/cancel', async (c) => {
    if (!isBillingEnabled()) return c.json({ error: 'Billing is not enabled' }, 404)
    const organizationId = c.get('organizationId')!
    const user = c.get('user')
    if (!user || !(await requireOwner(organizationId, user.id))) {
      return c.json(OWNER_REQUIRED_BODY, 403)
    }
    return c.json(await cancelCheckoutAttempt(organizationId))
  })

  .post('/portal', zValidator('json', portalSchema), async (c) => {
    if (!isBillingEnabled()) return c.json({ error: 'Billing is not enabled' }, 404)
    const organizationId = c.get('organizationId')!
    const user = c.get('user')
    if (!user || !(await requireOwner(organizationId, user.id))) {
      return c.json(OWNER_REQUIRED_BODY, 403)
    }
    const organization = await billingRepository.findOrganization(organizationId)
    if (!organization) return c.json({ error: 'Organization not found' }, 404)
    const body = c.req.valid('json')
    try {
      return c.json(
        await createPortalSession(
          organizationId,
          organization.slug,
          body.intent === 'change_plan'
            ? { intent: 'change_plan', plan: body.plan, interval: body.interval }
            : { intent: body.intent ?? 'manage' }
        )
      )
    } catch (error) {
      if (error instanceof CheckoutRefusedError) {
        return c.json(
          { error: 'Billing unavailable', message: error.message, code: error.reason },
          400
        )
      }
      throw error
    }
  })

  .post('/refresh', async (c) => {
    if (!isBillingEnabled()) return c.json({ error: 'Billing is not enabled' }, 404)
    const organizationId = c.get('organizationId')!
    const user = c.get('user')
    if (!user || !(await requireOwner(organizationId, user.id))) {
      return c.json(OWNER_REQUIRED_BODY, 403)
    }
    const result = await reconcileOrganization(organizationId, { reason: 'owner_refresh' })
    return c.json({ planCode: result.planCode })
  })

  // Owner chooses which resources remain enabled within the plan's limits.
  .put('/allocation', zValidator('json', allocationSchema), async (c) => {
    if (!isBillingEnabled()) return c.json({ error: 'Billing is not enabled' }, 404)
    const organizationId = c.get('organizationId')!
    const user = c.get('user')
    if (!user || !(await requireOwner(organizationId, user.id))) {
      return c.json(OWNER_REQUIRED_BODY, 403)
    }
    const entitlement = await getEntitlement(organizationId, { fresh: true })
    if (!entitlement.enforced) {
      return c.json(
        {
          error: 'Nothing to allocate',
          message: 'Plan limits are not enforced for this organization.',
        },
        409
      )
    }
    const { keep } = c.req.valid('json')
    for (const [limit, ids] of Object.entries(keep) as Array<[CapacityLimitKey, string[]]>) {
      const allowed = entitlement.limits[limit]
      if (allowed !== null && ids.length > allowed) {
        return c.json(
          {
            error: 'Too many resources selected',
            message: `Select at most ${allowed} for ${limit}.`,
            code: 'allocation_exceeds_limit',
          },
          400
        )
      }
    }
    // Only the limits the owner chose are applied now; anything else above a
    // limit keeps its adjustment window.
    try {
      const result = await billingRepository.withOrganizationLock(organizationId, async () => {
        const allocated = await allocateCapacity(organizationId, entitlement.limits, {
          preferences: keep,
          only: Object.keys(keep) as CapacityLimitKey[],
          reason: 'Owner allocation',
        })
        await materializeEntitlementLocked(organizationId, { reason: 'owner_allocation' })
        return allocated
      })
      return c.json({ suspended: result.suspended.length, restored: result.restored.length })
    } catch (error) {
      if (!(error instanceof AllocationPreferenceError)) throw error
      return c.json(
        {
          error: 'Rule on a paused connection',
          message: error.message,
          code: 'allocation_rule_connection_paused',
        },
        400
      )
    }
  })

  // Client-side upgrade prompts report impressions for funnel analysis.
  .post(
    '/events/upgrade-prompt',
    zValidator(
      'json',
      z.object({ feature: z.string().max(64).optional(), limit: z.string().max(64).optional() })
    ),
    async (c) => {
      const organizationId = c.get('organizationId')!
      if (isBillingEnabled()) {
        const body = c.req.valid('json')
        recordBillingEvent('upgrade_prompt_shown', organizationId, {
          feature: body.feature ?? null,
          limit_key: body.limit ?? null,
        })
      }
      return c.json({ ok: true })
    }
  )

export default app
